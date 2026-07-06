import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword, verifyPasswordResetToken } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    const { email, resetToken, newPassword, confirmPassword } = await request.json();

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

    if (newPassword.length < 8 || newPassword.length > 128) {
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

    const verifiedOtpRows = await query(
      'SELECT id FROM password_reset_tokens WHERE id = ? AND user_id = ? AND is_used = true AND expires_at > NOW() LIMIT 1',
      [verifiedToken.otpRecordId, user.id]
    );
    if (!Array.isArray(verifiedOtpRows) || verifiedOtpRows.length === 0) {
      return NextResponse.json({ detail: 'Invalid reset token' }, { status: 401 });
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

    // Clear all password reset tokens for this user
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
