"use client";

import React, { useMemo } from "react";
import {
  Coins,
  Calendar,
  DollarSign,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HoldingWithValue } from "@/lib/portfolio";

export function DividendCalendar({
  holdings,
}: {
  holdings: HoldingWithValue[];
}) {
  const data = useMemo(() => {
    if (!holdings.length) return null;

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    let totalAnnualEstimatedDividends = 0;
    let totalInvested = 0;

    for (const h of holdings) {
      totalInvested += h.investedValue || (h.quantity * h.buyPrice);
    }

    // Typical Indian dividend payout season concentration: May, June, July, August, Nov, Feb
    const monthWeights = [0.04, 0.08, 0.06, 0.05, 0.16, 0.18, 0.15, 0.12, 0.05, 0.03, 0.06, 0.02];

    const estimatedHoldingsYieldPct = 1.35; // NIFTY avg dividend yield
    totalAnnualEstimatedDividends = Math.round(totalInvested * (estimatedHoldingsYieldPct / 100));

    const monthlyBreakdown = months.map((m, idx) => ({
      month: m,
      amount: Math.round(totalAnnualEstimatedDividends * monthWeights[idx]),
      weight: monthWeights[idx],
    }));

    const yieldOnCost = totalInvested > 0 ? (totalAnnualEstimatedDividends / totalInvested) * 100 : 0;
    const monthlyAverage = Math.round(totalAnnualEstimatedDividends / 12);

    return {
      totalAnnualEstimatedDividends,
      yieldOnCost: Number(yieldOnCost.toFixed(2)),
      monthlyAverage,
      monthlyBreakdown,
    };
  }, [holdings]);

  if (!data || data.totalAnnualEstimatedDividends === 0) return null;

  const maxMonthAmount = Math.max(...data.monthlyBreakdown.map((m) => m.amount), 1);

  return (
    <Card className="p-5 border border-border/70 bg-card/60 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-fg">Dividend Calendar &amp; Passive Income Forecast</h3>
            <p className="text-xs text-muted">Estimated monthly passive cash flow based on portfolio lots</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-muted uppercase tracking-wider block">Est. Annual Cash Flow</span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              ₹{data.totalAnnualEstimatedDividends.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-border/50 bg-bg/40">
          <span className="text-[11px] text-muted">Portfolio Yield on Cost</span>
          <p className="text-xl font-bold font-mono text-fg mt-0.5">{data.yieldOnCost}%</p>
        </div>
        <div className="p-3 rounded-xl border border-border/50 bg-bg/40">
          <span className="text-[11px] text-muted">Avg. Monthly Passive Income</span>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">₹{data.monthlyAverage.toLocaleString("en-IN")}</p>
        </div>
        <div className="p-3 rounded-xl border border-border/50 bg-bg/40 col-span-2 sm:col-span-1">
          <span className="text-[11px] text-muted">Peak Payout Season</span>
          <p className="text-sm font-semibold text-fg mt-1">May – August (Q4 Results / AGMs)</p>
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-muted mb-2">
          <span>Projected Monthly Distribution</span>
          <span className="font-mono">FY 2026-27</span>
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 items-end h-28 pt-4 pb-1 bg-bg/30 rounded-xl border border-border/40 px-2">
          {data.monthlyBreakdown.map((m, idx) => {
            const heightPct = Math.max(8, (m.amount / maxMonthAmount) * 100);
            return (
              <div key={idx} className="flex flex-col items-center h-full justify-end group relative">
                {/* Tooltip */}
                <div className="absolute -top-7 hidden group-hover:flex px-1.5 py-0.5 rounded bg-panel border border-border text-[9px] font-mono text-fg whitespace-nowrap z-20 shadow-md">
                  ₹{m.amount.toLocaleString("en-IN")}
                </div>
                <div
                  className="w-full rounded-t transition-all duration-300 bg-gradient-to-t from-primary/60 to-primary group-hover:from-emerald-400 group-hover:to-teal-400"
                  style={{ height: `${heightPct}%` }}
                />
                <span className="text-[10px] text-muted font-mono mt-1 group-hover:text-fg">{m.month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
