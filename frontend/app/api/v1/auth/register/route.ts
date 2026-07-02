import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  hashPassword,
  createAccessToken,
  createRefreshToken,
  createVerificationToken,
} from '@/lib/auth-utils';
import { sendWelcomeEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json();

    // Validate input
    if (!email || !name || !password) {
      return NextResponse.json(
        { detail: 'Missing required fields' },
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

    // Create user
    const result = await query(
      'INSERT INTO users (email, name, password_hash, tier, verified_email) VALUES (?, ?, ?, ?, ?)',
      [email, name, passwordHash, 'free', false]
    );

    const userId = (result as any).insertId;

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
    console.error('Register error:', error);
    return NextResponse.json(
      { detail: 'Registration failed' },
      { status: 500 }
    );
  }
}
