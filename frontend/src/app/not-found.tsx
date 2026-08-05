import Link from "next/link";

/**
 * Global 404. Without this, an unmatched route falls back to Next's built-in
 * error page, which renders unstyled and outside the app's own chrome.
 *
 * The stock detail route keeps its own more specific not-found (a bad ticker
 * deserves a ticker-shaped message); this catches everything else.
 */
export default function NotFound() {
  const destinations = [
    { href: "/screener", label: "Screener", hint: "Filter NSE and BSE stocks" },
    { href: "/compare", label: "Compare", hint: "Put two companies side by side" },
    { href: "/ipo", label: "IPO", hint: "Upcoming and recent listings" },
  ] as const;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text sm:text-3xl">
        This page doesn&apos;t exist
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        The link may be out of date, or the address may have a typo. Nothing was lost — your account
        and data are unaffected.
      </p>

      <Link
        href="/"
        className="mt-7 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
      >
        Back to home
      </Link>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {destinations.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="rounded-2xl border border-border bg-panel p-4 text-left transition-colors hover:border-accent/50"
          >
            <p className="text-sm font-semibold text-text">{d.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{d.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
