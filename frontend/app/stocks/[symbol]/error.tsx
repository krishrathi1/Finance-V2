"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function StockError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        <Link href="/" className="hover:text-text">
          Dashboard
        </Link>
      </p>
      <div className="rounded-2xl border border-border/70 bg-panel p-6">
        <h2 className="text-xl font-semibold">Unable to load this stock right now</h2>
        <p className="mt-2 text-sm text-muted">
          Live data or page rendering failed. Retry once, and if the issue continues use another symbol or try again in a few minutes.
        </p>
        {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
          <Link href="/" className="rounded-xl border border-border/70 px-4 py-2 text-sm font-semibold">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
