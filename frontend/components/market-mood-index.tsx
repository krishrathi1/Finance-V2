"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchTickerTape } from "@/lib/api";

type MoodLevel = "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";

function getMoodFromData(rows: Array<{ changePercent: number }>): number {
  if (!rows.length) return 50;
  const positiveCount = rows.filter((r) => r.changePercent > 0).length;
  const avgChange = rows.reduce((sum, r) => sum + r.changePercent, 0) / rows.length;
  const breadthScore = (positiveCount / rows.length) * 100;
  const momentumScore = Math.max(0, Math.min(100, 50 + avgChange * 15));
  return Math.round(breadthScore * 0.6 + momentumScore * 0.4);
}

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

function getMoodEmoji(level: MoodLevel): string {
  switch (level) {
    case "Extreme Fear": return "";
    case "Fear": return "";
    case "Neutral": return "";
    case "Greed": return "";
    case "Extreme Greed": return "";
  }
}

export function MarketMoodIndex() {
  const [moodValue, setMoodValue] = useState(50);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchTickerTape([], { force: false });
        if (alive && data.length) {
          setMoodValue(getMoodFromData(data));
        }
      } catch {
        /* keep default */
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(() => {
      void fetchTickerTape([], { force: true }).then((data) => {
        if (alive && data.length) setMoodValue(getMoodFromData(data));
      }).catch(() => {});
    }, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const level = useMemo(() => getMoodLevel(moodValue), [moodValue]);
  const color = useMemo(() => getMoodColor(moodValue), [moodValue]);
  const emoji = useMemo(() => getMoodEmoji(level), [level]);

  const needleAngle = -90 + (moodValue / 100) * 180;

  if (loading) {
    return (
      <div className="shimmer h-[200px] rounded-2xl border border-border/70" />
    );
  }

  return (
    <div className="glow-card density-panel-lg rounded-2xl border border-border/70 bg-panel/70">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="density-copy font-[var(--font-space)] text-sm font-bold uppercase tracking-wider text-muted">
            Market Mood Index
          </h3>
          <p className="density-copy mt-0.5 text-[11px] text-muted">Based on market breadth & momentum</p>
        </div>
        <div className="flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-bg/60 px-3">
          <span className="pulse-dot h-2 w-2 rounded-full bg-success" />
          <span className="density-copy text-[11px] font-medium text-muted">Live</span>
        </div>
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
            {emoji} {level}
          </p>
        </div>
      </div>
    </div>
  );
}
