"use client";

import { CalendarRange, Coins, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import type { PricePoint } from "@/shared/price-stats";
import { sipBacktest } from "@/shared/sip-backtest";

const AMOUNTS = [1_000, 5_000, 10_000, 25_000];
const PERIODS = [1, 3, 5];

function rupees(value: number) {
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function signed(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/**
 * "What if I'd put ₹X in every month?"
 *
 * The monthly instalment is how most Indian retail money reaches the market,
 * and it produces a different answer from the lump sum that every trailing
 * return figure silently assumes. Both are shown side by side because neither
 * wins in general — buying monthly through a fall accumulates cheap units,
 * buying monthly into a rally pays up each time — and only the actual price
 * path decides which happened here.
 */
export function SipSimulator({ history }: { history?: PricePoint[] }) {
  const [monthlyAmount, setMonthlyAmount] = useState(5_000);
  const [years, setYears] = useState(3);

  const result = useMemo(
    () => sipBacktest(history, { monthlyAmount, years }),
    [history, monthlyAmount, years]
  );

  // Probe the longest period so the card hides entirely when the history can
  // never support a SIP, rather than appearing and then going blank when the
  // user picks 5Y.
  const hasAnyResult = useMemo(
    () => Boolean(sipBacktest(history, { monthlyAmount: 1_000, years: 1 })),
    [history]
  );
  if (!hasAnyResult) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-sky-400 to-blue-500" />
        <h3 className="text-lg font-semibold">SIP Simulator</h3>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        What a fixed monthly investment in this stock would have grown to.
      </p>

      {/* Controls */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-muted">
            Monthly
          </span>
          {AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              aria-pressed={amount === monthlyAmount}
              onClick={() => setMonthlyAmount(amount)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                amount === monthlyAmount
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border/50 text-muted hover:text-fg"
              }`}
            >
              {rupees(amount)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-muted">
            For
          </span>
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={period === years}
              onClick={() => setYears(period)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                period === years
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border/50 text-muted hover:text-fg"
              }`}
            >
              {period}Y
            </button>
          ))}
        </div>
      </div>

      {!result ? (
        <p className="mt-4 rounded-xl border border-border/40 bg-bg/40 px-3 py-4 text-center text-[11px] text-muted">
          Not enough price history for a {years}-year SIP. Try a shorter period.
        </p>
      ) : (
        <>
          {/* Headline */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/40 bg-bg/40 px-3 py-2.5">
              <p className="text-[10px] text-muted">Invested</p>
              <p className="text-base font-bold tabular-nums">{rupees(result.totalInvested)}</p>
              <p className="text-[10px] leading-3 text-muted/70">
                {result.installments} instalments
              </p>
            </div>
            <div className="rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5">
              <p className="text-[10px] text-muted">Worth today</p>
              <p
                className={`text-base font-bold tabular-nums ${
                  result.currentValue >= result.totalInvested ? "text-success" : "text-danger"
                }`}
              >
                {rupees(result.currentValue)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                {signed(result.absoluteReturnPercent)} overall
              </p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
              <p className="text-[10px] text-muted">Annualised</p>
              <p className="text-sm font-bold tabular-nums">
                {/* Money-weighted, so a late instalment isn't credited with the
                    whole period's growth. */}
                {result.xirrPercent === null ? "—" : signed(result.xirrPercent)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">XIRR</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
              <p className="text-[10px] text-muted">Avg cost</p>
              <p className="text-sm font-bold tabular-nums">
                ₹{result.averageCostPerUnit.toFixed(2)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">
                now ₹{result.latestPrice.toFixed(2)}
              </p>
            </div>
            <div className="col-span-2 rounded-lg border border-border/40 bg-bg/40 px-2 py-2 sm:col-span-1">
              <p className="text-[10px] text-muted">Units</p>
              <p className="text-sm font-bold tabular-nums">
                {result.unitsAccumulated.toFixed(2)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">shares accumulated</p>
            </div>
          </div>

          {/* The counterfactual most return figures assume without saying so. */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/40 bg-bg/30 px-3 py-2.5">
            {result.sipBeatLumpSum ? (
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <p className="text-[11px] leading-4 text-muted">
              Investing the same {rupees(result.totalInvested)} in one go on{" "}
              {result.firstInvestmentDate} would be worth{" "}
              <span className="font-semibold text-fg">{rupees(result.lumpSumValue)}</span> (
              {signed(result.lumpSumReturnPercent)}).{" "}
              {result.sipBeatLumpSum
                ? "Staggering won here — the monthly buys picked up units at lower prices."
                : "The lump sum won here — every later instalment bought at a higher price."}
            </p>
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
            <CalendarRange className="mt-0.5 h-3 w-3 shrink-0" />
            Buys at the first available close on or after the 1st of each month, from{" "}
            {result.firstInvestmentDate} to {result.lastInvestmentDate}. Excludes brokerage, STT
            and taxes, and assumes no dividends were reinvested.
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
            <Coins className="mt-0.5 h-3 w-3 shrink-0" />
            A single stock is not a mutual fund SIP — this carries undiversified company risk. Past
            performance does not predict future returns.
          </p>
        </>
      )}
    </Card>
  );
}
