import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-border bg-panel p-6">
      <h2 className="text-xl font-semibold">Stock not found</h2>
      <p className="mt-2 text-sm text-muted">Try searching with NSE/BSE ticker, e.g. `HDFCBANK` or `RELIANCE`.</p>
      <Link href="/" className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">
        Back to search
      </Link>
    </div>
  );
}
