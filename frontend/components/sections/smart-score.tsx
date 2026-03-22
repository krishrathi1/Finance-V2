import { Info, Sparkles } from "lucide-react";

import { SnowflakeChart } from "@/components/charts/snowflake-chart";
import { Card } from "@/components/ui/card";

const DEFAULT_METHOD = "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. A bounded walk-forward ML signal validates trend persistence before applying a small score adjustment.";

const ORDERED_KEYS = ["profitability", "growth", "valuation", "momentum", "financialHealth"] as const;

const LABELS: Record<(typeof ORDERED_KEYS)[number], string> = {
  profitability: "Profitability",
  growth: "Growth",
  valuation: "Valuation",
  momentum: "Momentum",
  financialHealth: "Health"
};

function ScoreArc({ score, color }: { score: number; color: string }) {
  const normalized = Math.max(0, Math.min(5, score));
  const circumference = 283;
  const progress = (normalized / 5) * circumference;
  const scoreLabel = score >= 4 ? "Excellent" : score >= 3 ? "Good" : score >= 2 ? "Fair" : "Weak";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" className="h-28 w-28 sm:h-36 sm:w-36">
        <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(130,148,179,0.15)" strokeWidth="8" strokeLinecap="round" />
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
        <text x="60" y="58" textAnchor="middle" className="fill-current text-2xl font-bold">
          {score.toFixed(1)}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-current text-[8px] uppercase tracking-wide opacity-50">
          / 5.0
        </text>
      </svg>
      <span className="mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={{ color, backgroundColor: `${color}18` }}
      >
        {scoreLabel}
      </span>
    </div>
  );
}

export function SmartScore({
  score,
  dimensions,
  aiExplanation,
  methodology,
  label
}: {
  score: number;
  dimensions: Record<string, number>;
  aiExplanation: string;
  methodology?: string;
  label?: string;
}) {
  const methodText = methodology || DEFAULT_METHOD;
  const rows = ORDERED_KEYS.map((key) => {
    const value = Number(dimensions[key] ?? 0);
    const pct = Math.max(0, Math.min(100, (value / 5) * 100));
    return { key, label: LABELS[key], value, pct };
  });

  const snowflakeDimensions = ORDERED_KEYS.map((key) => ({
    label: LABELS[key],
    value: Number(dimensions[key] ?? 0),
    maxValue: 5,
  }));

  return (
    <Card className="glow-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
            <Sparkles className="h-4 w-4 text-violet-500" />
          </div>
          <h3 className="text-lg font-semibold">Smart Score</h3>
        </div>
        <div className="flex items-center gap-2">
          {label ? (
            <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-violet-500">
              {label}
            </span>
          ) : null}
          <details className="relative">
            <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-border/70 text-muted transition hover:text-text">
              <Info className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-xl border border-border/70 bg-panel p-3 text-xs leading-5 text-muted shadow-xl sm:w-[360px]">
              {methodText}
            </div>
          </details>
        </div>
      </div>

      {/* Snowflake + Score Arc side by side */}
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-around">
        <ScoreArc score={score} color="#8b5cf6" />
        <div className="flex justify-center">
          <SnowflakeChart dimensions={snowflakeDimensions} size={200} />
        </div>
      </div>

      {/* Dimension bars */}
      <div className="mt-4 space-y-2.5 rounded-2xl border border-border/70 bg-bg/40 p-3 sm:p-4">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted">{row.label}</span>
              <span className="font-semibold">{row.value.toFixed(2)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/40 sm:h-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
                style={{ width: `${row.pct}%`, boxShadow: `0 0 8px rgba(139, 92, 246, 0.3)` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* AI Insight */}
      <div className="mt-3 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">AI Insight</p>
        </div>
        <p className="text-sm leading-6 text-muted">{aiExplanation}</p>
      </div>
    </Card>
  );
}
