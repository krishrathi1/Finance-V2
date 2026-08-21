"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signIn, loading } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  if (user) {
    return (
      <section className="mx-auto max-w-md text-center">
        <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7 space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-text">You are already signed in</h2>
          <p className="text-xs text-muted">Welcome back, <span className="font-semibold text-accent">{user.name}</span>!</p>
          <button
            onClick={() => router.push(searchParams.get("next") || "/dashboard")}
            className="w-full h-11 rounded-xl bg-accent text-sm font-semibold text-white transition hover:opacity-90"
          >
            Go to Dashboard
          </button>
        </div>
      </section>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (!formData.password) {
      setError("Password is required");
      return;
    }

    try {
      await signIn(formData.email, formData.password);

      // Redirect to next param or dashboard
      const next = searchParams.get("next") || "/dashboard";
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent/90">Welcome back</p>
        <h1 className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text">Sign in</h1>
        <p className="mt-2 text-sm text-muted">Use your email to access your dashboard and watchlist.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

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
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted" htmlFor="password">
                Password
              </label>
              <Link href="/reset-password" className="text-xs text-accent/80 hover:text-accent">
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <input
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 pr-10 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                id="password"
                name="password"
                placeholder="Enter password"
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
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-border/60 bg-bg/60 text-accent"
              disabled={loading}
            />
            <span className="text-xs text-muted">Remember me</span>
          </label>

          <button
            className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          New here?{" "}
          <Link className="font-semibold text-accent transition hover:opacity-80" href="/signup">
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <section className="mx-auto max-w-md">
        <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
          <div className="shimmer h-4 w-28 rounded-full" />
          <div className="shimmer mt-4 h-8 w-32 rounded-full" />
          <div className="mt-6 space-y-3.5">
            <div className="shimmer h-11 rounded-xl" />
            <div className="shimmer h-11 rounded-xl" />
            <div className="shimmer h-11 rounded-xl" />
          </div>
        </div>
      </section>
    }>
      <SignInContent />
    </Suspense>
  );
}
