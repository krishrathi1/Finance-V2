import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value;

    // Delete refresh token from database if it exists
    if (refreshToken) {
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('DELETE FROM refresh_tokens WHERE token_hash = ?', [hash]);
    }

    // Clear cookies
    const response = NextResponse.json(null, { status: 204 });
    response.cookies.set('access_token', '', { expires: new Date(0), path: '/' });
    response.cookies.set('refresh_token', '', {
      expires: new Date(0),
      path: '/api/v1/auth/refresh',
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { detail: 'Logout failed' },
      { status: 500 }
    );
  }
}
