import { AlertTriangle, Info, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";

const DEFAULT_METHOD = "Risk score combines market mood, company financial stress, negative news signals, and price instability.";

const ORDERED_KEYS = ["sentiment", "financialRisk", "narrativeRisk", "technicalRisk"] as const;

const LABELS: Record<(typeof ORDERED_KEYS)[number], string> = {
  sentiment: "Market Mood",
  financialRisk: "Financial Risk",
  narrativeRisk: "News Risk",
  technicalRisk: "Price Trend Risk"
};

export function RiskScore({
  score,
  components,
  aiExplanation,
  methodology,
  label
}: {
  score: number;
  components: Record<string, number>;
  aiExplanation: string;
  methodology?: string;
  label?: string;
}) {
  const riskPercent = (score / 5) * 100;
  const color = riskPercent < 40 ? "bg-success" : riskPercent < 70 ? "bg-accent" : "bg-danger";
  const methodText = methodology || DEFAULT_METHOD;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-semibold">Risk Score</h3>
        </div>
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
            <div className="absolute right-0 z-20 mt-2 w-[340px] rounded-xl border border-border/70 bg-panel p-3 text-xs leading-5 text-muted shadow-xl">
              {methodText}
            </div>
          </details>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-bg/40 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>Low</span>
          <span>High</span>
        </div>
        <div className="h-3 rounded-full bg-bg">
          <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.max(3, riskPercent)}%` }} />
        </div>
        <p className="mt-2 text-2xl font-bold">{score.toFixed(2)} / 5</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {ORDERED_KEYS.map((key) => {
          const value = Number(components[key] ?? 0);
          return (
            <div key={key} className="rounded-lg bg-bg px-2 py-2">
              <p className="text-muted">{LABELS[key]}</p>
              <p className="font-semibold">{value.toFixed(2)}</p>
            </div>
          );
        })}
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
