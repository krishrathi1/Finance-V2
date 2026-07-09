import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendOtpEmail } from '@/lib/email';
import { randomInt } from 'node:crypto';
import { rateLimit } from '@/lib/rate-limit';

function generateOTP(): string {
  return randomInt(100000, 1000000).toString();
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

    // Per-account limit, independent of the middleware's per-IP limit — stops
    // an attacker distributed across many IPs from OTP-bombing one inbox.
    // Applied before the user lookup so it's identical regardless of whether
    // the email is registered (no enumeration signal).
    const emailKey = String(email).trim().toLowerCase();
    const emailLimit = await rateLimit(`forgot:email:${emailKey}`, 5, 15 * 60_000);
    if (!emailLimit.ok) {
      return NextResponse.json(
        { detail: 'If this email exists, an OTP has been sent' },
        { status: 200 }
      );
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    const user = Array.isArray(users) && users.length > 0 ? (users[0] as any) : null;
    const otp = generateOTP();

    // Store OTP in database (expires in 10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    if (user) {
      await query(
        'UPDATE password_reset_tokens SET is_used = true WHERE user_id = ? AND is_used = false',
        [user.id]
      );
      await query(
        'INSERT INTO password_reset_tokens (user_id, otp, expires_at) VALUES (?, ?, ?)',
        [user.id, otp, expiresAt]
      );
      // Fire-and-forget: don't let the caller observe SMTP latency (or an SMTP
      // outage) via response time/status — both leak whether the email exists.
      sendOtpEmail(user.email, otp, user.name).catch((error) => {
        console.error('Failed to send OTP email:', error);
      });
    } else {
      // Do equivalent-cost dummy work so response timing doesn't reveal
      // whether the email is registered.
      await query('SELECT 1 FROM password_reset_tokens WHERE user_id = -1 AND is_used = false', []);
    }

    // Same response, same timing, regardless of whether the email exists.
    return NextResponse.json(
      {
        detail: 'If this email exists, an OTP has been sent',
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
