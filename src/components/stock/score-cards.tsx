"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/shared/section-heading";
import { clamp } from "./helpers";

const ARC_RADIUS = 50;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Smart Score (violet) + Risk Score (red/orange) — animated arc + dimension bars. */
export function ScoreCards({ d }: { d: StockDashboard }) {
  return (
    <div>
      <SectionHeading icon={Sparkles} kicker="Ratings" title="AI Scores" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SmartScoreCard d={d} />
        <RiskScoreCard d={d} />
      </div>
    </div>
  );
}

interface DimBar {
  label: string;
  value: number;
}

function ScoreArc({
  score,
  gradientId,
  from,
  to,
}: {
  score: number;
  gradientId: string;
  from: string;
  to: string;
}) {
  const clamped = clamp(score, 0, 5);
  return (
    <div className="relative mx-auto h-[120px] w-[120px]">
      <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={`Score ${clamped.toFixed(1)} out of 5`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={60} cy={60} r={ARC_RADIUS} stroke="hsl(var(--bg))" strokeWidth={10} fill="none" />
        <motion.circle
          cx={60}
          cy={60}
          r={ARC_RADIUS}
          stroke={`url(#${gradientId})`}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={ARC_CIRCUMFERENCE}
          initial={{ strokeDashoffset: ARC_CIRCUMFERENCE }}
          animate={{ strokeDashoffset: (1 - clamped / 5) * ARC_CIRCUMFERENCE }}
          transition={{ duration: 0.9, ease: EASE }}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold tabular-nums text-text">
          {clamped.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">/5</span>
      </div>
    </div>
  );
}

function DimensionBars({ bars, from, to }: { bars: DimBar[]; from: string; to: string }) {
  return (
    <div className="space-y-3">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-text/85">{b.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {clamp(b.value, 0, 5).toFixed(1)}/5
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${from}, ${to})` }}
              initial={{ width: "0%" }}
              animate={{ width: `${(clamp(b.value, 0, 5) / 5) * 100}%` }}
              transition={{ duration: 0.7, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function VerdictBadge({ label, tone }: { label: string; tone: "success" | "warn" | "danger" }) {
  const tones = {
    success: "border-success/30 bg-success/10 text-success",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-danger/30 bg-danger/10 text-danger",
  } as const;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
        tones[tone]
      )}
    >
      {label}
    </span>
  );
}

function SmartScoreCard({ d }: { d: StockDashboard }) {
  const s = d.smartScore;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `violetGrad-${uid}`;
  const tone = s.score >= 4 ? "success" : s.score >= 2.5 ? "warn" : "danger";

  const bars: DimBar[] = [
    { label: "Profitability", value: s.dimensions.profitability },
    { label: "Growth", value: s.dimensions.growth },
    { label: "Valuation", value: s.dimensions.valuation },
    { label: "Momentum", value: s.dimensions.momentum },
    { label: "Financial Health", value: s.dimensions.financialHealth },
  ];

  return (
    <div className="rounded-[24px] border border-violet-500/25 bg-panel/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-text">Smart Score</h3>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              AI quality rating
            </p>
          </div>
        </div>
        <VerdictBadge label={s.label} tone={tone} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
        <ScoreArc score={s.score} gradientId={gradientId} from="#8b5cf6" to="#d946ef" />
        <DimensionBars bars={bars} from="#8b5cf6" to="#d946ef" />
      </div>

      <p className="mt-4 rounded-xl bg-bg/50 p-3 text-[11px] leading-5 text-muted-foreground">
        {s.explanation}
      </p>
    </div>
  );
}

function RiskScoreCard({ d }: { d: StockDashboard }) {
  const s = d.riskScore;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `riskGrad-${uid}`;
  const tone = s.score < 2 ? "success" : s.score < 3.5 ? "warn" : "danger";

  const bars: DimBar[] = [
    { label: "Sentiment", value: s.components.sentiment },
    { label: "Financial Risk", value: s.components.financialRisk },
    { label: "Narrative Risk", value: s.components.narrativeRisk },
    { label: "Technical Risk", value: s.components.technicalRisk },
  ];

  return (
    <div className="rounded-[24px] border border-red-500/25 bg-panel/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-400 text-white shadow-lg shadow-red-500/20">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-text">Risk Score</h3>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Composite risk rating
            </p>
          </div>
        </div>
        <VerdictBadge label={s.label} tone={tone} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
        <ScoreArc score={s.score} gradientId={gradientId} from="#ef4444" to="#fb923c" />
        <DimensionBars bars={bars} from="#ef4444" to="#fb923c" />
      </div>

      <p className="mt-4 rounded-xl bg-bg/50 p-3 text-[11px] leading-5 text-muted-foreground">
        {s.explanation}
      </p>
    </div>
  );
}
