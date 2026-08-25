"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, loading } = useAuth();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      await signUp(formData.name, formData.email, formData.password);
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
        {isSuccess ? (
          <div className="text-center py-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-6">
              <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-[var(--font-space)] text-2xl font-bold text-text mb-2">Check your email</h1>
            <p className="text-muted text-sm px-4">
              We've sent a verification link to <span className="text-text font-medium">{formData.email}</span>. 
              Please verify your account to get started.
            </p>
            <button
              onClick={() => router.push("/signin")}
              className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent/90">Start now</p>
            <h1 className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text">Create account</h1>
            <p className="mt-2 text-sm text-muted">Build your watchlist, track holdings, and save AI insights.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="name">
                  Full name
                </label>
                <input
                  className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                  id="name"
                  name="name"
                  placeholder="Your name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="email">
                  Email
                </label>
                <input
                  className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                  id="email"
                  name="email"
                  placeholder="you@example.com"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 pr-10 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                    id="password"
                    name="password"
                    placeholder="Create password (min 8 chars)"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                <p className="mt-1 text-xs text-muted/60">At least 8 characters required</p>
              </div>

              <button
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                type="submit"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-muted">
              Already have an account?{" "}
              <Link className="font-semibold text-accent transition hover:opacity-80" href="/signin">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
