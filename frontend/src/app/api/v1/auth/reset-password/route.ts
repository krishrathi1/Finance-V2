import { NextRequest, NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/server/infrastructure/db';
import { hashPassword, verifyPasswordResetToken, normalizeEmail } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const { resetToken, newPassword, confirmPassword } = body;

    if (!email || !resetToken || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { detail: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { detail: 'Passwords do not match' },
        { status: 400 }
      );
    }

    // `typeof` first, matching the register route. Without it a non-string
    // body value reaches `.length`: a JSON number has none, so `undefined < 8`
    // and `undefined > 128` are both false and the check passes. bcrypt then
    // throws on the non-string and the user gets an opaque 500 instead of
    // being told their password is the wrong length.
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        { detail: 'Password must be between 8 and 128 characters' },
        { status: 400 }
      );
    }

    // Find user by email
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json(
        { detail: 'Invalid reset token' },
        { status: 401 }
      );
    }

    const user = users[0] as any;

    const verifiedToken = await verifyPasswordResetToken(resetToken);
    if (!verifiedToken || verifiedToken.userId !== user.id) {
      return NextResponse.json(
        { detail: 'Invalid reset token' },
        { status: 401 }
      );
    }

    // Atomically claim the reset token row: only one concurrent request can
    // delete it, so a racing duplicate request (same bearer resetToken) gets
    // 0 affected rows here instead of both requests setting a password.
    const claim = await query<ResultSetHeader>(
      'DELETE FROM password_reset_tokens WHERE id = ? AND user_id = ? AND is_used = true AND expires_at > NOW()',
      [verifiedToken.otpRecordId, user.id]
    );
    if (!claim || claim.affectedRows !== 1) {
      return NextResponse.json({ detail: 'Invalid reset token' }, { status: 401 });
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

    // Clear any other outstanding password reset tokens / sessions for this user.
    await query('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
    await query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]);

    return NextResponse.json(
      { detail: 'Password reset successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { detail: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
