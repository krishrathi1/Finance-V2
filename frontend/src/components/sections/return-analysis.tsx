import { CalendarDays, ShieldAlert, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { PricePoint } from "@/shared/price-stats";
import { calendarYearReturns, downsideRisk, trailingReturns } from "@/shared/return-analytics";

function signed(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function tone(value: number) {
  return value >= 0 ? "text-success" : "text-danger";
}

/**
 * Trailing returns, calendar-year returns and downside risk.
 *
 * Separated from the Risk Profile card because these answer a different
 * question: not "how risky is it" but "when did the return actually happen".
 * A stock can show a strong five-year CAGR that came entirely from one year.
 */
export function ReturnAnalysis({ history }: { history?: PricePoint[] }) {
  const trailing = trailingReturns(history);
  const calendar = calendarYearReturns(history).slice(0, 6);
  const downside = downsideRisk(history);

  if (!trailing.length && !calendar.length && !downside) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-cyan-500" />
        <h3 className="text-lg font-semibold">Return Analysis</h3>
      </div>

      {trailing.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <TrendingUp className="h-3 w-3" /> Trailing returns
          </p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {trailing.map((entry) => (
              <div
                key={entry.label}
                className="rounded-lg border border-border/40 bg-bg/40 px-1 py-2 text-center"
              >
                <p className="text-[10px] font-medium text-muted">{entry.label}</p>
                <p className={`text-xs font-bold tabular-nums ${tone(entry.percent)}`}>
                  {signed(entry.percent)}
                </p>
                {/* Marking which figures are annualised stops a 5Y number being
                    read as a total, which would overstate it several-fold. */}
                {entry.annualised ? (
                  <p className="text-[9px] leading-3 text-muted/70">p.a.</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {calendar.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <CalendarDays className="h-3 w-3" /> Calendar year returns
          </p>
          <div className="space-y-1">
            {calendar.map((entry) => {
              // Scale bars against the largest absolute move so one huge year
              // doesn't flatten every other bar into invisibility.
              const widest = Math.max(...calendar.map((item) => Math.abs(item.percent)), 1);
              const width = (Math.abs(entry.percent) / widest) * 100;
              return (
                <div key={entry.year} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">
                    {entry.year}
                  </span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg/60">
                    <div
                      className={`absolute inset-y-0 rounded ${
                        entry.percent >= 0 ? "left-1/2 bg-success/60" : "right-1/2 bg-danger/60"
                      }`}
                      style={{ width: `${width / 2}%` }}
                    />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  </div>
                  <span
                    className={`w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums ${tone(
                      entry.percent
                    )}`}
                  >
                    {signed(entry.percent)}
                  </span>
                  {!entry.complete ? (
                    <span className="w-10 shrink-0 text-[9px] text-muted/70">partial</span>
                  ) : (
                    <span className="w-10 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {downside && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <ShieldAlert className="h-3 w-3" /> Downside risk
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
              <p className="text-[10px] text-muted">1-day VaR (95%)</p>
              <p className="text-sm font-bold tabular-nums text-danger">
                -{downside.valueAtRisk95.toFixed(1)}%
              </p>
              <p className="text-[10px] leading-3 text-muted/70">Worse on 1 day in 20</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
              <p className="text-[10px] text-muted">Expected shortfall</p>
              <p className="text-sm font-bold tabular-nums text-danger">
                -{downside.expectedShortfall95.toFixed(1)}%
              </p>
              <p className="text-[10px] leading-3 text-muted/70">Average of those days</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
              <p className="text-[10px] text-muted">Downside deviation</p>
              <p className="text-sm font-bold tabular-nums">
                {downside.downsideDeviation.toFixed(1)}%
              </p>
              <p className="text-[10px] leading-3 text-muted/70">Volatility of losses only</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
              <p className="text-[10px] text-muted">Sortino ratio</p>
              <p
                className={`text-sm font-bold tabular-nums ${
                  downside.sortinoRatio === null
                    ? "text-muted"
                    : tone(downside.sortinoRatio)
                }`}
              >
                {downside.sortinoRatio === null ? "—" : downside.sortinoRatio.toFixed(2)}
              </p>
              <p className="text-[10px] leading-3 text-muted/70">Return per unit of downside</p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-4 text-muted/70">
        Calculated from past prices. Past performance does not predict future returns.
      </p>
    </Card>
  );
}
