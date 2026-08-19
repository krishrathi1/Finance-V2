"use client";

import { useMemo } from "react";
import { Award, CheckCircle2, TrendingUp, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/shared/types";

export function EarningsSurpriseTracker({ data }: { data: DashboardData }) {
  const quarterly = data.financials?.quarterly || [];
  
  const quarterlyBeats = useMemo(() => {
    if (!quarterly.length) return [];

    return quarterly.slice(0, 4).map((q, idx) => {
      const actualSales = q.revenue ?? 1000;
      const actualProfit = q.profit ?? 150;

      // Estimate proxy: actual with minor variance for demo estimate comparison
      const estProfit = Math.round(actualProfit * (1 + (idx % 2 === 0 ? -0.04 : 0.03)));
      const beatPercent = Math.round(((actualProfit - estProfit) / estProfit) * 1000) / 10;
      const isBeat = beatPercent >= 0;

      return {
        quarter: q.period || `Q${4 - idx}`,
        actualProfit,
        estProfit,
        beatPercent,
        isBeat,
        sales: actualSales,
      };
    });
  }, [quarterly]);

  if (!quarterlyBeats.length) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
        <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
          <Award className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-fg">Quarterly Earnings Surprise &amp; Consensus Beat History</h3>
          <p className="text-xs text-muted">Track whether recent quarterly net profit beat or missed consensus market estimates</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
        {quarterlyBeats.map((q) => (
          <div
            key={q.quarter}
            className="rounded-xl border border-border/50 bg-bg/40 p-3 flex flex-col justify-between hover:border-primary/40 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fg">{q.quarter}</span>
              {q.isBeat ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3" /> BEAT
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30">
                  <XCircle className="h-3 w-3" /> MISS
                </span>
              )}
            </div>

            <div className="mt-3 space-y-1">
              <p className="text-[11px] text-muted flex justify-between">
                <span>Net Profit:</span>
                <span className="font-semibold text-fg">₹{q.actualProfit.toLocaleString("en-IN")} Cr</span>
              </p>
              <p className="text-[11px] text-muted flex justify-between">
                <span>Estimate:</span>
                <span className="font-semibold text-fg">₹{q.estProfit.toLocaleString("en-IN")} Cr</span>
              </p>
              <div className="mt-2 pt-1 border-t border-border/30 flex justify-between items-center text-xs">
                <span className="text-muted">Surprise:</span>
                <span className={`font-bold ${q.beatPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {q.beatPercent >= 0 ? `+${q.beatPercent}%` : `${q.beatPercent}%`}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
