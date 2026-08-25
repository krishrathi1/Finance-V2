"use client";

import { useMemo, useState } from "react";

import { MarketStatusBadge } from "@/components/market-status-badge";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchMarketMood, type MarketMoodPayload } from "@/lib/api";

type MoodLevel = "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";

function getMoodLevel(value: number): MoodLevel {
  if (value <= 20) return "Extreme Fear";
  if (value <= 40) return "Fear";
  if (value <= 60) return "Neutral";
  if (value <= 80) return "Greed";
  return "Extreme Greed";
}

function getMoodColor(value: number): string {
  if (value <= 20) return "#ef4444";
  if (value <= 40) return "#f97316";
  if (value <= 60) return "#eab308";
  if (value <= 80) return "#84cc16";
  return "#22c55e";
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatSourceLabel(source?: string, quoteSource?: string) {
  const parts = [source, quoteSource].filter(Boolean);
  return parts.length ? parts.join(" / ").replace(/-/g, " ") : "live feed";
}

function formatUpdatedAt(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MarketMoodIndex() {
  const [mood, setMood] = useState<MarketMoodPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async (force = false) => {
    try {
      const data = await fetchMarketMood({ force });
      if (typeof data.value === "number") {
        setMood(data);
        setFailed(false);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useVisibilityPolling((initial) => void load(!initial), 30_000);

  const moodValue = typeof mood?.value === "number" ? mood.value : null;
  const liveMood = mood;
  const level = useMemo(() => (moodValue === null ? "Neutral" : getMoodLevel(moodValue)), [moodValue]);

  const needleAngle = -90 + Math.max(0, Math.min(100, moodValue ?? 50)) * 1.8;

  const isBull = level === "Extreme Greed" || level === "Greed";
  const isNeutral = level === "Neutral";

  const levelPillClass = isBull
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20"
    : isNeutral
      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
      : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20";

  const dotColor = isBull ? "bg-emerald-500" : isNeutral ? "bg-amber-500" : "bg-rose-500";

  if (loading && !mood) {
    return (
      <div className="shimmer h-[280px] rounded-[28px] border border-border/50" />
    );
  }

  if (moodValue === null || !liveMood) {
    return (
      <div className="relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-border/50 bg-panel/60 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Sentiment</p>
            <h3 className="mt-0.5 font-[var(--font-space)] text-lg font-bold">Market Mood Index</h3>
          </div>
          <MarketStatusBadge />
        </div>
        <div className="mt-8 rounded-xl border border-border/70 bg-bg/50 p-4 text-sm text-muted">
          Waiting for live market breadth data. The score will appear as soon as the quote feed responds.
        </div>
      </div>
    );
  }

  return (
    <article className="relative flex flex-col justify-between overflow-hidden rounded-[28px] border border-border/50 bg-panel/60 p-6 backdrop-blur-sm shadow-sm transition hover:border-border/80">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Sentiment</p>
            <h3 className="mt-0.5 font-[var(--font-space)] text-lg font-bold">Market Mood Index</h3>
          </div>
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
          </span>
        </div>

        {/* Speedometer Gauge */}
        <div className="relative mt-5 flex flex-col items-center">
          <svg
            viewBox="0 0 200 115"
            className="w-full max-w-[230px]"
            role="img"
            aria-label={`Market mood ${moodValue} out of 100 — ${liveMood.level || level}`}
          >
            <defs>
              <linearGradient id="premiumMoodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="25%" stopColor="#f97316" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="75%" stopColor="#84cc16" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>

            {/* Background Track */}
            <path
              d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none"
              stroke="currentColor"
              className="text-muted/20"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Active Gradient Arc */}
            <path
              d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none"
              stroke="url(#premiumMoodGrad)"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Needle */}
            <g style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: "100px 100px", transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
              <line
                x1="100" y1="100" x2="100" y2="32"
                stroke="currentColor"
                className="text-slate-800 dark:text-white"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>

            {/* Center Pivot */}
            <circle cx="100" cy="100" r="7" className="fill-slate-900 dark:fill-white" />
            <circle cx="100" cy="100" r="3" className="fill-panel" />

            {/* Scale Labels */}
            <text x="18" y="112" fontSize="8" fontWeight="600" className="fill-muted/60 uppercase">Fear</text>
            <text x="90" y="75" fontSize="7" fontWeight="600" className="fill-muted/40 uppercase">Neutral</text>
            <text x="156" y="112" fontSize="8" fontWeight="600" className="fill-muted/60 uppercase">Greed</text>
          </svg>
        </div>

        {/* Score & Status Display */}
        <div className="mt-3 flex items-center justify-between px-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-[var(--font-space)] text-4xl font-extrabold tracking-tight">
              {moodValue}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              / 100
            </span>
          </div>

          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${levelPillClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            {liveMood.level || level}
          </span>
        </div>
      </div>

      {/* Micro Metrics Chips */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg/50 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-muted">
          Breadth <strong className="text-emerald-600 dark:text-emerald-400">{liveMood.advancing?.toLocaleString("en-IN") ?? "--"} ▲</strong> / <strong className="text-rose-600 dark:text-rose-400">{liveMood.declining?.toLocaleString("en-IN") ?? "--"} ▼</strong>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg/50 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-muted">
          {(liveMood.quotedCount || 0).toLocaleString("en-IN")} quotes
        </span>
        {typeof liveMood.averageChange === "number" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg/50 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-muted">
            Avg {formatSigned(liveMood.averageChange)}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg/50 px-2 py-1 text-[10px] font-medium text-muted/80">
          Live
        </span>
      </div>

      {/* Source */}
      <p className="mt-2 text-[10px] text-muted">
        {failed ? "Using last good snapshot from " : "Source: "}
        {formatSourceLabel(liveMood.source, liveMood.quoteSource)}
        {liveMood.updatedAt ? ` · Updated ${formatUpdatedAt(liveMood.updatedAt)}` : ""}
      </p>
    </article>
  );
}
