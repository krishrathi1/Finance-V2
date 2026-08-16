"use client";

import { CalendarClock, Landmark, Scale, Sprout } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TAX_ESTIMATE_DISCLAIMER,
  capitalGainsByYear,
  harvestHeadroom,
} from "@/shared/capital-gains";
import { matchFifo } from "@/shared/portfolio-returns";
import type { Transaction } from "@/lib/transactions";
import { todayIstDateKey } from "@/shared/market-status";

function rupees(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function signedRupees(value: number) {
  return `${value < 0 ? "-" : ""}₹${Math.abs(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function Figure({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "accent";
}) {
  const toneClass =
    tone === "good"
      ? "text-success"
      : tone === "bad"
      ? "text-danger"
      : tone === "accent"
      ? "text-accent"
      : "";
  return (
    <div className="rounded-lg border border-border/40 bg-bg/40 px-3 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="text-[10px] leading-3 text-muted/70">{hint}</p> : null}
    </div>
  );
}

/**
 * Realised capital gains and the tax they imply, by Indian financial year.
 *
 * The ledger already knows every matched lot and whether it was short- or
 * long-term — that classification exists precisely because it is a tax rule.
 * Stopping at a coloured "LTCG" badge left the user to do the one calculation
 * they actually came for, in a spreadsheet, in March.
 *
 * Years come from the data rather than a generated range, so a user who traded
 * in 2023 and again in 2025 doesn't get an empty card for the year between.
 */
export function CapitalGainsStatement({ transactions }: { transactions: Transaction[] }) {
  const years = useMemo(
    () => capitalGainsByYear(matchFifo(transactions).lots),
    [transactions]
  );
  const today = todayIstDateKey();
  const headroom = useMemo(() => harvestHeadroom(years, today), [years, today]);

  const [selected, setSelected] = useState<string | null>(null);
  const active = years.find((year) => year.financialYear === selected) ?? years[0];

  // No sales means no realised gains and nothing to estimate. The harvesting
  // note alone isn't worth a card for someone who has never sold.
  if (!active) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-accent" />
            Capital Gains &amp; Tax
          </CardTitle>

          {years.length > 1 ? (
            <div
              className="flex flex-wrap rounded-xl border border-border/50 bg-bg/40 p-0.5"
              role="tablist"
              aria-label="Financial year"
            >
              {years.map((year) => (
                <button
                  key={year.financialYear}
                  type="button"
                  role="tab"
                  aria-selected={year.financialYear === active.financialYear}
                  onClick={() => setSelected(year.financialYear)}
                  className={`rounded-[10px] px-3 py-1 text-xs font-semibold transition ${
                    year.financialYear === active.financialYear
                      ? "bg-accent/15 text-accent"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  FY {year.financialYear}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs font-semibold text-muted">
              FY {active.financialYear}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Headline: the number the page exists to produce. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Estimated tax
          </span>
          <span className="text-2xl font-bold tabular-nums text-accent">
            {rupees(active.totalTax)}
          </span>
          <span className="text-[11px] text-muted">
            on {active.realisedLots} matched {active.realisedLots === 1 ? "lot" : "lots"} between{" "}
            {active.start} and {active.end}
          </span>
        </div>

        {/* Short vs long term, kept apart because they are taxed apart. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure
            label="Short-term gain"
            value={signedRupees(active.shortTermGain)}
            hint="held under 12 months"
            tone={active.shortTermGain >= 0 ? "good" : "bad"}
          />
          <Figure
            label="Long-term gain"
            value={signedRupees(active.longTermGain)}
            hint="held over 12 months"
            tone={active.longTermGain >= 0 ? "good" : "bad"}
          />
          <Figure
            label="STCG tax"
            value={rupees(active.shortTermTax)}
            hint={`on ${rupees(active.taxableShortTerm)} taxable`}
          />
          <Figure
            label="LTCG tax"
            value={rupees(active.longTermTax)}
            hint={`on ${rupees(active.taxableLongTerm)} taxable`}
          />
        </div>

        {/* The exemption, shown as a bar because "how much is left" is the
            actionable reading and a bare number doesn't convey proportion. */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <Scale className="h-3 w-3" /> Long-term exemption
            </p>
            <p className="text-[11px] tabular-nums text-muted">
              {rupees(active.exemptionUsed)} of {rupees(active.exemptionLimit)} used
            </p>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-border/40"
            role="img"
            aria-label={`${rupees(active.exemptionUsed)} of the ${rupees(
              active.exemptionLimit
            )} long-term exemption used`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
              style={{
                width: `${Math.min(
                  100,
                  (active.exemptionUsed / active.exemptionLimit) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Set-off and carry-forward only appear when a loss actually exists —
            two zero rows on a profitable year is noise. */}
        {(active.lossSetOff > 0 || active.carriedForwardLoss > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {active.lossSetOff > 0 ? (
              <Figure
                label="Loss set off"
                value={rupees(active.lossSetOff)}
                hint="reduced this year's charge"
                tone="good"
              />
            ) : null}
            {active.carriedForwardLoss > 0 ? (
              <Figure
                label="Carried forward"
                value={rupees(active.carriedForwardLoss)}
                hint="usable for up to 8 years if filed on time"
              />
            ) : null}
          </div>
        )}

        {/* Harvesting prompt: an unused exemption expires on 31 March and is the
            only part of this card the user can still change. */}
        {headroom && headroom.financialYear === active.financialYear ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
            <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p className="text-[11px] leading-4 text-muted">
              <span className="font-semibold text-fg">
                {rupees(headroom.exemptionRemaining)} of long-term exemption is still unused
              </span>{" "}
              this financial year. Long-term gains realised up to that amount are tax-free, and the
              allowance does not carry over —{" "}
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                <CalendarClock className="h-3 w-3" />
                {headroom.daysRemaining} {headroom.daysRemaining === 1 ? "day" : "days"} left
              </span>{" "}
              until 31 March.
            </p>
          </div>
        ) : null}

        <p className="text-[10px] leading-4 text-muted/60">
          {TAX_ESTIMATE_DISCLAIMER}
          {active.regimeLabels.length > 1
            ? " This year spans a rate change, so each sale is charged at the rate in force on its own date."
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
