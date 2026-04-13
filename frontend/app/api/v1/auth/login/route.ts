import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, createAccessToken, createRefreshToken } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { detail: 'Missing email or password' },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { detail: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = users[0] as any;

    // Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json(
        { detail: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if banned
    if (user.is_banned) {
      return NextResponse.json(
        { detail: 'This account has been banned' },
        { status: 403 }
      );
    }

    // Create tokens
    const accessToken = createAccessToken(user.id, user.is_admin, user.tier);
    const { raw: rawRefresh, hash: refreshHash } = await createRefreshToken();

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshHash, expiresAt]
    );

    // Set cookies
    const response = NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        is_admin: user.is_admin,
        is_banned: user.is_banned,
        verified_email: user.verified_email,
        created_at: user.created_at,
      },
      { status: 200 }
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
    console.error('Login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json(
      {
        detail: errorMessage,
        error: process.env.NODE_ENV === 'development' ? String(error) : 'Internal server error'
      },
      { status: 500 }
    );
  }
}
