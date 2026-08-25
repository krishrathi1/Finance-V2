"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChartLine, Heart, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiPost } from "@/lib/api";
import { fmtInr } from "@/lib/types";
import { useApp, usePolling } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StockSearch } from "@/components/shared/stock-search";
import { SectionHeading, AiSourceBadge, MarkdownLite } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";

interface DigestResult {
  digest: string;
  source: "ai" | "fallback";
}

export function WatchlistView() {
  const watchlist = useApp((s) => s.watchlist);
  const addToWatchlist = useApp((s) => s.addToWatchlist);
  const removeFromWatchlist = useApp((s) => s.removeFromWatchlist);
  const setWatchlistNote = useApp((s) => s.setWatchlistNote);
  const inWatchlist = useApp((s) => s.inWatchlist);
  const refreshLive = useApp((s) => s.refreshLive);
  const openStock = useApp((s) => s.openStock);
  const setView = useApp((s) => s.setView);

  usePolling(() => {
    void refreshLive();
  }, 20000);

  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);

  const handleAdd = async (symbol: string) => {
    const sym = symbol.toUpperCase();
    if (inWatchlist(sym)) {
      toast.error(`${sym} is already on your watchlist`);
      return;
    }
    await addToWatchlist(sym);
    toast.success(`Added ${sym} to watchlist`);
  };

  const handleRemove = async (symbol: string) => {
    await removeFromWatchlist(symbol);
    setDigest((d) => (d && watchlist.length <= 1 ? null : d));
    toast.success(`Removed ${symbol} from watchlist`);
  };

  const generateDigest = async () => {
    if (watchlist.length === 0 || digestLoading) return;
    setDigestLoading(true);
    try {
      const res = await apiPost<DigestResult>("/api/ai/analysis", {
        type: "watchlist-digest",
        symbols: watchlist.map((w) => w.symbol),
      });
      setDigest(res);
    } catch {
      toast.error("Could not generate the digest — please try again");
    } finally {
      setDigestLoading(false);
    }
  };

  return (
    <section aria-label="Watchlist" className="space-y-4">
      <SectionHeading
        icon={Heart}
        kicker="Tracking"
        title="My Watchlist"
        right={
          <span className="rounded-full border border-border/50 bg-panel/70 px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {watchlist.length} {watchlist.length === 1 ? "stock" : "stocks"}
          </span>
        }
      />

      {/* Add row */}
      <div className="rounded-2xl border border-border/50 bg-panel/60 p-4">
        <StockSearch placeholder="Add a stock to your watchlist…" onSelect={(s) => void handleAdd(s)} />
      </div>

      {/* AI digest */}
      <div className="rounded-2xl border border-border/50 bg-panel/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden />
            <h3 className="font-display text-sm font-bold text-text">AI Watchlist Digest</h3>
            {digest && <AiSourceBadge source={digest.source} />}
          </div>
          {watchlist.length > 0 && (
            <Button
              onClick={() => void generateDigest()}
              disabled={digestLoading}
              variant="outline"
              size="sm"
              className="border-brand/40 text-brand hover:bg-brand/10 hover:text-brand"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {digestLoading ? "Thinking…" : "Generate AI Digest"}
            </Button>
          )}
        </div>

        {digestLoading ? (
          <div className="space-y-2.5" aria-live="polite" aria-busy="true">
            <Skeleton className="shimmer h-4 w-2/3" />
            <Skeleton className="shimmer h-4 w-5/6" />
            <Skeleton className="shimmer h-4 w-1/2" />
          </div>
        ) : digest ? (
          <MarkdownLite text={digest.digest} />
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            {watchlist.length > 0
              ? "One tap gives you a morning brief on everything you track — movers, momentum and what to watch."
              : "Add stocks to your watchlist to unlock an AI-generated morning digest."}
          </p>
        )}
      </div>

      {/* List */}
      {watchlist.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-bold text-text">Your watchlist is empty</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Search any NSE stock above to start tracking live prices, notes and AI digests.
          </p>
          <Button
            onClick={() => setView("screener")}
            className="shine-btn mt-5 bg-brand text-white hover:bg-brand/90"
          >
            Browse Screener
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Watchlist stocks">
          {watchlist.map((w, i) => (
            <motion.li
              key={w.symbol}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
              className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-panel/60 p-4 transition hover:border-brand/25 sm:flex-row sm:items-center"
            >
              {/* identity */}
              <div className="min-w-0 sm:w-44">
                <button
                  onClick={() => openStock(w.symbol)}
                  className="font-display text-base font-bold text-text transition hover:text-brand"
                >
                  {w.symbol}
                </button>
                <p className="truncate text-xs text-muted-foreground" title={w.name}>
                  {w.name}
                </p>
              </div>

              {/* price */}
              <div className="flex items-center gap-2 sm:w-44">
                <span className="font-display text-base font-bold tabular-nums text-text">
                  {fmtInr(w.price)}
                </span>
                <ChangePill size="sm" value={w.changePercent} />
              </div>

              {/* note */}
              <Input
                className="h-8 min-w-[180px] flex-1 text-xs"
                placeholder="Add a note…"
                defaultValue={w.note ?? ""}
                onBlur={(e) => void setWatchlistNote(w.symbol, e.target.value)}
                aria-label={`Note for ${w.symbol}`}
              />

              {/* actions */}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openStock(w.symbol)}>
                  <ChartLine className="h-3.5 w-3.5" aria-hidden />
                  Analyze
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-danger"
                  onClick={() => void handleRemove(w.symbol)}
                  aria-label={`Remove ${w.symbol} from watchlist`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}
