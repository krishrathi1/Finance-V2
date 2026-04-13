import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';

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

    if (newPassword.length < 6) {
      return NextResponse.json(
        { detail: 'Password must be at least 6 characters' },
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

    // Verify reset token (simple validation - in production use JWT)
    try {
      const decoded = Buffer.from(resetToken, 'base64').toString('utf-8');
      const [userId, timestamp] = decoded.split(':');

      if (parseInt(userId) !== user.id) {
        throw new Error('Invalid user ID in token');
      }

      // Check if token is still valid (5 minutes)
      const issuedTime = parseInt(timestamp);
      const currentTime = Date.now();
      if (currentTime - issuedTime > 5 * 60 * 1000) {
        return NextResponse.json(
          { detail: 'Reset token has expired' },
          { status: 401 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { detail: 'Invalid reset token' },
        { status: 401 }
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

    // Clear all password reset tokens for this user
    await query('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);

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
