import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyEmailToken } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ detail: 'Verification token missing' }, { status: 400 });
    }

    const userId = await verifyEmailToken(token);
    if (!userId) {
      return NextResponse.json(
        { detail: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    const rows = await query('SELECT id, verified_email FROM users WHERE id = ?', [userId]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ detail: 'User not found' }, { status: 404 });
    }

    if (rows[0].verified_email) {
      return NextResponse.json({ msg: 'Email already verified' });
    }

    await query('UPDATE users SET verified_email = TRUE WHERE id = ?', [userId]);
    return NextResponse.json({ msg: 'Email successfully verified' });
  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json({ detail: 'Email verification failed' }, { status: 500 });
  }
}
