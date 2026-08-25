"use client";

import { Activity } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { fmtInr, fmtPct } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { clamp, numOrDash, pctClass } from "./helpers";

const TREND_CLASS: Record<string, string> = {
  Bullish: "border-success/30 bg-success/10 text-success",
  Bearish: "border-danger/30 bg-danger/10 text-danger",
  Neutral: "border-border/60 bg-panel/70 text-muted-foreground",
};

function CardShell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm",
        className
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/** RSI gauge, MACD crossover, moving averages, risk metrics and returns. */
export function TechnicalsSection({ d }: { d: StockDashboard }) {
  const t = d.technicals;
  const price = d.quote.price;
  const above200 = price > t.sma200;
  const bullishCross = t.macd > t.macdSignal;

  const returns = [
    { label: "1M", value: t.return1M },
    { label: "3M", value: t.return3M },
    { label: "6M", value: t.return6M },
    { label: "1Y", value: t.return1Y },
  ];

  const pivots = [
    { label: "R1", value: t.r1 },
    { label: "Pivot", value: t.pivot },
    { label: "S1", value: t.s1 },
  ];

  return (
    <div>
      <SectionHeading
        icon={Activity}
        kicker="Chart Signals"
        title="Technical View"
        right={
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              TREND_CLASS[t.trend] ?? TREND_CLASS.Neutral
            )}
          >
            {t.trend}
          </span>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* RSI */}
        <CardShell label="RSI (14)">
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="font-display text-2xl font-bold tabular-nums text-text">
              {t.rsi14.toFixed(1)}
            </p>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider",
                t.rsi14 > 70 ? "text-danger" : t.rsi14 < 30 ? "text-success" : "text-muted-foreground"
              )}
            >
              {t.rsi14 > 70 ? "Overbought" : t.rsi14 < 30 ? "Oversold" : "Neutral"}
            </span>
          </div>
          <div className="relative mt-5 h-2 rounded-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500">
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-text shadow"
              style={{ left: `${clamp(t.rsi14, 0, 100)}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">30 oversold · 70 overbought</p>
        </CardShell>

        {/* MACD */}
        <CardShell label="MACD (12, 26, 9)">
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">MACD</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums text-text">
                {fmtInr(t.macd)}
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Signal</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums text-text">
                {fmtInr(t.macdSignal)}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              bullishCross
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            )}
          >
            {bullishCross ? "Bullish crossover" : "Bearish crossover"}
          </span>
        </CardShell>

        {/* Moving averages */}
        <CardShell label="Moving Averages">
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">EMA 20</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text">{fmtInr(t.ema20)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">EMA 50</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text">{fmtInr(t.ema50)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">SMA 200</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text">{fmtInr(t.sma200)}</p>
            </div>
          </div>
          <p
            className={cn(
              "mt-4 text-xs font-medium",
              above200 ? "text-success" : "text-danger"
            )}
          >
            Price {above200 ? "above" : "below"} 200-DMA
          </p>
        </CardShell>

        {/* Risk metrics */}
        <CardShell label="Risk Metrics">
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Volatility 3M
              </p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums text-text">
                {numOrDash(t.volatility3M, 1, "%")}
              </p>
              <p className="text-[9px] text-muted-foreground">annualised</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Drawdown 1Y
              </p>
              <p className={cn("mt-1 font-display text-lg font-bold tabular-nums", pctClass(t.drawdown1Y))}>
                {fmtPct(t.drawdown1Y, 1)}
              </p>
              <p className="text-[9px] text-muted-foreground">below 1Y peak</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/40 pt-3">
            {pivots.map((p) => (
              <div key={p.label}>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{p.label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-text">
                  {fmtInr(p.value)}
                </p>
              </div>
            ))}
          </div>
        </CardShell>

        {/* Returns */}
        <CardShell label="Price Returns" className="md:col-span-2 xl:col-span-1">
          <div className="mt-2 grid grid-cols-4 gap-2 md:grid-cols-4">
            {returns.map((r) => (
              <div key={r.label}>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{r.label}</p>
                <p className={cn("mt-1 text-sm font-bold tabular-nums", pctClass(r.value))}>
                  {fmtPct(r.value, 1)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground">
            Trailing price performance across horizons.
          </p>
        </CardShell>
      </div>
    </div>
  );
}
