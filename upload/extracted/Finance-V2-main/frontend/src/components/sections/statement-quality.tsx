import { Banknote, PieChart, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  cashConversion,
  duPont,
  freeCashFlowYield,
  growthProfile,
  leverageTrend,
  netMarginTrend,
  type StatementInput,
} from "@/shared/statement-analytics";

function pct(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

const DRIVER_COPY: Record<"margin" | "turnover" | "leverage", string> = {
  margin: "Driven mainly by profit margins — pricing power rather than borrowing.",
  turnover: "Driven mainly by asset efficiency — the balance sheet works hard.",
  leverage: "Driven mainly by leverage — returns rest on borrowed money.",
};

function TrendPill({ change, invert = false }: { change: number | null; invert?: boolean }) {
  if (change === null) return null;
  // For leverage, falling is the good direction — hence `invert`.
  const good = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        good ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
      }`}
    >
      <Icon className="h-2.5 w-2.5" />
      {change >= 0 ? "+" : ""}
      {change.toFixed(1)} pts
    </span>
  );
}

/**
 * What sits behind the headline ratios: how ROE is actually earned, whether
 * profit converts to cash, and which direction margins and leverage are moving.
 *
 * Deliberately separate from the Quality & Safety scorecard — that grades
 * against thresholds, this explains composition. Two companies can pass the
 * same checks while earning their returns in completely different ways.
 */
export function StatementQuality({
  financials,
  marketCap,
}: {
  /** Loosely typed to match the dashboard payload, as QualityScore does — the
   *  analytics below null-check every field they read. */
  financials?: { incomeStatement?: any[]; balanceSheet?: any[]; cashFlow?: any[] };
  marketCap?: number | null;
}) {
  const statements: StatementInput = {
    incomeStatement: financials?.incomeStatement,
    balanceSheet: financials?.balanceSheet,
    cashFlow: financials?.cashFlow,
  };

  const dupont = duPont(statements);
  const conversion = cashConversion(statements);
  const fcfYield = freeCashFlowYield(statements, marketCap);
  const margins = netMarginTrend(statements);
  const leverage = leverageTrend(statements);
  const growth = growthProfile(statements);

  if (!dupont && !conversion && fcfYield === null && !margins && !leverage && !growth) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-rose-400 to-pink-500" />
        <h3 className="text-lg font-semibold">Statement Quality</h3>
        {/* Deliberately NOT labelled plainly "ROE". This is the product of the
            three terms below, computed from year-end balance-sheet figures,
            and it can differ from the provider's headline ROE (which typically
            uses average equity, and may be consolidated rather than
            standalone). Showing a bare second "ROE" would contradict the
            metrics grid on the same page. */}
        {dupont ? (
          <span className="ml-auto text-sm font-bold tabular-nums">
            {dupont.roe.toFixed(1)}%
            <span className="ml-1 text-[10px] font-normal text-muted">implied</span>
          </span>
        ) : null}
      </div>

      {dupont && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <PieChart className="h-3 w-3" /> How that return is earned ({dupont.period})
          </p>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg border border-border/40 bg-bg/40 px-1 py-2">
              <p className="text-[10px] text-muted">Net margin</p>
              <p className="text-sm font-bold tabular-nums">{dupont.netMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-1 py-2">
              <p className="text-[10px] text-muted">Asset turnover</p>
              <p className="text-sm font-bold tabular-nums">{dupont.assetTurnover.toFixed(2)}x</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-bg/40 px-1 py-2">
              <p className="text-[10px] text-muted">Equity multiplier</p>
              <p className="text-sm font-bold tabular-nums">
                {dupont.equityMultiplier.toFixed(2)}x
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted">
            {DRIVER_COPY[dupont.primaryDriver]}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-muted/70">
            Margin × turnover × multiplier = {dupont.roe.toFixed(1)}% implied return on equity.
            Computed from year-end figures, so it can differ from the reported ROE above, which is
            usually based on average equity.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {conversion && (
          <div className="rounded-xl border border-border/40 bg-bg/40 p-3">
            <div className="flex items-center gap-1.5">
              <Banknote className="h-3 w-3 text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Cash conversion
              </p>
            </div>
            <p
              className={`mt-1 text-base font-bold tabular-nums ${
                conversion.quality === "strong"
                  ? "text-success"
                  : conversion.quality === "adequate"
                  ? "text-amber-400"
                  : "text-danger"
              }`}
            >
              {conversion.ratio.toFixed(2)}x
            </p>
            <p className="text-[11px] leading-4 text-muted">
              {conversion.ratio >= 1
                ? "Operating cash flow exceeds reported profit."
                : "Reported profit is not fully arriving as cash."}
            </p>
          </div>
        )}

        {fcfYield !== null && (
          <div className="rounded-xl border border-border/40 bg-bg/40 p-3">
            <div className="flex items-center gap-1.5">
              <Banknote className="h-3 w-3 text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Free cash flow yield
              </p>
            </div>
            <p
              className={`mt-1 text-base font-bold tabular-nums ${
                fcfYield >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {pct(fcfYield)}
            </p>
            <p className="text-[11px] leading-4 text-muted">
              Cash generated against market value — harder to flatter than P/E.
            </p>
          </div>
        )}
      </div>

      {(margins || leverage || growth) && (
        <div className="mt-4 space-y-1.5 border-t border-border/40 pt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Direction of travel
          </p>
          {margins && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs">
                Net margin{" "}
                <span className="text-muted">
                  {margins.points[0].value.toFixed(1)}% →{" "}
                  {margins.points[margins.points.length - 1].value.toFixed(1)}%
                </span>
              </span>
              <TrendPill change={margins.change} />
            </div>
          )}
          {leverage && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs">
                Debt to assets{" "}
                <span className="text-muted">
                  {leverage.points[0].value.toFixed(1)}% →{" "}
                  {leverage.points[leverage.points.length - 1].value.toFixed(1)}%
                </span>
              </span>
              <TrendPill change={leverage.change} invert />
            </div>
          )}
          {growth && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs">
                Growth over {growth.years}y{" "}
                <span className="text-muted">
                  revenue {pct(growth.revenueCagr)} · profit {pct(growth.profitCagr)} p.a.
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
