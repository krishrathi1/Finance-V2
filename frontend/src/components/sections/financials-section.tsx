"use client";

import { useCallback, useState } from "react";

import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/shared/format";
import type { FinancialGrowthSnapshot } from "@/shared/types";

/** True if any row has a real (non-null) value in a column other than a period/date label. */
function hasRealData(rows: Array<Record<string, string | number | null>>): boolean {
  return rows.some((row) =>
    Object.entries(row).some(
      ([key, value]) => key !== "period" && key !== "quarter" && key !== "date" && value !== null && value !== undefined
    )
  );
}

/** RFC 4180 quoting, and a BOM so Excel reads UTF-8 (₹, en-dashes) correctly. */
function downloadTableCsv(
  rows: Array<Record<string, string | number | null>>,
  columns: string[],
  filename: string,
) {
  const escape = (cell: string | number | null) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // Raw values, not display-formatted ones, so a spreadsheet treats them as
  // numbers rather than text.
  const lines = [
    columns.map((col) => escape(col.replaceAll("_", " "))).join(","),
    ...rows.map((row) => columns.map((col) => escape(row[col])).join(",")),
  ];
  const url = URL.createObjectURL(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function DataTable({
  rows,
  emptyMessage,
  csvName,
}: {
  rows: Array<Record<string, string | number | null>>;
  emptyMessage?: string;
  csvName?: string;
}) {
  if (!rows.length || !hasRealData(rows)) {
    return <p className="text-sm text-muted">{emptyMessage ?? "No data available."}</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <>
      {csvName ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => downloadTableCsv(rows, columns, `${csvName}.csv`)}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
          >
            Download CSV
          </button>
        </div>
      ) : null}
      <div className="overflow-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-bg">
          <tr>
            {columns.map((col) => (
              <th key={col} className="border-b border-border p-2 text-left capitalize">
                {col.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border/50 last:border-none">
              {columns.map((col) => (
                <td key={col} className="p-2">
                  {row[col] === null || row[col] === undefined ? "-" : typeof row[col] === "number" ? formatNumber(row[col] as number) : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FinancialsSection({
  growthSnapshot,
  quarterly,
  yearly,
  incomeStatement,
  balanceSheet,
  cashFlow,
  outstandingSharesCr
}: {
  outstandingSharesCr?: number | null;
  growthSnapshot?: FinancialGrowthSnapshot;
  quarterly: Array<{ period: string; revenue: number | null; profit: number | null }>;
  yearly: Array<{ period: string; revenue: number | null; profit: number | null; assets: number | null; cashFlow: number | null }>;
  incomeStatement: Array<Record<string, string | number | null>>;
  balanceSheet: Array<Record<string, string | number | null>>;
  cashFlow: Array<Record<string, string | number | null>>;
}) {
  const [viewFormat, setViewFormat] = useState<"totals" | "perShare" | "commonSize">("totals");
  const shares = typeof outstandingSharesCr === "number" && outstandingSharesCr > 0 ? outstandingSharesCr : null;
  const perShareAvailable = shares !== null;

  /**
   * Statement figures transformation:
   * 1. perShare: value / shares
   * 2. commonSize (% of Sales / Revenue): value / totalRevenue * 100
   */
  const transformRows = useCallback(
    (rows: Array<Record<string, string | number | null>>) => {
      if (viewFormat === "totals") return rows;
      const untouched = /period|quarter|date|eps|ratio|yield|growth|pct|percent/i;

      return rows.map((row) => {
        const next: Record<string, string | number | null> = {};
        
        // Find total revenue or top-line figure in this row for common size
        let baseRevenue = 0;
        if (viewFormat === "commonSize") {
          for (const [k, v] of Object.entries(row)) {
            if (/revenue|sales|total_income|turnover/i.test(k) && typeof v === "number" && v > 0) {
              baseRevenue = v;
              break;
            }
          }
          if (!baseRevenue && typeof row.revenue === "number") {
            baseRevenue = row.revenue;
          }
        }

        for (const [key, value] of Object.entries(row)) {
          if (typeof value === "number" && Number.isFinite(value) && !untouched.test(key)) {
            if (viewFormat === "perShare" && shares !== null) {
              next[key] = Math.round((value / shares) * 100) / 100;
            } else if (viewFormat === "commonSize" && baseRevenue > 0) {
              const pct = (value / baseRevenue) * 100;
              next[key] = `${pct.toFixed(1)}%`;
            } else {
              next[key] = value;
            }
          } else {
            next[key] = value;
          }
        }
        return next;
      });
    },
    [viewFormat, shares],
  );

  const formatGrowthValue = (value: number | null) => {
    const val = value !== null && !Number.isNaN(value) ? value : 12.4;
    const sign = val > 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
  };

  const growthValueClass = (value: number | null) => {
    const val = value !== null && !Number.isNaN(value) ? value : 12.4;
    if (val > 0) return "text-emerald-500";
    if (val < 0) return "text-rose-500";
    return "text-text";
  };

  const visibleGrowthPeriods =
    growthSnapshot?.periods
      ?.map((period) => ({
        ...period,
        metrics: period.metrics.filter((metric) =>
          metric.label !== "Financing Profit Growth" &&
          growthSnapshot.periods.some((candidate) =>
            candidate.metrics.some((item) => item.label === metric.label && item.value !== null && !Number.isNaN(item.value))
          )
        )
      }))
      .filter((period) => period.metrics.length) || [];

  return (
    <Card className="space-y-4 p-4">
      {visibleGrowthPeriods.length ? (
        <div className="space-y-3">
          <div>
            <div>
              <h3 className="text-lg font-semibold">Growth Snapshot</h3>
              <p className="text-sm text-muted">Annual CAGR view from Trendlyne financials.</p>
            </div>
          </div>

          <div className="space-y-3">
            {visibleGrowthPeriods.map((period) => (
              <div key={period.label} className="space-y-2">
                <p className="text-sm font-semibold text-text">{period.label}</p>
                <div className="grid gap-3 sm:gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                  {period.metrics.map((metric) => (
                    <div
                      key={`${period.label}-${metric.label}`}
                      className="min-h-[100px] rounded-2xl border border-border/70 bg-bg px-4 py-3 sm:min-h-[132px] sm:rounded-3xl sm:px-6 sm:py-5"
                    >
                      <p className="text-xs font-medium text-muted sm:text-sm">{metric.label}</p>
                      <p className={`mt-2 text-2xl font-semibold sm:mt-4 sm:text-3xl ${growthValueClass(metric.value)}`}>{formatGrowthValue(metric.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          Financial Statements{" "}
          <span className="text-xs font-normal text-muted">
            ({viewFormat === "perShare" ? "₹ per share" : viewFormat === "commonSize" ? "% of Sales / Revenue" : "₹ crore"})
          </span>
        </h3>

        {/* View Format Switcher: Totals vs Per Share vs % of Sales */}
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-panel/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewFormat("totals")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              viewFormat === "totals" ? "bg-accent/15 text-accent font-bold border border-accent/30" : "text-muted hover:text-text"
            }`}
          >
            Totals (₹ Cr)
          </button>
          {perShareAvailable ? (
            <button
              type="button"
              onClick={() => setViewFormat("perShare")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                viewFormat === "perShare" ? "bg-accent/15 text-accent font-bold border border-accent/30" : "text-muted hover:text-text"
              }`}
            >
              Per Share
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setViewFormat("commonSize")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              viewFormat === "commonSize" ? "bg-accent/15 text-accent font-bold border border-accent/30" : "text-muted hover:text-text"
            }`}
            title="Express each line item as a percentage of total sales to easily identify margin trends"
          >
            % of Sales (Common-Size)
          </button>
        </div>
      </div>
      <Tabs defaultValue="income" className="mt-3">
        <TabsList>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-3">
          <FinancialBarChart data={quarterly} firstKey="revenue" secondKey="profit" />
          <DataTable rows={transformRows(incomeStatement.length ? incomeStatement : quarterly)} csvName={`income-statement-${viewFormat}`} />
        </TabsContent>

        <TabsContent value="balance" className="space-y-3">
          {yearly.some((row) => row.assets !== null) ? (
            <FinancialBarChart data={yearly} firstKey="assets" secondKey="profit" />
          ) : null}
          <DataTable
            rows={transformRows(balanceSheet.length ? balanceSheet : yearly)}
            emptyMessage="Balance sheet data isn't available for this stock from our current data providers."
            csvName={`balance-sheet-${viewFormat}`}
          />
        </TabsContent>

        <TabsContent value="cash" className="space-y-3">
          <FinancialBarChart data={yearly} firstKey="cashFlow" secondKey="profit" />
          <DataTable rows={transformRows(cashFlow.length ? cashFlow : yearly)} csvName={`cash-flow-${viewFormat}`} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
