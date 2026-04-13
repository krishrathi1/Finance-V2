import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendOtpEmail } from '@/lib/email';

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { detail: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (!Array.isArray(users) || users.length === 0) {
      // Don't reveal if email exists or not (security best practice)
      return NextResponse.json(
        { detail: 'If this email exists, an OTP has been sent' },
        { status: 200 }
      );
    }

    const user = users[0] as any;
    const otp = generateOTP();

    // Store OTP in database (expires in 10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await query(
      'INSERT INTO password_reset_tokens (user_id, otp, expires_at) VALUES (?, ?, ?)',
      [user.id, otp, expiresAt]
    );

    // Send OTP email
    await sendOtpEmail(user.email, otp, user.name);

    return NextResponse.json(
      {
        detail: 'OTP sent to your email address',
        message: 'Check your email for the 6-digit OTP. Valid for 10 minutes.'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { detail: 'Failed to process forgot password request' },
      { status: 500 }
    );
  }
}
