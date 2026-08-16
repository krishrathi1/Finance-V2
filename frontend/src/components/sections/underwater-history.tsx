"use client";

import { Clock, Waves } from "lucide-react";

import { Card } from "@/components/ui/card";
import { drawdownAnalysis } from "@/shared/drawdown-analysis";
import type { PricePoint } from "@/shared/price-stats";

function months(days: number) {
  if (days < 60) return `${days}d`;
  const value = days / 30.44;
  if (value < 24) return `${value.toFixed(0)} mo`;
  return `${(days / 365.25).toFixed(1)} yr`;
}

/**
 * How long this stock spends below its previous high, and how long it takes to
 * come back.
 *
 * The Risk Profile card reports the deepest drawdown, which is the "how bad"
 * half of the question. This is the "how long" half — a 30% fall that recovers
 * in four months and a 30% fall still unrecovered three years later produce an
 * identical max-drawdown figure and are entirely different things to live
 * through. Time underwater is when people sell at the bottom.
 */
export function UnderwaterHistory({ history }: { history?: PricePoint[] }) {
  const analysis = drawdownAnalysis(history);

  // Null means the series never fell far enough below a high to count, which
  // is a clean record rather than a failed computation — but a card of zeroes
  // would read as the latter.
  if (!analysis) return null;

  const spells = analysis.spells.slice(0, 4);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
        <h3 className="text-lg font-semibold">Time Underwater</h3>
        {analysis.currentlyUnderwater ? (
          <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
            Below a previous high
          </span>
        ) : (
          <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
            At its high
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted">Time below a high</p>
          <p className="text-sm font-bold tabular-nums">
            {analysis.timeUnderwaterPercent.toFixed(0)}%
          </p>
          <p className="text-[10px] leading-3 text-muted/70">of the period</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted">Longest stretch</p>
          <p className="text-sm font-bold tabular-nums">
            {months(analysis.longestUnderwaterDays)}
          </p>
          <p className="text-[10px] leading-3 text-muted/70">
            {analysis.longestUnderwaterSpell
              ? `${analysis.longestUnderwaterSpell.depthPercent.toFixed(0)}% deep`
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted">Typical recovery</p>
          <p className="text-sm font-bold tabular-nums">
            {analysis.medianRecoveryDays === null
              ? "—"
              : months(analysis.medianRecoveryDays)}
          </p>
          <p className="text-[10px] leading-3 text-muted/70">
            {analysis.medianRecoveryDays === null ? "none recovered" : "trough to old high"}
          </p>
        </div>
      </div>

      {analysis.currentlyUnderwater && analysis.currentDepthPercent !== null ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-4 text-muted">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            Currently{" "}
            <span className="font-semibold text-fg">
              {analysis.currentDepthPercent.toFixed(1)}%
            </span>{" "}
            below its previous high, and has been for{" "}
            <span className="font-semibold text-fg">
              {months(analysis.currentUnderwaterDays ?? 0)}
            </span>
            .
          </span>
        </p>
      ) : null}

      <div className="mt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <Waves className="h-3 w-3" /> Deepest falls
        </p>
        <div className="space-y-1.5">
          {spells.map((spell) => (
            <div
              key={`${spell.peakDate}-${spell.troughDate}`}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-bg/40 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tabular-nums text-danger">
                  {spell.depthPercent.toFixed(1)}%
                </p>
                <p className="truncate text-[10px] text-muted">
                  {spell.peakDate} → {spell.troughDate}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-medium tabular-nums">{months(spell.days)}</p>
                <p className="text-[10px] text-muted/70">
                  {spell.recovered
                    ? `recovered in ${months(spell.recoveryDays ?? 0)}`
                    : "not recovered"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-muted/60">
        Counts falls of 5% or more below a previous closing high. Shallower dips are noise, and
        counting them would put almost every stock underwater almost all the time.
      </p>
    </Card>
  );
}
