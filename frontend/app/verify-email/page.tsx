"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. No token provided.");
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`/api/v1/auth/verify-email?token=${token}`);
        const data = await res.json();

        if (res.ok) {
          setStatus("success");
          setMessage(data.msg || "Your email has been successfully verified!");
        } else {
          setStatus("error");
          setMessage(data.detail || "Verification failed. The link may be expired or invalid.");
        }
      } catch (err) {
        setStatus("error");
        setMessage("An unexpected error occurred. Please try again later.");
      }
    };

    verify();
  }, [token]);

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border/60 bg-panel/70 p-8 shadow-xl backdrop-blur-sm text-center">
        {status === "loading" && (
          <div className="py-8">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent mb-6"></div>
            <h1 className="text-xl font-bold text-text mb-2 font-[var(--font-space)]">Verifying...</h1>
            <p className="text-muted text-sm">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-6">
              <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text mb-2 font-[var(--font-space)]">Success!</h1>
            <p className="text-muted text-sm mb-8">{message}</p>
            <Link
              href="/signin"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Sign in to your account
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 mb-6">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text mb-2 font-[var(--font-space)]">Verification Failed</h1>
            <p className="text-muted text-sm mb-8">{message}</p>
            <div className="space-y-4">
              <Link
                href="/signup"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Try signing up again
              </Link>
              <Link
                href="/"
                className="block text-sm text-accent hover:underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
