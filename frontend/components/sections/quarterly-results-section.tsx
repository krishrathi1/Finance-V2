"use client";

import { useMemo, useState } from "react";

import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { Card } from "@/components/ui/card";
import type { QuarterlyDetailedPoint } from "@/lib/types";

type QuarterlyPoint = { period: string; revenue: number; profit: number };
type ValueType = "number" | "percent" | "eps" | "npa";

type RowConfig = {
  label: string;
  key: keyof QuarterlyDetailedPoint;
  type: ValueType;
  section?: boolean;
  indent?: boolean;
  signed?: boolean;
};

const TABLE_ROWS: RowConfig[] = [
  { label: "Total Revenue", key: "totalRevenue", type: "number", section: true },
  { label: "Total Revenue Growth %", key: "totalRevenueGrowthPct", type: "percent", indent: true, signed: true },
  { label: "Interest Earned", key: "interestEarned", type: "number", indent: true },
  { label: "Other Income", key: "otherIncome", type: "number", indent: true },
  { label: "Expenses", key: "expenses", type: "number", section: true },
  { label: "Interest Expended", key: "interestExpended", type: "number", indent: true },
  { label: "Operating Expenses", key: "operatingExpenses", type: "number", indent: true },
  { label: "Net Interest Income", key: "netInterestIncome", type: "number", section: true },
  { label: "NI Growth", key: "niGrowthPct", type: "percent", indent: true, signed: true },
  { label: "Operating Profit", key: "operatingProfit", type: "number", section: true },
  { label: "OPM%", key: "opmPct", type: "percent", indent: true },
  { label: "Depreciations", key: "depreciations", type: "number", indent: true },
  { label: "Profit Before Tax", key: "profitBeforeTax", type: "number", indent: true },
  { label: "Tax", key: "tax", type: "number", section: true },
  { label: "Tax %", key: "taxPct", type: "percent", indent: true },
  { label: "Net Profit", key: "netProfit", type: "number", section: true },
  { label: "Net Profit Growth", key: "netProfitGrowthPct", type: "percent", indent: true, signed: true },
  { label: "Net Profit Margin", key: "netProfitMarginPct", type: "percent", indent: true },
  { label: "Net Profit Margin Growth", key: "netProfitMarginGrowthPct", type: "percent", indent: true, signed: true },
  { label: "Basic EPS in ₹", key: "basicEps", type: "eps", indent: true },
  { label: "Diluted EPS in ₹", key: "dilutedEps", type: "eps", indent: true },
  { label: "Gross NPA", key: "grossNpa", type: "npa", indent: true },
  { label: "Net NPA", key: "netNpa", type: "npa", indent: true }
];

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatIndian(value: number, maxDigits = 2): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: maxDigits }).format(value);
}

function formatCellValue(row: RowConfig, point: QuarterlyDetailedPoint): string {
  const value = toNumber(point[row.key]);
  if (value === null) return "-";

  if (row.type === "percent") {
    const prefix = row.signed && value > 0 ? "+" : "";
    return `${prefix}${formatIndian(value)}%`;
  }
  if (row.type === "eps") {
    return `₹ ${formatIndian(value)}`;
  }
  if (row.type === "npa") {
    const isPercent = row.key === "grossNpa" ? point.grossNpaIsPercent : point.netNpaIsPercent;
    return isPercent ? `${formatIndian(value)}%` : formatIndian(value);
  }
  return formatIndian(value);
}

function cellColorClass(row: RowConfig, point: QuarterlyDetailedPoint): string {
  if (!row.signed) return "";
  const value = toNumber(point[row.key]);
  if (value === null || value === 0) return "";
  return value > 0 ? "text-emerald-500" : "text-rose-500";
}

export function QuarterlyResultsSection({
  quarterly,
  standalone,
  consolidated,
  standaloneDetailed,
  consolidatedDetailed
}: {
  quarterly: QuarterlyPoint[];
  standalone?: QuarterlyPoint[];
  consolidated?: QuarterlyPoint[];
  standaloneDetailed?: QuarterlyDetailedPoint[];
  consolidatedDetailed?: QuarterlyDetailedPoint[];
}) {
  const [view, setView] = useState<"consolidated" | "standalone">("consolidated");

  const chartData = useMemo(() => {
    const consolidatedData = consolidated && consolidated.length ? consolidated : quarterly;
    const standaloneData = standalone && standalone.length ? standalone : quarterly;
    return view === "consolidated" ? consolidatedData : standaloneData;
  }, [consolidated, standalone, quarterly, view]);

  const tableData = useMemo(() => {
    const consolidatedData = consolidatedDetailed && consolidatedDetailed.length ? consolidatedDetailed : standaloneDetailed || [];
    const standaloneData = standaloneDetailed && standaloneDetailed.length ? standaloneDetailed : consolidatedDetailed || [];
    return view === "consolidated" ? consolidatedData : standaloneData;
  }, [consolidatedDetailed, standaloneDetailed, view]);

  const visibleRows = useMemo(
    () =>
      TABLE_ROWS.filter((row) =>
        tableData.some((point) => toNumber(point[row.key]) !== null)
      ),
    [tableData]
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-lg font-semibold">
        <span>Quarterly Results</span>
        <button
          type="button"
          onClick={() => setView("consolidated")}
          className={view === "consolidated" ? "text-primary" : "text-muted hover:text-text"}
        >
          / View Consolidated
        </button>
        <button
          type="button"
          onClick={() => setView("standalone")}
          className={view === "standalone" ? "text-primary" : "text-muted hover:text-text"}
        >
          / View Standalone
        </button>
      </div>
      <FinancialBarChart data={chartData} firstKey="revenue" secondKey="profit" />

      {tableData.length ? (
        <div className="overflow-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-bg">
              <tr>
                <th className="sticky left-0 z-10 border-b border-border bg-bg p-2 text-left font-semibold">PARTICULARS</th>
                {tableData.map((col) => (
                  <th key={col.period} className="border-b border-border p-2 text-left font-semibold uppercase">
                    {col.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.label} className={row.section ? "bg-primary/5" : ""}>
                  <td
                    className={`sticky left-0 border-b border-border/50 bg-panel p-2 font-medium ${row.indent ? "pl-6 font-normal text-muted" : ""}`}
                  >
                    {row.label}
                  </td>
                  {tableData.map((point) => (
                    <td key={`${row.label}-${point.period}`} className={`border-b border-border/50 p-2 ${cellColorClass(row, point)}`}>
                      {formatCellValue(row, point)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Detailed quarterly table unavailable for this stock.</p>
      )}
    </Card>
  );
}
