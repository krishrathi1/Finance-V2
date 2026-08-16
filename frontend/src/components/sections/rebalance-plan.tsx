"use client";

import { ArrowDownRight, ArrowUpRight, Scale, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HoldingWithValue } from "@/lib/portfolio";
import {
  DEFAULT_MAX_WEIGHT_PERCENT,
  rebalancePlan,
  type RebalanceStrategy,
} from "@/shared/rebalance";

function rupees(value: number) {
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

const STRATEGIES: Array<{ key: RebalanceStrategy; label: string; hint: string }> = [
  {
    key: "cap",
    label: `Cap at ${DEFAULT_MAX_WEIGHT_PERCENT}%`,
    hint: `Trims only positions above ${DEFAULT_MAX_WEIGHT_PERCENT}%, leaving the rest untouched.`,
  },
  {
    key: "equal",
    label: "Equal weight",
    hint: "Moves every position toward an equal share of the portfolio.",
  },
];

/**
 * The trades that would move the portfolio back toward its target shape.
 *
 * The Concentration card above measures the problem; this one answers "so what
 * do I do about it". Kept separate because the diagnosis is always worth
 * showing and the prescription only sometimes is — and because a plan the user
 * hasn't asked for shouldn't be the first thing they read.
 */
export function RebalancePlan({ holdings }: { holdings: HoldingWithValue[] }) {
  const [strategy, setStrategy] = useState<RebalanceStrategy>("cap");

  const plan = useMemo(
    () =>
      rebalancePlan(
        holdings.map((holding) => ({
          symbol: holding.symbol,
          companyName: holding.companyName,
          quantity: holding.quantity,
          // Only live prices: a plan built on stale purchase prices would sell
          // the wrong positions.
          price: holding.currentPrice ?? Number.NaN,
        })),
        { strategy }
      ),
    [holdings, strategy]
  );

  if (!plan) return null;

  const active = STRATEGIES.find((entry) => entry.key === strategy)!;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-accent" />
            Rebalancing Plan
          </CardTitle>
          <div
            className="flex rounded-xl border border-border/50 bg-bg/40 p-0.5"
            role="tablist"
            aria-label="Rebalancing strategy"
          >
            {STRATEGIES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={entry.key === strategy}
                onClick={() => setStrategy(entry.key)}
                className={`rounded-[10px] px-3 py-1 text-xs font-semibold transition ${
                  entry.key === strategy ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-[11px] leading-4 text-muted">{active.hint}</p>

        {plan.trades.length === 0 ? (
          <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-3 text-[11px] leading-4 text-muted">
            Nothing worth trading — every position is already inside target, or the corrections are
            too small to cover the brokerage.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {plan.trades.map((trade) => (
                <div
                  key={`${trade.symbol}-${trade.action}`}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      trade.action === "sell"
                        ? "bg-rose-500/15 text-rose-500"
                        : "bg-emerald-500/15 text-emerald-600"
                    }`}
                  >
                    {trade.action === "sell" ? (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {trade.action === "sell" ? "Sell" : "Buy"} {trade.quantity.toLocaleString("en-IN")}{" "}
                      {trade.symbol}
                    </p>
                    <p className="truncate text-[10px] text-muted">{trade.reason}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums">{rupees(trade.value)}</p>
                    <p className="text-[10px] tabular-nums text-muted">
                      {trade.currentWeightPercent.toFixed(1)}% →{" "}
                      {trade.targetWeightPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Turnover is the cost of the plan, and the reason not to run it
                more often than necessary. */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
                <p className="text-[10px] text-muted">Turnover</p>
                <p className="text-sm font-bold tabular-nums">{rupees(plan.turnover)}</p>
                <p className="text-[10px] leading-3 text-muted/70">
                  {plan.turnoverPercent.toFixed(0)}% of book
                </p>
              </div>
              <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
                <p className="text-[10px] text-muted">Top weight</p>
                <p className="text-sm font-bold tabular-nums">
                  {plan.topWeightBefore.toFixed(0)}% → {plan.topWeightAfter.toFixed(0)}%
                </p>
                <p className="text-[10px] leading-3 text-muted/70">after trades</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
                <p className="text-[10px] text-muted">Net cash</p>
                <p
                  className={`text-sm font-bold tabular-nums ${
                    plan.residualCash >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {plan.residualCash >= 0 ? "+" : "−"}
                  {rupees(Math.abs(plan.residualCash))}
                </p>
                <p className="text-[10px] leading-3 text-muted/70">
                  {plan.residualCash >= 0 ? "freed up" : "needed"}
                </p>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
              <Wallet className="mt-0.5 h-3 w-3 shrink-0" />
              Whole shares at current prices, ignoring brokerage, STT and the capital-gains tax a
              sale may trigger — check the Capital Gains card before selling. Not investment
              advice.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
