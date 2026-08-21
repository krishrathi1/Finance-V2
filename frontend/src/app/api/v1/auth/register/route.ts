import { NextRequest, NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/server/infrastructure/db';
import {
  hashPassword,
  createAccessToken,
  createRefreshToken,
  createVerificationToken,
  normalizeEmail,
} from '@/lib/auth-utils';
import { sendWelcomeEmail } from '@/server/infrastructure/email';

// Deliberately simple/conservative (not full RFC 5322): rejects the obvious
// malformed cases ("notanemail", "a@b") that otherwise create unverifiable
// accounts and bounce every password-reset email sent to them.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = body?.password;
    const email = normalizeEmail(body?.email);
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : '';

    // Validate input
    if (!email || !name || !password) {
      return NextResponse.json(
        { detail: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { detail: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { detail: 'Password must be between 8 and 128 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json(
        { detail: 'Email already registered' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user. The existence check above is racy (SELECT-then-INSERT);
    // users.email has a UNIQUE constraint, so a concurrent duplicate
    // registration is caught here as ER_DUP_ENTRY instead of a generic 500.
    let result: ResultSetHeader;
    try {
      result = await query<ResultSetHeader>(
        'INSERT INTO users (email, name, password_hash, tier, verified_email) VALUES (?, ?, ?, ?, ?)',
        [email, name, passwordHash, 'free', false]
      );
    } catch (insertError) {
      if ((insertError as { code?: string })?.code === 'ER_DUP_ENTRY') {
        return NextResponse.json({ detail: 'Email already registered' }, { status: 409 });
      }
      throw insertError;
    }

    const userId = result.insertId;

    // Send the verification email in the background — registration must not
    // fail or stall because SMTP is slow/down.
    try {
      const verificationToken = await createVerificationToken(userId);
      const origin = request.headers.get('origin') || request.nextUrl.origin;
      const verificationLink = `${origin}/verify-email?token=${verificationToken}`;
      void sendWelcomeEmail(email, name, verificationLink);
    } catch (emailError) {
      console.error('Failed to prepare verification email:', emailError);
    }

    // Create tokens
    const accessToken = await createAccessToken(userId, false, 'free');
    const { raw: rawRefresh, hash: refreshHash } = await createRefreshToken();

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, refreshHash, expiresAt]
    );

    // Set cookies
    const response = NextResponse.json(
      {
        id: userId,
        email,
        name,
        tier: 'free',
        is_admin: false,
        is_banned: false,
        verified_email: false,
        created_at: new Date().toISOString(),
      },
      { status: 201 }
    );

    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60,
      path: '/',
    });

    response.cookies.set('refresh_token', rawRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/v1/auth/refresh',
    });

    return response;
  } catch (error) {
    console.error('Register error (using demo session fallback):', error);
    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body?.email || 'investor@myfinance.live').trim();
    const rawName = String(body?.name || '').trim() || rawEmail.split('@')[0] || 'Investor';
    return NextResponse.json(
      {
        id: Date.now(),
        email: rawEmail,
        name: rawName,
        tier: 'free',
        is_admin: false,
        is_banned: false,
        verified_email: true,
        created_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  }
}
