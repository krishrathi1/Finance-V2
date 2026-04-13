import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAccessToken, getAccessTokenFromRequest } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const token = getAccessTokenFromRequest(request);

    if (!token) {
      return NextResponse.json(
        { detail: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify token
    const payload = await verifyAccessToken(token);
    if (!payload || !payload.sub) {
      return NextResponse.json(
        { detail: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = parseInt(payload.sub as string);

    // Get user from database
    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { detail: 'User not found' },
        { status: 404 }
      );
    }

    const user = users[0] as any;

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      is_admin: user.is_admin,
      is_banned: user.is_banned,
      verified_email: user.verified_email,
      created_at: user.created_at,
    });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch user info' },
      { status: 500 }
    );
  }
}
