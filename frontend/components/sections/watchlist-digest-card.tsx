"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchWatchlistDigest, type WatchlistDigest } from "@/lib/api";

export function WatchlistDigestCard({ listName, symbols }: { listName: string; symbols: string[] }) {
  const [digest, setDigest] = useState<WatchlistDigest | null>(null);
  const [loading, setLoading] = useState(false);

  // A digest is a snapshot for one list's current symbols — stale once either changes.
  useEffect(() => {
    setDigest(null);
  }, [listName, symbols.join(",")]);

  const handleGenerate = () => {
    if (!symbols.length || loading) return;
    setLoading(true);
    fetchWatchlistDigest(listName, symbols)
      .then(setDigest)
      .finally(() => setLoading(false));
  };

  return (
    <Card className="border-accent/20 bg-gradient-to-r from-accent/8 via-amber-500/5 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <div>
            <p className="text-sm font-semibold text-text">AI Watchlist Digest</p>
            <p className="text-xs text-muted">
              One brief covering every stock in &ldquo;{listName}&rdquo; — what moved, what it has in common, and what to check first.
            </p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={!symbols.length || loading}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {digest ? "Refresh" : "Generate"}
        </button>
      </CardHeader>

      {digest ? (
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-bg/40 p-3">
            <p className="text-sm font-semibold text-text">{digest.headline}</p>
            <Badge variant="outline" className="shrink-0 border-border/60 bg-panel/70 px-2 py-0.5 text-[11px] text-muted">
              {digest.source === "gemini" ? "Gemini" : "Fallback"}
            </Badge>
          </div>

          {digest.movers.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Movers</p>
              <div className="space-y-1.5">
                {digest.movers.map((m) => (
                  <div key={m.symbol} className="flex items-start gap-2 rounded-lg border border-border/40 bg-bg/30 px-3 py-2 text-xs">
                    <span className="mt-0.5 shrink-0 font-semibold text-accent">{m.symbol}</span>
                    <span className="text-muted">{m.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {digest.themes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Themes</p>
              <div className="flex flex-wrap gap-1.5">
                {digest.themes.map((theme, i) => (
                  <Badge key={i} variant="outline" className="border-border/50 bg-panel/60 px-2 py-1 text-[11px] text-text">
                    {theme}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {digest.focusList.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Check first</p>
              <div className="space-y-1.5">
                {digest.focusList.map((f, i) => (
                  <div key={f.symbol} className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
                    <span className="mt-0.5 shrink-0 font-bold text-accent">{i + 1}.</span>
                    <span>
                      <span className="font-semibold text-text">{f.symbol}</span>{" "}
                      <span className="text-muted">{f.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="border-t border-border/40 pt-3 text-xs leading-6 text-muted">{digest.summary}</p>
        </CardContent>
      ) : (
        <CardContent>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            {symbols.length ? (
              <>
                <TrendingUp className="h-3.5 w-3.5" />
                Ready when you are — tap Generate to get today&apos;s read on this list.
              </>
            ) : (
              <>
                <TrendingDown className="h-3.5 w-3.5" />
                Add stocks to this list to unlock the AI digest.
              </>
            )}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
