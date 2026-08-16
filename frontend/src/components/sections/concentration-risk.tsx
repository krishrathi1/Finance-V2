"use client";

import { AlertTriangle, Layers, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HoldingWithValue } from "@/lib/portfolio";
import { concentrationRisk } from "@/shared/portfolio-risk";

const LEVEL_STYLE = {
  concentrated: {
    label: "Concentrated",
    text: "text-danger",
    bar: "from-rose-400 to-red-500",
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  },
  moderate: {
    label: "Moderate",
    text: "text-amber-500",
    bar: "from-amber-400 to-orange-500",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  },
  diversified: {
    label: "Diversified",
    text: "text-success",
    bar: "from-emerald-400 to-teal-500",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  },
} as const;

/**
 * How concentrated the portfolio actually is, measured rather than described.
 *
 * The allocation pie next to this shows the same data, but a pie with twelve
 * slices reads as "diversified" even when one slice is most of the money.
 * `effectiveHoldings` is the number that resolves it: how many equally-sized
 * positions would carry the same risk as the mix actually held.
 */
export function ConcentrationRisk({ holdings }: { holdings: HoldingWithValue[] }) {
  const risk = useMemo(
    () =>
      concentrationRisk(
        holdings.map((holding) => ({
          symbol: holding.symbol,
          companyName: holding.companyName,
          // Falls back to cost when a price fetch failed, so one unreachable
          // quote doesn't drop a position out of the weighting entirely and
          // inflate everything else's share.
          value: holding.currentValue ?? holding.investedValue,
        }))
      ),
    [holdings]
  );

  if (!risk) return null;

  const style = LEVEL_STYLE[risk.level];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-accent" />
            Concentration
          </CardTitle>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.chip}`}
          >
            {style.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* The headline reframing: holdings held vs. holdings' worth of spread. */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`text-2xl font-bold tabular-nums ${style.text}`}>
            {risk.effectiveHoldings.toFixed(1)}
          </span>
          <span className="text-xs text-muted">
            effective holdings, from {risk.holdingCount}{" "}
            {risk.holdingCount === 1 ? "position" : "positions"}
          </span>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted">
            <span>Diversification</span>
            <span className="tabular-nums">{risk.diversificationScore}/100</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-border/40"
            role="img"
            aria-label={`Diversification score ${risk.diversificationScore} out of 100`}
          >
            <div
              className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
              style={{ width: `${Math.max(2, risk.diversificationScore)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Largest", value: risk.topWeightPercent },
            { label: "Top 3", value: risk.topThreePercent },
            { label: "Top 5", value: risk.topFivePercent },
          ].map((entry) => (
            <div
              key={entry.label}
              className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center"
            >
              <p className="text-[10px] text-muted">{entry.label}</p>
              <p className="text-sm font-bold tabular-nums">{entry.value.toFixed(1)}%</p>
            </div>
          ))}
        </div>

        {risk.flags.length > 0 ? (
          <ul className="space-y-1.5">
            {risk.flags.map((flag) => (
              <li key={flag} className="flex items-start gap-2 text-[11px] leading-4 text-muted">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-start gap-2 text-[11px] leading-4 text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            No single position dominates — company-specific bad news should dent this portfolio
            rather than define it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
