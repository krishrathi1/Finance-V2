"use client";

import { Gauge } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import type { StockDashboard, KeyRatios } from "@/lib/types";
import { cn } from "@/lib/utils";
import { numOrDash } from "./helpers";

/** Color P/E green if <20, red if >40; D/E green if <0.5, red if >1.5. */
function peClass(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  if (v < 20) return "text-success";
  if (v > 40) return "text-danger";
  return "text-text";
}

function deClass(v: number): string {
  if (v < 0.5) return "text-success";
  if (v > 1.5) return "text-danger";
  return "text-text";
}

interface RatioCardProps {
  title: string;
  rows: { label: string; value: string; valueClass?: string }[];
}

function RatioCard({ title, rows }: RatioCardProps) {
  return (
    <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</dt>
            <dd className={cn("mt-0.5 font-display text-sm font-semibold tabular-nums", r.valueClass ?? "text-text")}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Key valuation / profitability / leverage / efficiency ratios. */
export function KeyRatiosSection({ d }: { d: StockDashboard }) {
  const k: KeyRatios = d.keyRatios;

  return (
    <div>
      <SectionHeading
        icon={Gauge}
        kicker="Fundamentals"
        title="Key Ratios"
        right={<span className="text-xs text-muted-foreground">Stable per-symbol</span>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
        <RatioCard
          title="Valuation"
          rows={[
            { label: "P/E", value: k.valuation.pe === null ? "—" : numOrDash(k.valuation.pe, 1), valueClass: peClass(k.valuation.pe) },
            { label: "P/B", value: numOrDash(k.valuation.pb, 1) },
            { label: "PEG", value: numOrDash(k.valuation.peg, 2) },
            { label: "EV/EBITDA", value: numOrDash(k.valuation.evEbitda, 1) },
            { label: "EV/Sales", value: numOrDash(k.valuation.evSales, 2) },
            { label: "Div Yield", value: numOrDash(k.valuation.dividendYield, 2, "%") },
          ]}
        />

        <RatioCard
          title="Profitability"
          rows={[
            { label: "ROE", value: numOrDash(k.profitability.roe, 1, "%") },
            { label: "ROCE", value: numOrDash(k.profitability.roce, 1, "%") },
            { label: "ROA", value: numOrDash(k.profitability.roa, 1, "%") },
            { label: "Gross Margin", value: numOrDash(k.profitability.grossMargin, 1, "%") },
            { label: "OPM", value: numOrDash(k.profitability.opm, 1, "%") },
            { label: "NPM", value: numOrDash(k.profitability.npm, 1, "%") },
          ]}
        />

        <RatioCard
          title="Leverage"
          rows={[
            { label: "Debt / Equity", value: numOrDash(k.leverage.debtEquity, 2), valueClass: deClass(k.leverage.debtEquity) },
            { label: "Current Ratio", value: numOrDash(k.leverage.currentRatio, 2) },
            { label: "Quick Ratio", value: numOrDash(k.leverage.quickRatio, 2) },
            { label: "Interest Cover", value: numOrDash(k.leverage.interestCoverage, 1, "x") },
          ]}
        />

        <RatioCard
          title="Efficiency"
          rows={[
            { label: "Asset Turnover", value: numOrDash(k.efficiency.assetTurnover, 2) },
            { label: "Inventory Days", value: numOrDash(k.efficiency.inventoryDays, 0) },
            { label: "Receivable Days", value: numOrDash(k.efficiency.receivableDays, 0) },
          ]}
        />
      </div>
    </div>
  );
}
