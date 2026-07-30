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
  const color = useMemo(() => getMoodColor(moodValue ?? 50), [moodValue]);

  const needleAngle = -90 + ((moodValue ?? 50) / 100) * 180;

  if (loading && !mood) {
    return (
      <div className="shimmer h-[200px] rounded-2xl border border-border/70" />
    );
  }

  if (moodValue === null || !liveMood) {
    return (
      <div className="glow-card density-panel-lg rounded-2xl border border-border/70 bg-panel/70">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="density-copy font-[var(--font-space)] text-sm font-bold uppercase tracking-wider text-muted">
              Market Mood Index
            </h3>
            <p className="density-copy mt-0.5 text-[11px] text-muted">Based on live NSE/BSE breadth & momentum</p>
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
    <div className="glow-card density-panel-lg rounded-2xl border border-border/70 bg-panel/70">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="density-copy font-[var(--font-space)] text-sm font-bold uppercase tracking-wider text-muted">
            Market Mood Index
          </h3>
          <p className="density-copy mt-0.5 text-[11px] text-muted">Based on live NSE/BSE breadth & momentum</p>
        </div>
        <MarketStatusBadge />
      </div>

      <div className="mt-4 flex flex-col items-center">
        <svg viewBox="0 0 200 120" className="w-full max-w-[240px]">
          {/* Background arc */}
          <defs>
            <linearGradient id="moodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#moodGrad)"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.3"
          />
          {/* Active arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#moodGrad)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(moodValue / 100) * 251.2} 251.2`}
          />
          {/* Needle */}
          <g transform={`rotate(${needleAngle} 100 100)`}>
            <line x1="100" y1="100" x2="100" y2="35" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="100" cy="100" r="5" fill={color} />
          </g>
          {/* Labels */}
          <text x="18" y="116" fontSize="8" fill="currentColor" opacity="0.4">Fear</text>
          <text x="156" y="116" fontSize="8" fill="currentColor" opacity="0.4">Greed</text>
        </svg>

        <div className="mt-2 text-center">
          <p className="text-3xl font-bold" style={{ color }}>{moodValue}</p>
          <p className="mt-1 text-sm font-semibold" style={{ color }}>
            {liveMood.level || level}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] font-semibold text-muted">
          <span className="rounded-full border border-border/60 bg-bg/50 px-2 py-1">
            Adv {liveMood.advancing?.toLocaleString("en-IN") ?? "--"} / Dec {liveMood.declining?.toLocaleString("en-IN") ?? "--"}
          </span>
          <span className="rounded-full border border-border/60 bg-bg/50 px-2 py-1">
            {(liveMood.quotedCount || 0).toLocaleString("en-IN")} live quotes
          </span>
          {typeof liveMood.averageChange === "number" ? (
            <span className="rounded-full border border-border/60 bg-bg/50 px-2 py-1">
              Avg {formatSigned(liveMood.averageChange)}
            </span>
          ) : null}
          {liveMood.updatedAt ? (
            <span className="rounded-full border border-border/60 bg-bg/50 px-2 py-1">
              Updated {formatUpdatedAt(liveMood.updatedAt)}
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-[260px] text-center text-[10px] text-muted">
          {failed ? "Using last good snapshot from " : "Source: "}
          {formatSourceLabel(liveMood.source, liveMood.quoteSource)}
        </p>
      </div>
    </div>
  );
}
