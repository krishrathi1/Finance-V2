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
  const [perShare, setPerShare] = useState(false);
  const shares = typeof outstandingSharesCr === "number" && outstandingSharesCr > 0 ? outstandingSharesCr : null;
  const perShareAvailable = shares !== null;

  /**
   * Statement figures are in ₹ crore and share count in crore, so
   * value / shares already yields rupees per share — no unit conversion.
   * Period/date labels and any already-per-share or ratio column are left
   * alone; dividing an EPS or a percentage by the share count would be wrong.
   */
  const toPerShare = useCallback(
    (rows: Array<Record<string, string | number | null>>) => {
      if (!perShare || shares === null) return rows;
      const untouched = /period|quarter|date|eps|per\s*share|pct|percent|margin|ratio|yield/i;
      return rows.map((row) => {
        const next: Record<string, string | number | null> = {};
        for (const [key, value] of Object.entries(row)) {
          next[key] =
            typeof value === "number" && Number.isFinite(value) && !untouched.test(key)
              ? Math.round((value / shares) * 100) / 100
              : value;
        }
        return next;
      });
    },
    [perShare, shares],
  );

  const formatGrowthValue = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "N/A";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const growthValueClass = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "text-muted";
    if (value > 0) return "text-emerald-500";
    if (value < 0) return "text-rose-500";
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
        <h3 className="text-lg font-semibold">Financial Statements</h3>
        {/* Per-share view (a StockAnalysis.com staple): dividing by share count
            makes companies of very different size directly comparable. Hidden
            when share count is unknown rather than shown inert. */}
        {perShareAvailable ? (
          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5 text-xs">
            {([false, true] as const).map((mode) => (
              <button
                key={String(mode)}
                type="button"
                onClick={() => setPerShare(mode)}
                className={`rounded-md px-2 py-1 font-medium transition ${
                  perShare === mode ? "bg-primary/10 text-primary" : "text-muted hover:text-text"
                }`}
              >
                {mode ? "Per share" : "Totals"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Tabs defaultValue="income" className="mt-3">
        <TabsList>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-3">
          <FinancialBarChart data={quarterly} firstKey="revenue" secondKey="profit" />
          <DataTable rows={toPerShare(incomeStatement.length ? incomeStatement : quarterly)} csvName={perShare ? "income-statement-per-share" : "income-statement"} />
        </TabsContent>

        <TabsContent value="balance" className="space-y-3">
          {yearly.some((row) => row.assets !== null) ? (
            <FinancialBarChart data={yearly} firstKey="assets" secondKey="profit" />
          ) : null}
          <DataTable
            rows={toPerShare(balanceSheet.length ? balanceSheet : yearly)}
            emptyMessage="Balance sheet data isn't available for this stock from our current data providers."
            csvName={perShare ? "balance-sheet-per-share" : "balance-sheet"}
          />
        </TabsContent>

        <TabsContent value="cash" className="space-y-3">
          <FinancialBarChart data={yearly} firstKey="cashFlow" secondKey="profit" />
          <DataTable rows={toPerShare(cashFlow.length ? cashFlow : yearly)} csvName={perShare ? "cash-flow-per-share" : "cash-flow"} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
