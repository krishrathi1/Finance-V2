"use client";

import { Banknote, CalendarCheck, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { dividendTrackRecord, type DividendRecord } from "@/shared/dividend-history";
import { todayIstDateKey } from "@/shared/market-status";

const DIRECTION = {
  rising: { label: "Growing", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" },
  steady: { label: "Steady", chip: "border-sky-500/30 bg-sky-500/10 text-sky-600" },
  falling: { label: "Shrinking", chip: "border-amber-500/30 bg-amber-500/10 text-amber-600" },
} as const;

/**
 * Dividend track record.
 *
 * The corporate-actions tab already lists every declaration. A list answers
 * "what was declared"; an income investor is asking whether the company has
 * paid every year, whether the payout is growing, and what it yields at
 * today's price. All three come from the same rows, grouped by financial year.
 */
export function DividendTrackRecord({
  dividends,
  currentPrice,
}: {
  dividends?: DividendRecord[] | null;
  currentPrice?: number | null;
}) {
  const record = dividendTrackRecord(dividends, currentPrice, todayIstDateKey());

  // A company that has never paid shows nothing. "₹0.00 across 0 years"
  // renders as a broken card rather than as a growth company reinvesting.
  if (!record) return null;

  const years = record.years.slice(0, 6);
  const peak = Math.max(...years.map((year) => year.total), 0);
  const direction = record.direction ? DIRECTION[record.direction] : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-lime-400 to-emerald-500" />
        <h3 className="text-lg font-semibold">Dividend Record</h3>
        {direction ? (
          <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${direction.chip}`}>
            {direction.label}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted">Yield</p>
          <p className="text-sm font-bold tabular-nums text-success">
            {record.yieldPercent === null ? "—" : `${record.yieldPercent.toFixed(2)}%`}
          </p>
          <p className="text-[10px] leading-3 text-muted/70">
            ₹{record.trailingTwelveMonths.toFixed(2)} in 12m
          </p>
        </div>
        <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted">Paid</p>
          <p className="text-sm font-bold tabular-nums">{record.consecutiveYears}</p>
          <p className="text-[10px] leading-3 text-muted/70">
            {record.consecutiveYears === 1 ? "year running" : "years running"}
          </p>
        </div>
        <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2 text-center">
          <p className="text-[10px] text-muted">Growth</p>
          <p
            className={`text-sm font-bold tabular-nums ${
              record.growthCagrPercent === null
                ? ""
                : record.growthCagrPercent >= 0
                ? "text-success"
                : "text-danger"
            }`}
          >
            {record.growthCagrPercent === null
              ? "—"
              : `${record.growthCagrPercent >= 0 ? "+" : ""}${record.growthCagrPercent.toFixed(1)}%`}
          </p>
          <p className="text-[10px] leading-3 text-muted/70">per year</p>
        </div>
      </div>

      {/* Per-year totals as bars: the shape of the record is the point, and a
          column of numbers hides a cut or a skipped year. */}
      <div className="mt-3 space-y-1.5">
        {years.map((year) => (
          <div key={year.financialYear} className="flex items-center gap-2">
            <span className="w-[52px] shrink-0 text-[10px] tabular-nums text-muted">
              FY{year.financialYear.slice(2)}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-500"
                style={{ width: `${peak > 0 ? Math.max(2, (year.total / peak) * 100) : 2}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums">
              ₹{year.total.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-muted/70">
        <CalendarCheck className="mt-0.5 h-3 w-3 shrink-0" />
        Latest: ₹{record.latestPayout?.amount.toFixed(2)} ex-date {record.latestPayout?.date}.
        Grouped by financial year (Apr–Mar), so an interim and a final count once.
      </p>
      <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
        {record.direction === "falling" ? (
          <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
        ) : (
          <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
        )}
        Growth measures complete financial years only — the current year is still open, and
        comparing a part-year against full ones would show a cut that hasn&apos;t happened.
      </p>
      <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-muted/60">
        <Banknote className="mt-0.5 h-3 w-3 shrink-0" />
        Declared amounts per share. Dividends are taxed at your slab rate in India.
      </p>
    </Card>
  );
}
