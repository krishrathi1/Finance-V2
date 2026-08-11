import { Activity, ArrowDownRight, CalendarRange, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  annualisedVolatility,
  maxDrawdown,
  priceCagr,
  rangePosition,
  returnDistribution,
  type PricePoint,
} from "@/shared/price-stats";

function fmtPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value >= 0 ? "" : ""}${value.toFixed(digits)}%`;
}

function fmtInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
  icon: React.ElementType;
}) {
  const valueTone =
    tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-text";
  return (
    <div className="rounded-xl border border-border/45 bg-bg/40 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className={`mt-1 text-base font-bold tabular-nums ${valueTone}`}>{value}</p>
      {sub ? <p className="text-[11px] leading-4 text-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * Risk profile derived from the daily price history already in the payload.
 *
 * A price chart shows what happened; these state what it *means* — how far the
 * stock has fallen from a peak before, how violently it moves day to day, and
 * what holding it has actually compounded at. All computed client-side from
 * data already fetched, so it costs no extra provider call.
 */
export function PriceRiskProfile({
  history,
  currentPrice,
  fiftyTwoWeekLow,
  fiftyTwoWeekHigh,
}: {
  history?: PricePoint[];
  currentPrice?: number | null;
  fiftyTwoWeekLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
}) {
  const drawdown = maxDrawdown(history);
  const volatility = annualisedVolatility(history);
  const cagr = priceCagr(history);
  const distribution = returnDistribution(history);
  const range = rangePosition(currentPrice, fiftyTwoWeekLow, fiftyTwoWeekHigh);

  // Nothing computable means an empty or unusably short series; a card of
  // em-dashes is worse than no card.
  if (!drawdown && volatility === null && cagr === null && !range) return null;

  const years = history && history.length ? Math.round((history.length / 252) * 10) / 10 : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
        <h3 className="text-lg font-semibold">Risk Profile</h3>
        {years ? (
          <span className="ml-auto text-[11px] text-muted">{years}y of daily prices</span>
        ) : null}
      </div>

      {/* 52-week position: where today's price sits between the year's extremes. */}
      {range ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[11px] text-muted">
            <span>52-week range</span>
            <span className="tabular-nums">
              {range.percent.toFixed(0)}% of the way up
            </span>
          </div>
          <div className="relative mt-1.5 h-2 w-full rounded-full bg-gradient-to-r from-danger/30 via-amber-400/30 to-success/30">
            <div
              className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-text shadow"
              style={{ left: `calc(${range.percent}% - 2px)` }}
              aria-hidden="true"
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
            <span>{fiftyTwoWeekLow ? fmtInr(fiftyTwoWeekLow) : "—"}</span>
            <span>{fiftyTwoWeekHigh ? fmtInr(fiftyTwoWeekHigh) : "—"}</span>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {range.fromHighPercent <= 0
              ? `${Math.abs(range.fromHighPercent).toFixed(1)}% below the 52-week high`
              : `${range.fromHighPercent.toFixed(1)}% above the 52-week high`}
            {" · "}
            {range.fromLowPercent >= 0
              ? `${range.fromLowPercent.toFixed(1)}% above the low`
              : `${Math.abs(range.fromLowPercent).toFixed(1)}% below the low`}
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cagr !== null && (
          <Stat
            label="Annualised return"
            value={fmtPercent(cagr)}
            sub="Compounded over the period"
            tone={cagr >= 0 ? "good" : "bad"}
            icon={TrendingUp}
          />
        )}
        {volatility !== null && (
          <Stat
            label="Volatility"
            value={fmtPercent(volatility, 0)}
            sub="Annualised, daily moves"
            icon={Activity}
          />
        )}
        {drawdown && (
          <Stat
            label="Worst drawdown"
            value={fmtPercent(drawdown.percent)}
            sub={drawdown.recovered ? "Since recovered" : "Not yet recovered"}
            tone="bad"
            icon={ArrowDownRight}
          />
        )}
        {distribution && (
          <Stat
            label="Up days"
            value={`${distribution.positiveShare.toFixed(0)}%`}
            sub={`${distribution.positiveDays} of ${distribution.totalDays} sessions`}
            icon={CalendarRange}
          />
        )}
        {distribution && (
          <Stat
            label="Best day"
            value={fmtPercent(distribution.bestDayPercent)}
            sub={`Longest run ${distribution.longestWinStreak}d`}
            tone="good"
            icon={TrendingUp}
          />
        )}
        {distribution && (
          <Stat
            label="Worst day"
            value={fmtPercent(distribution.worstDayPercent)}
            sub={`Longest slide ${distribution.longestLossStreak}d`}
            tone="bad"
            icon={ArrowDownRight}
          />
        )}
      </div>

      {drawdown && (
        <p className="mt-3 border-t border-border/40 pt-2 text-[11px] leading-4 text-muted">
          Deepest fall ran from {fmtInr(drawdown.peakPrice)} on {drawdown.peakDate} to{" "}
          {fmtInr(drawdown.troughPrice)} on {drawdown.troughDate}.{" "}
          {drawdown.recovered
            ? "The price has since regained that peak."
            : "The price has not regained that peak."}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-4 text-muted/70">
        Calculated from past prices. Past performance does not predict future returns.
      </p>
    </Card>
  );
}
