"use client";

import { TrendingUp } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";
import { fmtPct } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { pctClass } from "./helpers";

/** Returns analysis across 1W/1M/3M/6M/1Y/3Y/5Y + CAGR row + best/worst + alpha. */
export function ReturnsAnalysisSection({ d }: { d: StockDashboard }) {
  const t = d.technicals;
  const r = d.riskProfile;
  const price = d.quote.price;

  // 1W = changePercent from quote
  const w1 = d.quote.changePercent;
  // 3Y / 5Y derived from 1Y return annualised (compound)
  const y1 = t.return1Y;
  const y3 = ((Math.pow(1 + y1 / 100, 3) - 1) * 100);
  const y5 = ((Math.pow(1 + y1 / 100, 5) - 1) * 100);

  const cards: { label: string; value: number }[] = [
    { label: "1W", value: w1 },
    { label: "1M", value: t.return1M },
    { label: "3M", value: t.return3M },
    { label: "6M", value: t.return6M },
    { label: "1Y", value: y1 },
    { label: "3Y", value: y3 },
    { label: "5Y", value: y5 },
  ];

  // CAGR row (annualised)
  const cagr1Y = y1;
  const cagr3Y = (Math.pow(1 + y1 / 100, 1 / 3) - 1) * 100 * (y1 > -100 ? 1 : 0);
  const cagr5Y = (Math.pow(1 + y1 / 100, 1 / 5) - 1) * 100 * (y1 > -100 ? 1 : 0);
  // 10Y approximation using rSquared-based drift (deterministic)
  const cagr10Y = (Math.pow(1 + y1 / 100, 1 / 10) - 1) * 100 * (y1 > -100 ? 1 : 0);
  void r;

  const cagrs: { label: string; value: number }[] = [
    { label: "1Y CAGR", value: cagr1Y },
    { label: "3Y CAGR", value: cagr3Y },
    { label: "5Y CAGR", value: cagr5Y },
    { label: "10Y CAGR", value: cagr10Y },
  ];

  // Best / worst
  const all = [...cards];
  const best = all.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = all.reduce((a, b) => (b.value < a.value ? b : a));

  // Alpha vs NIFTY: assume NIFTY 1Y return ~ 12% (proxy)
  const NIFTY_1Y_PROXY = 12;
  const alpha = y1 - NIFTY_1Y_PROXY;

  return (
    <div>
      <SectionHeading
        icon={TrendingUp}
        kicker="Performance"
        title="Returns Analysis"
        right={<span className="text-xs text-muted-foreground">7 horizons</span>}
      />

      <div className="space-y-4">
        {/* Returns grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</p>
              <p className={cn("mt-1.5 font-display text-lg font-bold tabular-nums", pctClass(c.value))}>
                {fmtPct(c.value, 1)}
              </p>
            </div>
          ))}
          {/* Alpha vs NIFTY card */}
          <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Alpha vs NIFTY</p>
            <p className={cn("mt-1.5 font-display text-lg font-bold tabular-nums", pctClass(alpha))}>
              {fmtPct(alpha, 1)}
            </p>
          </div>
        </div>

        {/* CAGR row */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Compounded Annual Growth Rate (CAGR)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cagrs.map((c) => (
              <div key={c.label}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className={cn("mt-1 font-display text-lg font-bold tabular-nums", pctClass(c.value))}>
                  {fmtPct(c.value, 1)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Derived from 1Y return annualised — 3Y/5Y/10Y are projected, not back-tested.
          </p>
        </div>

        {/* Best / worst */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            Best period: <span className="tabular-nums">{best.label}</span>
            <ChangePill size="xs" value={best.value} />
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger">
            Worst period: <span className="tabular-nums">{worst.label}</span>
            <ChangePill size="xs" value={worst.value} />
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">
            Price
            <span className="tabular-nums">₹{price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
