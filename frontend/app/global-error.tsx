"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text">
        <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
          <div className="rounded-2xl border border-border/70 bg-panel p-6">
            <h2 className="text-xl font-semibold">Application error</h2>
            <p className="mt-2 text-sm text-muted">
              An unexpected error occurred. Retry once, then reload the page if needed.
            </p>
            {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
