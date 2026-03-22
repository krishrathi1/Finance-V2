import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui/card";

const DEFAULT_METHOD = "Risk score combines market mood, company financial stress, negative news signals, and price instability.";

const ORDERED_KEYS = ["sentiment", "financialRisk", "narrativeRisk", "technicalRisk"] as const;

const LABELS: Record<(typeof ORDERED_KEYS)[number], string> = {
  sentiment: "Market Mood",
  financialRisk: "Financial Risk",
  narrativeRisk: "News Risk",
  technicalRisk: "Price Trend Risk"
};

const ICONS: Record<(typeof ORDERED_KEYS)[number], string> = {
  sentiment: "",
  financialRisk: "",
  narrativeRisk: "",
  technicalRisk: ""
};

function getRiskColor(score: number): string {
  if (score < 2) return "#22c55e";
  if (score < 3) return "#eab308";
  if (score < 4) return "#f97316";
  return "#ef4444";
}

function getRiskLabel(score: number): string {
  if (score < 1.5) return "Very Low";
  if (score < 2.5) return "Low";
  if (score < 3.5) return "Moderate";
  if (score < 4.5) return "High";
  return "Very High";
}

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
  const color = getRiskColor(score);
  const riskLabel = getRiskLabel(score);
  const methodText = methodology || DEFAULT_METHOD;

  return (
    <Card className="glow-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18` }}>
            <ShieldAlert className="h-4 w-4" style={{ color }} />
          </div>
          <h3 className="text-lg font-semibold">Risk Score</h3>
        </div>
        <div className="flex items-center gap-2">
          {label ? (
            <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ borderColor: `${color}30`, backgroundColor: `${color}10`, color }}
            >
              {label}
            </span>
          ) : null}
          <details className="relative">
            <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-border/70 text-muted transition hover:text-text">
              <Info className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[260px] rounded-xl border border-border/70 bg-panel p-3 text-xs leading-5 text-muted shadow-xl sm:w-[340px]">
              {methodText}
            </div>
          </details>
        </div>
      </div>

      {/* Main risk gauge */}
      <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-bg/40 px-4 py-5 sm:px-5 sm:py-6">
        <div className="relative h-28 w-full max-w-[240px]">
          <svg viewBox="0 0 200 110" className="w-full">
            <defs>
              <linearGradient id="riskGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="33%" stopColor="#eab308" />
                <stop offset="66%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#riskGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              opacity="0.25"
            />
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#riskGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(riskPercent / 100) * 251.2} 251.2`}
            />
            <g transform={`rotate(${-90 + (riskPercent / 100) * 180} 100 100)`}>
              <line x1="100" y1="100" x2="100" y2="40" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="100" cy="100" r="4" fill={color} />
            </g>
          </svg>
        </div>
        <p className="text-3xl font-bold leading-none sm:text-[2rem]" style={{ color }}>{score.toFixed(2)}</p>
        <p className="text-xs text-muted">out of 5.0</p>
        <span className="mt-2 rounded-full px-3 py-0.5 text-xs font-semibold"
          style={{ color, backgroundColor: `${color}15` }}
        >
          {riskLabel} Risk
        </span>
      </div>

      {/* Risk components */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {ORDERED_KEYS.map((key) => {
          const value = Number(components[key] ?? 0);
          const compColor = getRiskColor(value);
          return (
            <div key={key} className="rounded-xl border border-border/60 bg-bg/40 px-3 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{ICONS[key]}</span>
                <p className="text-[11px] text-muted">{LABELS[key]}</p>
              </div>
              <p className="mt-1 text-lg font-bold" style={{ color: compColor }}>{value.toFixed(2)}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(value / 5) * 100}%`, backgroundColor: compColor }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Insight */}
      <div className="mt-3 rounded-2xl border p-3"
        style={{ borderColor: `${color}20`, backgroundColor: `${color}06` }}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" style={{ color }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>Risk Assessment</p>
        </div>
        <p className="text-sm leading-6 text-muted">{aiExplanation}</p>
      </div>
    </Card>
  );
}
