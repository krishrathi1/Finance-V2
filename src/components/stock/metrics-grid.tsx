"use client";

import { LayoutGrid } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { fmtCr, fmtInr } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { numOrDash } from "./helpers";

interface StatDef {
  label: string;
  value: string;
  valueClass?: string;
}

/** Fundamentals: 12 key-metric stat cards + company profile / about card. */
export function MetricsGrid({ d }: { d: StockDashboard }) {
  const m = d.metrics;

  const stats: StatDef[] = [
    { label: "Market Cap", value: fmtCr(m.marketCapCr) },
    {
      label: "P/E",
      value: m.pe === null ? "Loss-making" : m.pe.toFixed(1),
      valueClass: m.pe === null ? "mt-0.5 text-sm font-semibold text-danger" : undefined,
    },
    { label: "P/B", value: numOrDash(m.pb, 1) },
    { label: "ROE", value: numOrDash(m.roe, 1, "%") },
    { label: "ROCE", value: numOrDash(m.roce, 1, "%") },
    { label: "EPS", value: fmtInr(m.eps) },
    { label: "Book Value", value: fmtInr(m.bookValue) },
    { label: "Dividend Yield", value: numOrDash(m.dividendYield, 2, "%") },
    { label: "Debt / Equity", value: numOrDash(m.debtEquity, 2) },
    { label: "Revenue", value: fmtCr(m.revenueCr) },
    { label: "Net Profit", value: fmtCr(m.netProfitCr) },
    { label: "Face Value", value: fmtInr(m.faceValue, 0) },
  ];

  return (
    <div>
      <SectionHeading icon={LayoutGrid} kicker="Fundamentals" title="Key Metrics" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p
              className={cn(
                "mt-1.5 font-display text-xl font-bold tabular-nums text-text",
                s.valueClass
              )}
              title={s.value}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Company description + profile meta */}
      <div className="mt-4 rounded-2xl border border-border/50 bg-panel/40 p-5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          About {d.companyName}
        </p>
        <p className="mt-2 text-sm leading-6 text-text/85">{d.profile.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span>
            Founded <span className="text-text/80">{d.profile.incorporationYear}</span>
          </span>
          <span>
            HQ <span className="text-text/80">{d.profile.headquarters}</span>
          </span>
          <span>
            Chairman <span className="text-text/80">{d.profile.chairman}</span>
          </span>
          <span>
            <span className="text-text/80">{d.profile.employees.toLocaleString("en-IN")}</span>{" "}
            employees
          </span>
          {d.profile.website && (
            <a
              href={
                d.profile.website.startsWith("http") ? d.profile.website : `https://${d.profile.website}`
              }
              target="_blank"
              rel="noreferrer"
              className="text-brand transition hover:underline"
            >
              {d.profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
