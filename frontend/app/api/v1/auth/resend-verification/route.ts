import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createVerificationToken, normalizeEmail } from '@/lib/auth-utils';
import { sendWelcomeEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// If the one-shot welcome/verification email sent at registration is lost
// (SMTP outage, spam filter), a user previously had no self-service way to
// get a new one. Same anti-enumeration shape as forgot-password: identical
// response regardless of whether the email exists or is already verified,
// and the send itself is fire-and-forget so SMTP latency isn't observable.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);

    if (!email) {
      return NextResponse.json({ detail: 'Email is required' }, { status: 400 });
    }

    const emailLimit = await rateLimit(`resend-verify:email:${email}`, 3, 15 * 60_000);
    if (!emailLimit.ok) {
      return NextResponse.json(
        { detail: 'If this email exists and is unverified, a new verification email has been sent' },
        { status: 200 }
      );
    }

    const users = await query('SELECT id, name, verified_email FROM users WHERE email = ?', [email]);
    const user = Array.isArray(users) && users.length > 0 ? (users[0] as any) : null;

    if (user && !user.verified_email) {
      const verificationToken = await createVerificationToken(user.id);
      const origin = request.headers.get('origin') || request.nextUrl.origin;
      const verificationLink = `${origin}/verify-email?token=${verificationToken}`;
      sendWelcomeEmail(email, user.name, verificationLink).catch((error) => {
        console.error('Failed to send resend-verification email:', error);
      });
    }

    return NextResponse.json(
      {
        detail: 'If this email exists and is unverified, a new verification email has been sent',
        message: 'Check your inbox for the verification link.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ detail: 'Failed to process request' }, { status: 500 });
  }
}
