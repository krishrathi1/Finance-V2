import { NextRequest, NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/lib/db';
import { createPasswordResetToken, normalizeEmail } from '@/lib/auth-utils';
import { createHash } from 'node:crypto';

/** Same pattern as refresh-token hashing: password_reset_tokens.otp stores a hash, not the raw code. */
function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const otp = body?.otp;

    if (!email || !otp) {
      return NextResponse.json(
        { detail: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ detail: 'Invalid or expired OTP' }, { status: 401 });
    }

    const user = users[0] as any;

    // Find valid OTP
    const otpRecords = await query(
      'SELECT * FROM password_reset_tokens WHERE user_id = ? AND is_used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );

    if (!Array.isArray(otpRecords) || otpRecords.length === 0) {
      return NextResponse.json(
        { detail: 'Invalid or expired OTP' },
        { status: 401 }
      );
    }

    const otpRecord = otpRecords[0] as any;
    if (String(otpRecord.otp) !== hashOtp(String(otp))) {
      await query(
        'UPDATE password_reset_tokens SET failed_attempts = failed_attempts + 1, is_used = (failed_attempts + 1 >= 5) WHERE id = ?',
        [otpRecord.id]
      );
      return NextResponse.json({ detail: 'Invalid or expired OTP' }, { status: 401 });
    }

    // Atomically claim the OTP: only one concurrent request can flip
    // is_used = false -> true, so a racing duplicate request gets 0 affected
    // rows here instead of both requests receiving a valid reset token.
    const claim = await query<ResultSetHeader>(
      'UPDATE password_reset_tokens SET is_used = true WHERE id = ? AND is_used = false',
      [otpRecord.id]
    );
    if (!claim || claim.affectedRows !== 1) {
      return NextResponse.json({ detail: 'Invalid or expired OTP' }, { status: 401 });
    }

    // Return a temporary reset token (valid for 5 minutes)
    const resetToken = await createPasswordResetToken(user.id, otpRecord.id);

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
