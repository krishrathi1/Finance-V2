import { Info, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";

const DEFAULT_METHOD = "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. A bounded walk-forward ML signal validates trend persistence before applying a small score adjustment.";

const ORDERED_KEYS = ["profitability", "growth", "valuation", "momentum", "financialHealth"] as const;

const LABELS: Record<(typeof ORDERED_KEYS)[number], string> = {
  profitability: "Profitability",
  growth: "Growth",
  valuation: "Valuation",
  momentum: "Momentum",
  financialHealth: "Financial Health"
};

function ScoreArc({ score, color }: { score: number; color: string }) {
  const normalized = Math.max(0, Math.min(5, score));
  const circumference = 283;
  const progress = (normalized / 5) * circumference;
  return (
    <svg viewBox="0 0 120 120" className="h-52 w-52">
      <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(130,148,179,0.25)" strokeWidth="10" strokeLinecap="round" />
      <circle
        cx="60"
        cy="60"
        r="45"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="66" textAnchor="middle" className="fill-current text-2xl font-semibold">
        {score.toFixed(1)}
      </text>
    </svg>
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

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Smart Score</h3>
        <div className="flex items-center gap-2">
          {label ? (
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs font-semibold text-muted">
              {label}
            </span>
          ) : null}
          <details className="relative">
            <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-border/70 text-muted transition hover:text-text">
              <Info className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[360px] rounded-xl border border-border/70 bg-panel p-3 text-xs leading-5 text-muted shadow-xl">
              {methodText}
            </div>
          </details>
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col items-center rounded-2xl border border-border/70 bg-bg/40 p-3">
          <ScoreArc score={score} color="#8b5cf6" />
          <p className="-mt-2 text-sm text-muted">out of 5.0</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-bg/40 p-4">
          {rows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{row.label}</span>
                <span className="font-semibold">{row.value.toFixed(2)}</span>
              </div>
              <div className="h-2 rounded-full bg-border/60">
                <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border/70 bg-bg/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold">AI Insight</p>
        </div>
        <p className="text-sm leading-6 text-muted">{aiExplanation}</p>
      </div>
    </Card>
  );
}
