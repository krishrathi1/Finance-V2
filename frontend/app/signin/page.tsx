import Link from "next/link";

export default function SignInPage() {
  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent/90">Welcome back</p>
        <h1 className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text">Sign in</h1>
        <p className="mt-2 text-sm text-muted">Use your email to access your dashboard and watchlist.</p>

        <form className="mt-6 space-y-3.5">
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
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="password">
              Password
            </label>
            <input
              className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              id="password"
              name="password"
              placeholder="Enter password"
              type="password"
            />
          </div>
          <button
            className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
            type="button"
          >
            Continue
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
