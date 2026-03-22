"use client";

import { BookOpen, CheckCircle, Sparkles, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useCallback, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEarningsTldr } from "@/lib/api";

type TldrData = {
  headline: string;
  trend: string;
  toneColor: string;
  bullets: string[];
  ceoSignal: string;
  watchNext: string;
};

const TREND_ICONS: Record<string, React.ReactNode> = {
  Accelerating: <TrendingUp className="h-4 w-4 text-success" />,
  Recovering: <TrendingUp className="h-4 w-4 text-accent" />,
  Stable: <Minus className="h-4 w-4 text-muted" />,
  Decelerating: <TrendingDown className="h-4 w-4 text-amber-400" />,
  Declining: <TrendingDown className="h-4 w-4 text-danger" />,
};

const TONE_BORDER: Record<string, string> = {
  green: "border-success/30 bg-success/5",
  amber: "border-amber-400/30 bg-amber-400/5",
  red: "border-danger/30 bg-danger/5",
};

const TREND_COLOR: Record<string, string> = {
  Accelerating: "text-success bg-success/10 border-success/30",
  Recovering: "text-accent bg-accent/10 border-accent/30",
  Stable: "text-muted bg-bg border-border/50",
  Decelerating: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  Declining: "text-danger bg-danger/10 border-danger/30",
};

export function EarningsTldr({ symbol }: { symbol: string }) {
  const [data, setData] = useState<TldrData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEarningsTldr(symbol);
      setData({
        headline: String(res.headline ?? ""),
        trend: String(res.trend ?? "Stable"),
        toneColor: String(res.toneColor ?? "amber"),
        bullets: Array.isArray(res.bullets) ? res.bullets.map(String) : [],
        ceoSignal: String(res.ceoSignal ?? ""),
        watchNext: String(res.watchNext ?? ""),
      });
    } catch {
      setError("Earnings TL;DR unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-accent" />
          Earnings TL;DR
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">AI Summary</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Nobody reads 40-page earnings PDFs. Let AI give you the 4 things that actually matter.
            </p>
            <button
              onClick={handleFetch}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-purple-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  AI is reading the earnings…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Summarise Latest Earnings
                </>
              )}
            </button>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Headline + trend */}
            <div className={`rounded-xl border px-4 py-3 ${TONE_BORDER[data.toneColor] ?? TONE_BORDER.amber}`}>
              <div className="flex items-center gap-2 mb-1">
                {TREND_ICONS[data.trend] ?? <Minus className="h-4 w-4 text-muted" />}
                <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${TREND_COLOR[data.trend] ?? TREND_COLOR.Stable}`}>
                  {data.trend}
                </span>
              </div>
              <p className="text-sm font-semibold">{data.headline}</p>
            </div>

            {/* 4 bullets */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Key Takeaways</p>
              {data.bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <p className="text-xs leading-5">{b}</p>
                </div>
              ))}
            </div>

            {/* CEO Signal */}
            <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-muted">Management Signal</p>
              <p className="mt-0.5 text-xs">{data.ceoSignal}</p>
            </div>

            {/* Watch next */}
            <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-accent">Watch Next Quarter</p>
              <p className="mt-0.5 text-xs text-muted">{data.watchNext}</p>
            </div>

            <button
              onClick={() => setData(null)}
              className="text-[11px] text-muted hover:text-text transition"
            >
              ↺ Refresh analysis
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
