import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json(
        { detail: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { detail: 'User not found' },
        { status: 404 }
      );
    }

    const user = users[0] as any;

    // Find valid OTP
    const otpRecords = await query(
      'SELECT * FROM password_reset_tokens WHERE user_id = ? AND otp = ? AND is_used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [user.id, otp]
    );

    if (!Array.isArray(otpRecords) || otpRecords.length === 0) {
      return NextResponse.json(
        { detail: 'Invalid or expired OTP' },
        { status: 401 }
      );
    }

    const otpRecord = otpRecords[0] as any;

    // Mark OTP as used
    await query('UPDATE password_reset_tokens SET is_used = true WHERE id = ?', [otpRecord.id]);

    // Return a temporary reset token (valid for 5 minutes)
    const resetToken = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');

    return NextResponse.json(
      {
        detail: 'OTP verified successfully',
        resetToken: resetToken,
        message: 'You can now reset your password'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { detail: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
