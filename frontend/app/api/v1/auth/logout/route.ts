import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // Delete refresh token from database if it exists. A DB failure here must
  // not stop the cookies below from clearing — the client treats this
  // request as "always succeeds" and immediately wipes local session state,
  // so a 500 with the httpOnly cookies still intact would leave the UI
  // claiming "logged out" while the server-side session stays live.
  if (refreshToken) {
    try {
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('DELETE FROM refresh_tokens WHERE token_hash = ?', [hash]);
    } catch (error) {
      console.error('Logout error (refresh token row not deleted, cookies still cleared):', error);
    }
  }

  // A 204 response must not have a body — NextResponse.json(null, ...) sends
  // one anyway (the 4-byte string "null"), which throws at the Fetch-spec
  // validation layer instead of silently being accepted.
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set('access_token', '', { expires: new Date(0), path: '/' });
  response.cookies.set('refresh_token', '', {
    expires: new Date(0),
    path: '/api/v1/auth/refresh',
  });

  return response;
}
