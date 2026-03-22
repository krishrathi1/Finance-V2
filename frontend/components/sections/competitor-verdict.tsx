"use client";

import { Crown, Sparkles, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { useCallback, useState } from "react";

import { fetchCompetitorVerdict } from "@/lib/api";

type Verdict = {
  winner: string;
  winnerReason: string;
  verdict: string;
  subjectRating: "Overvalued" | "Fairly Valued" | "Undervalued";
  watchOut: string;
};

const RATING_STYLE: Record<string, string> = {
  Undervalued: "text-success border-success/40 bg-success/10",
  "Fairly Valued": "text-accent border-accent/40 bg-accent/10",
  Overvalued: "text-danger border-danger/40 bg-danger/10",
};

export function CompetitorVerdict({ symbol }: { symbol: string }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCompetitorVerdict(symbol);
      setVerdict({
        winner: String(data.winner ?? ""),
        winnerReason: String(data.winnerReason ?? ""),
        verdict: String(data.verdict ?? ""),
        subjectRating: (data.subjectRating as Verdict["subjectRating"]) ?? "Fairly Valued",
        watchOut: String(data.watchOut ?? ""),
      });
    } catch {
      setError("AI verdict unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  if (!verdict) {
    return (
      <div className="mt-4">
        <button
          onClick={handleFetch}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/5 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              AI is analysing competitors…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Get AI Verdict — Who Wins This Sector?
            </>
          )}
        </button>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const ratingClass = RATING_STYLE[verdict.subjectRating] ?? RATING_STYLE["Fairly Valued"];

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-purple-500/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <p className="text-sm font-semibold text-accent">AI Competitor Verdict</p>
        <span className={`ml-auto rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${ratingClass}`}>
          {symbol.toUpperCase()} is {verdict.subjectRating}
        </span>
      </div>

      {/* Verdict summary */}
      <p className="text-sm leading-5 text-muted">{verdict.verdict}</p>

      {/* Winner */}
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5">
        <Crown className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-xs font-semibold text-success">Best Value Right Now: {verdict.winner}</p>
          <p className="mt-0.5 text-xs text-muted">{verdict.winnerReason}</p>
        </div>
      </div>

      {/* Watch out */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <p className="text-xs font-semibold text-amber-400">Watch Out for {symbol.toUpperCase()}</p>
          <p className="mt-0.5 text-xs text-muted">{verdict.watchOut}</p>
        </div>
      </div>

      <p className="text-[10px] text-muted/60">AI-generated analysis. Not investment advice. Refresh for updated verdict.</p>
    </div>
  );
}
