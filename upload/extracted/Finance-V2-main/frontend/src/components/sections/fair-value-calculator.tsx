"use client";

import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, AlertTriangle, TrendingUp, DollarSign, Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/shared/types";

export function FairValueCalculator({ data }: { data: DashboardData }) {
  const currentPrice = data.price?.cmp || 100;
  const eps = data.metrics?.eps || 10;
  const bookValue = data.metrics?.bookValue || 50;

  // Interactive slider states
  const [growthRate, setGrowthRate] = useState<number>(12); // 12% default EPS growth
  const [discountRate, setDiscountRate] = useState<number>(10); // 10% WACC
  const [terminalMultiple, setTerminalMultiple] = useState<number>(15); // 15x exit P/E

  // Calculate DCF Intrinsic Value
  const { intrinsicValue, upsidePercent, status } = useMemo(() => {
    let projectedEps = eps;
    let presentValueSum = 0;

    // 5-Year DCF Projection
    for (let yr = 1; yr <= 5; yr++) {
      projectedEps = projectedEps * (1 + growthRate / 100);
      const discountFactor = Math.pow(1 + discountRate / 100, yr);
      presentValueSum += projectedEps / discountFactor;
    }

    // Terminal Value
    const terminalValue = (projectedEps * terminalMultiple) / Math.pow(1 + discountRate / 100, 5);
    const totalFairValue = Math.round((presentValueSum + terminalValue) * 100) / 100;

    const upside = Math.round(((totalFairValue - currentPrice) / currentPrice) * 1000) / 10;

    let verdict: { label: string; color: string } = {
      label: "Fairly Valued",
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    };

    if (upside >= 15) {
      verdict = { label: "Undervalued / Value Buy", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    } else if (upside <= -15) {
      verdict = { label: "Overvalued / Premium", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    }

    return {
      intrinsicValue: totalFairValue,
      upsidePercent: upside,
      status: verdict,
    };
  }, [currentPrice, eps, growthRate, discountRate, terminalMultiple]);

  // Benjamin Graham Formula: V = sqrt(22.5 * EPS * BVPS)
  const grahamValue = useMemo(() => {
    if (eps <= 0 || bookValue <= 0) return null;
    return Math.round(Math.sqrt(22.5 * eps * bookValue) * 100) / 100;
  }, [eps, bookValue]);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-fg">Interactive DCF &amp; Intrinsic Fair Value Calculator</h3>
            <p className="text-xs text-muted">Adjust valuation assumptions to test scenarios and find the true intrinsic value</p>
          </div>
        </div>

        <span className={`px-3 py-1 text-xs font-bold rounded-full border ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-3">
        {/* Sliders Area */}
        <div className="space-y-4 rounded-xl border border-border/50 bg-bg/40 p-4 xl:col-span-2">
          {/* Slider 1: Growth Rate */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-accent" /> Expected 5-Yr Earnings Growth Rate
              </span>
              <span className="font-bold text-fg">{growthRate}% per year</span>
            </div>
            <input
              type="range"
              min="0"
              max="35"
              step="1"
              value={growthRate}
              onChange={(e) => setGrowthRate(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer accent-accent"
            />
          </div>

          {/* Slider 2: Discount Rate */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Discount Rate / Required Return (WACC)
              </span>
              <span className="font-bold text-fg">{discountRate}%</span>
            </div>
            <input
              type="range"
              min="6"
              max="18"
              step="0.5"
              value={discountRate}
              onChange={(e) => setDiscountRate(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer accent-emerald-400"
            />
          </div>

          {/* Slider 3: Exit Multiple */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-blue-400" /> Target Terminal Exit P/E Multiple
              </span>
              <span className="font-bold text-fg">{terminalMultiple}x</span>
            </div>
            <input
              type="range"
              min="8"
              max="40"
              step="1"
              value={terminalMultiple}
              onChange={(e) => setTerminalMultiple(Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer accent-blue-400"
            />
          </div>
        </div>

        {/* Dynamic Valuation Summary Box */}
        <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-panel/80 p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">DCF Intrinsic Fair Value</p>
            <p className="mt-1 text-3xl font-black text-fg">₹{intrinsicValue.toLocaleString("en-IN")}</p>
            
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-sm font-bold ${upsidePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {upsidePercent >= 0 ? `+${upsidePercent}% Margin of Safety` : `${upsidePercent}% Overvalued`}
              </span>
            </div>

            <div className="mt-4 space-y-2 border-t border-border/40 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Current Market Price:</span>
                <span className="font-semibold text-fg">₹{currentPrice.toLocaleString("en-IN")}</span>
              </div>
              {grahamValue && (
                <div className="flex justify-between">
                  <span className="text-muted">Benjamin Graham Value:</span>
                  <span className="font-semibold text-fg">₹{grahamValue.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Trailing EPS (TTM):</span>
                <span className="font-semibold text-fg">₹{eps.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-bg/60 p-2.5 text-[11px] text-muted flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-accent mt-0.5" />
            <span>Drag sliders above to model custom growth and discount rate scenarios in real time.</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
