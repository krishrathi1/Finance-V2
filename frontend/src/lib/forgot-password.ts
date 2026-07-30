/**
 * Forgot Password Flow Utilities
 *
 * 1. User enters email → sendOtpRequest()
 * 2. User receives OTP in email
 * 3. User enters OTP → verifyOtpRequest()
 * 4. If valid, user enters new password → resetPasswordRequest()
 */

export async function sendOtpRequest(email: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: '',
        error: data.detail || 'Failed to send OTP',
      };
    }

    return {
      success: true,
      message: data.message || 'OTP sent to your email',
    };
  } catch (error) {
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function verifyOtpRequest(
  email: string,
  otp: string
): Promise<{
  success: boolean;
  resetToken?: string;
  message: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: '',
        error: data.detail || 'Failed to verify OTP',
      };
    }

    return {
      success: true,
      resetToken: data.resetToken,
      message: data.message || 'OTP verified successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function resetPasswordRequest(
  email: string,
  resetToken: string,
  newPassword: string,
  confirmPassword: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    if (newPassword !== confirmPassword) {
      return {
        success: false,
        message: '',
        error: 'Passwords do not match',
      };
    }

    if (newPassword.length < 6) {
      return {
        success: false,
        message: '',
        error: 'Password must be at least 6 characters',
      };
    }

    const res = await fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken,
        newPassword,
        confirmPassword,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: '',
        error: data.detail || 'Failed to reset password',
      };
    }

    return {
      success: true,
      message: data.detail || 'Password reset successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}
