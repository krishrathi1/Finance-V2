"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendOtpRequest, verifyOtpRequest, resetPasswordRequest } from "@/lib/forgot-password";

type Step = "email" | "otp" | "password" | "success";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    setLoading(true);
    const result = await sendOtpRequest(email);
    setLoading(false);

    if (result.success) {
      setSuccess(result.message);
      setTimeout(() => {
        setStep("otp");
        setSuccess("");
      }, 1500);
    } else {
      setError(result.error || "Failed to send OTP");
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (otp.length !== 6 || isNaN(Number(otp))) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    const result = await verifyOtpRequest(email, otp);
    setLoading(false);

    if (result.success && result.resetToken) {
      setResetToken(result.resetToken);
      setSuccess(result.message);
      setTimeout(() => {
        setStep("password");
        setSuccess("");
      }, 1500);
    } else {
      setError(result.error || "Invalid OTP");
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const result = await resetPasswordRequest(email, resetToken, newPassword, confirmPassword);
    setLoading(false);

    if (result.success) {
      setSuccess(result.message);
      setTimeout(() => {
        setStep("success");
        setSuccess("");
      }, 1500);
    } else {
      setError(result.error || "Failed to reset password");
    }
  };

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
        {step !== "success" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent/90">Forgot Password</p>
            <h1 className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text">Reset your password</h1>
            <p className="mt-2 text-sm text-muted">
              {step === "email" && "Enter your email to receive a verification code"}
              {step === "otp" && "Enter the 6-digit code sent to your email"}
              {step === "password" && "Create a new password for your account"}
            </p>
          </>
        )}

        {/* Success State */}
        {step === "success" && (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <svg className="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-text">Password Reset Successful!</h2>
            <p className="mt-2 text-sm text-muted">Your password has been updated. You can now login with your new password.</p>
            <Link
              href="/signin"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Back to Sign In
            </Link>
          </div>
        )}

        {/* Step 1: Email */}
        {step === "email" && (
          <form onSubmit={handleSendOtp} className="mt-6 space-y-3.5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}
            {success && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                {success}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="email">
                Email Address
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              type="submit"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        )}

        {/* Step 2: OTP */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-3.5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}
            {success && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                {success}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="otp">
                Verification Code
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-center text-lg font-bold text-text tracking-widest outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                id="otp"
                type="text"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={loading}
                maxLength={6}
              />
              <p className="mt-2 text-xs text-muted">Check your email for the 6-digit code (expires in 10 minutes)</p>
            </div>

            <button
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              type="submit"
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError("");
                setSuccess("");
              }}
              className="text-sm text-accent/80 hover:text-accent"
            >
              Back to email
            </button>
          </form>
        )}

        {/* Step 3: New Password */}
        {step === "password" && (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-3.5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
            )}
            {success && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                {success}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="new-password">
                New Password
              </label>
              <div className="relative">
                <input
                  className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 pr-10 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/60 hover:text-muted"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="confirm-password">
                Confirm Password
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              type="submit"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("otp");
                setNewPassword("");
                setConfirmPassword("");
                setError("");
                setSuccess("");
              }}
              className="text-sm text-accent/80 hover:text-accent"
            >
              Back to verification
            </button>
          </form>
        )}

        {step !== "success" && (
          <p className="mt-4 text-center text-xs text-muted">
            Remember your password?{" "}
            <Link className="font-semibold text-accent transition hover:opacity-80" href="/signin">
              Back to Sign In
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
