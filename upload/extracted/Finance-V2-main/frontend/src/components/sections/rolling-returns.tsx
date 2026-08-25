"use client";

import { Repeat, Target } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { PricePoint } from "@/shared/price-stats";
import {
  DEFAULT_BENCHMARK_PERCENT,
  consistencyVerdict,
  rollingReturns,
} from "@/shared/rolling-returns";

function signed(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function tone(value: number) {
  return value >= 0 ? "text-success" : "text-danger";
}

const VERDICT_STYLE = {
  dependable: { label: "Dependable", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" },
  mixed: { label: "Mixed", chip: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
  unreliable: { label: "Unreliable", chip: "border-rose-500/30 bg-rose-500/10 text-rose-500" },
} as const;

/**
 * Rolling returns across every start date in the history.
 *
 * The trailing returns in the Return Analysis card next to this are a single
 * observation each — they describe the one investor who bought exactly N years
 * ago. This describes all of them, which is the only way to see whether a
 * strong headline number was typical or was one lucky entry point.
 */
export function RollingReturns({ history }: { history?: PricePoint[] }) {
  const stats = rollingReturns(history);
  const verdict = consistencyVerdict(stats);

  // Under a year and a bit of data there aren't enough overlapping windows to
  // describe a distribution, and a "worst case" from five samples is noise.
  if (!stats.length) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500" />
        <h3 className="text-lg font-semibold">Rolling Returns</h3>
        {verdict ? (
          <span
            className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
              VERDICT_STYLE[verdict.verdict].chip
            }`}
          >
            {VERDICT_STYLE[verdict.verdict].label}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-4 text-muted">
        Every possible holding period in the history, not just the one ending today.
      </p>

      <div className="mt-4 space-y-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/40 bg-bg/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">
                {stat.label} holds
                {stat.annualised ? (
                  <span className="ml-1 font-normal text-muted">(p.a.)</span>
                ) : null}
              </p>
              <p className="text-[10px] text-muted">
                {stat.windows.toLocaleString("en-IN")} start dates
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-[10px] text-muted">Worst</p>
                <p className={`text-sm font-bold tabular-nums ${tone(stat.worstPercent)}`}>
                  {signed(stat.worstPercent)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted">Median</p>
                <p className={`text-sm font-bold tabular-nums ${tone(stat.medianPercent)}`}>
                  {signed(stat.medianPercent)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted">Best</p>
                <p className={`text-sm font-bold tabular-nums ${tone(stat.bestPercent)}`}>
                  {signed(stat.bestPercent)}
                </p>
              </div>
            </div>

            {/* Two bars, because "went up" and "was worth the risk" are
                different questions and a stock can pass one while failing the
                other. */}
            <div className="mt-2.5 space-y-1.5">
              {[
                { label: "Ended positive", value: stat.positiveSharePercent, bar: "bg-emerald-500/70" },
                {
                  label: `Beat ${DEFAULT_BENCHMARK_PERCENT}% FD`,
                  value: stat.aboveBenchmarkPercent,
                  bar: "bg-accent/70",
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="w-[86px] shrink-0 text-[10px] text-muted">{row.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
                    <div
                      className={`h-full rounded-full ${row.bar}`}
                      style={{ width: `${Math.max(1, row.value)}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[10px] font-semibold tabular-nums">
                    {row.value.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {verdict ? (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-muted">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>{verdict.summary}</span>
        </p>
      ) : null}

      <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
        <Repeat className="mt-0.5 h-3 w-3 shrink-0" />
        Windows overlap, so these are not independent samples. Past ranges do not bound future
        ones.
      </p>
    </Card>
  );
}
