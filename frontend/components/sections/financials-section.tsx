"use client";

import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";
import type { FinancialGrowthSnapshot } from "@/lib/types";

function DataTable({ rows }: { rows: Array<Record<string, string | number>> }) {
  if (!rows.length) return <p className="text-sm text-muted">No data available.</p>;
  const columns = Object.keys(rows[0]);
  return (
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
                  {typeof row[col] === "number" ? formatNumber(row[col] as number) : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinancialsSection({
  growthSnapshot,
  quarterly,
  yearly,
  incomeStatement,
  balanceSheet,
  cashFlow
}: {
  growthSnapshot?: FinancialGrowthSnapshot;
  quarterly: Array<{ period: string; revenue: number; profit: number }>;
  yearly: Array<{ period: string; revenue: number; profit: number; assets: number; cashFlow: number }>;
  incomeStatement: Array<Record<string, string | number>>;
  balanceSheet: Array<Record<string, string | number>>;
  cashFlow: Array<Record<string, string | number>>;
}) {
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
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                  {period.metrics.map((metric) => (
                    <div
                      key={`${period.label}-${metric.label}`}
                      className="min-h-[132px] rounded-3xl border border-border/70 bg-bg px-6 py-5"
                    >
                      <p className="text-sm font-medium text-muted">{metric.label}</p>
                      <p className={`mt-4 text-3xl font-semibold ${growthValueClass(metric.value)}`}>{formatGrowthValue(metric.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-lg font-semibold">Financial Statements</h3>
      </div>
      <Tabs defaultValue="income" className="mt-3">
        <TabsList>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-3">
          <FinancialBarChart data={quarterly} firstKey="revenue" secondKey="profit" />
          <DataTable rows={incomeStatement.length ? incomeStatement : quarterly} />
        </TabsContent>

        <TabsContent value="balance" className="space-y-3">
          <FinancialBarChart data={yearly} firstKey="assets" secondKey="profit" />
          <DataTable rows={balanceSheet.length ? balanceSheet : yearly} />
        </TabsContent>

        <TabsContent value="cash" className="space-y-3">
          <FinancialBarChart data={yearly} firstKey="cashFlow" secondKey="profit" />
          <DataTable rows={cashFlow.length ? cashFlow : yearly} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
