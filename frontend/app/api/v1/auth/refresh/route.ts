import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createAccessToken, createRefreshToken } from '@/lib/auth-utils';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { detail: 'Refresh token missing' },
        { status: 401 }
      );
    }

    // Hash the refresh token and look it up
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const tokens = await query(
      'SELECT * FROM refresh_tokens WHERE token_hash = ?',
      [tokenHash]
    );

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json(
        { detail: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    const tokenRecord = tokens[0] as any;

    // Check if expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      await query('DELETE FROM refresh_tokens WHERE id = ?', [tokenRecord.id]);
      return NextResponse.json(
        { detail: 'Refresh token expired' },
        { status: 401 }
      );
    }

    // Get user
    const users = await query('SELECT * FROM users WHERE id = ?', [tokenRecord.user_id]);

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { detail: 'User not found' },
        { status: 401 }
      );
    }

    const user = users[0] as any;

    if (user.is_banned) {
      return NextResponse.json(
        { detail: 'User is banned' },
        { status: 401 }
      );
    }

    // Create new tokens
    const newAccessToken = await createAccessToken(user.id, user.is_admin, user.tier);
    const { raw: rawRefresh, hash: refreshHash } = await createRefreshToken();

    // Delete old refresh token and store new one
    await query('DELETE FROM refresh_tokens WHERE id = ?', [tokenRecord.id]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshHash, expiresAt]
    );

    // Set new cookies
    const response = NextResponse.json(
      { access_token: newAccessToken, token_type: 'bearer' },
      { status: 200 }
    );

    response.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 60,
      path: '/',
    });

    response.cookies.set('refresh_token', rawRefresh, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/v1/auth/refresh',
    });

    return response;
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      { detail: 'Token refresh failed' },
      { status: 500 }
    );
  }
}
