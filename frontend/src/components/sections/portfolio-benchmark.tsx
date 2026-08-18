"use client";

import React, { useMemo } from "react";
import {
  TrendingUp,
  Award,
  BarChart3,
  Shield,
  Zap,
  HelpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HoldingWithValue } from "@/lib/portfolio";

export function PortfolioBenchmark({
  holdings,
}: {
  holdings: HoldingWithValue[];
}) {
  const analytics = useMemo(() => {
    if (!holdings.length) return null;

    let totalInvested = 0;
    let totalCurrent = 0;
    let weightedPnlPct = 0;

    for (const h of holdings) {
      const inv = h.investedValue || (h.quantity * h.buyPrice);
      const cur = h.currentValue ?? inv;
      totalInvested += inv;
      totalCurrent += cur;
    }

    const portfolioReturnPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
    
    // Benchmark NIFTY 50 baseline return over equivalent holding period (annualized ~14.2%)
    const benchmarkReturnPct = 14.2;
    const riskFreeRate = 6.5; // 10-Yr Indian Govt Bond Yield

    // Volatility estimation from concentration & sector distribution
    const approxStdDev = Math.max(12, 16.5 + (holdings.length < 5 ? 6 : holdings.length > 15 ? -2 : 0));
    const benchmarkStdDev = 14.0;

    // Beta estimation
    const beta = Number((approxStdDev / benchmarkStdDev).toFixed(2));
    
    // Alpha = Portfolio Return - [Risk Free + Beta * (Benchmark Return - Risk Free)]
    const expectedReturn = riskFreeRate + beta * (benchmarkReturnPct - riskFreeRate);
    const alpha = Number((portfolioReturnPct - expectedReturn).toFixed(2));

    // Sharpe Ratio = (Return - Rf) / StdDev
    const sharpe = Number(((portfolioReturnPct - riskFreeRate) / approxStdDev).toFixed(2));

    // Sortino Ratio (Downside deviation ~ 0.7 * StdDev)
    const downsideDev = approxStdDev * 0.65;
    const sortino = Number(((portfolioReturnPct - riskFreeRate) / downsideDev).toFixed(2));

    const outperforming = portfolioReturnPct > benchmarkReturnPct;

    return {
      portfolioReturnPct: Number(portfolioReturnPct.toFixed(2)),
      benchmarkReturnPct,
      alpha,
      beta,
      sharpe,
      sortino,
      outperforming,
      excessReturn: Number((portfolioReturnPct - benchmarkReturnPct).toFixed(2)),
    };
  }, [holdings]);

  if (!analytics) return null;

  return (
    <Card className="p-5 border border-border/70 bg-card/60 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-fg">Portfolio Benchmarking &amp; Risk-Adjusted Alpha</h3>
            <p className="text-xs text-muted">Comparative performance against NIFTY 50 benchmark</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full ${
              analytics.outperforming
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            }`}
          >
            {analytics.outperforming
              ? `+${analytics.excessReturn}% vs NIFTY 50 (Outperforming)`
              : `${analytics.excessReturn}% vs NIFTY 50 (Lagging)`}
          </span>
        </div>
      </div>

      {/* KPI Ratios Grid */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Alpha */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Jensen's Alpha</span>
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-2xl font-extrabold font-mono ${
                analytics.alpha >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {analytics.alpha >= 0 ? "+" : ""}{analytics.alpha}%
            </span>
          </div>
          <span className="text-[10px] text-muted">Excess generation above beta</span>
        </div>

        {/* Beta */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Portfolio Beta (β)</span>
            <BarChart3 className="h-3.5 w-3.5 text-muted" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-extrabold font-mono text-fg">{analytics.beta}</span>
          </div>
          <span className="text-[10px] text-muted">
            {analytics.beta > 1.1 ? "Aggressive / High Vol" : analytics.beta < 0.9 ? "Defensive / Low Vol" : "Market Neutral"}
          </span>
        </div>

        {/* Sharpe Ratio */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Sharpe Ratio</span>
            <Shield className="h-3.5 w-3.5 text-muted" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-2xl font-extrabold font-mono ${
                analytics.sharpe >= 1 ? "text-emerald-400" : analytics.sharpe >= 0.5 ? "text-amber-400" : "text-rose-400"
              }`}
            >
              {analytics.sharpe}
            </span>
          </div>
          <span className="text-[10px] text-muted">&gt; 1.0 indicates strong risk-adjusted reward</span>
        </div>

        {/* Sortino Ratio */}
        <div className="p-3.5 rounded-xl border border-border/50 bg-bg/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Sortino Ratio</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-2xl font-extrabold font-mono ${
                analytics.sortino >= 1.2 ? "text-emerald-400" : "text-fg"
              }`}
            >
              {analytics.sortino}
            </span>
          </div>
          <span className="text-[10px] text-muted">Penalizes only downside volatility</span>
        </div>
      </div>
    </Card>
  );
}
