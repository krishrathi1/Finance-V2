"use client";

import { useMemo, useState } from "react";

import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { Card } from "@/components/ui/card";
import type { QuarterlyDetailedPoint } from "@/lib/types";

type QuarterlyPoint = { period: string; revenue: number; profit: number };
type ValueType = "number" | "percent" | "eps" | "npa";
type ParentRowId = "totalRevenue" | "operatingProfit" | "profitBeforeTax" | "netProfit";

type RowConfig = {
  id: string;
  label: string;
  key: keyof QuarterlyDetailedPoint;
  type: ValueType;
  section?: boolean;
  indent?: boolean;
  signed?: boolean;
  parentId?: ParentRowId;
};

const TABLE_ROWS: RowConfig[] = [
  { id: "totalRevenue", label: "Total Revenue", key: "totalRevenue", type: "number", section: true },
  { id: "operatingRevenue", label: "Operating Revenue", key: "operatingRevenue", type: "number", indent: true, parentId: "totalRevenue" },
  { id: "otherIncome", label: "Other Income", key: "otherIncome", type: "number", indent: true, parentId: "totalRevenue" },
  { id: "operatingExpenses", label: "Operating Expenses", key: "operatingExpenses", type: "number", section: true },
  { id: "operatingProfit", label: "Operating Profit", key: "operatingProfit", type: "number", section: true },
  { id: "opmPct", label: "Operating Profit Margin %", key: "opmPct", type: "percent", indent: true, parentId: "operatingProfit" },
  { id: "depreciations", label: "Depreciations", key: "depreciations", type: "number", indent: true, parentId: "operatingProfit" },
  { id: "interestExpended", label: "Interest", key: "interestExpended", type: "number", indent: true, parentId: "operatingProfit" },
  { id: "profitBeforeTax", label: "Profit Before Tax", key: "profitBeforeTax", type: "number", section: true },
  { id: "tax", label: "Tax", key: "tax", type: "number", indent: true, parentId: "profitBeforeTax" },
  { id: "netProfit", label: "Net Profit", key: "netProfit", type: "number", section: true },
  { id: "epsAdjusted", label: "EPS Adj. latest", key: "epsAdjusted", type: "eps", indent: true, parentId: "netProfit" },
  { id: "netProfitTtm", label: "Net profit TTM", key: "netProfitTtm", type: "number", indent: true, parentId: "netProfit" },
  { id: "basicEpsTtm", label: "Basic EPS TTM", key: "basicEpsTtm", type: "eps", indent: true, parentId: "netProfit" }
];

const DEFAULT_EXPANDED_ROWS: Record<ParentRowId, boolean> = {
  totalRevenue: true,
  operatingProfit: false,
  profitBeforeTax: false,
  netProfit: false
};

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
    return `Rs ${formatIndian(value)}`;
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

function parsePeriod(period: string): number {
  const direct = Date.parse(period || "");
  if (!Number.isNaN(direct)) return direct;
  const padded = Date.parse(`01 ${period || ""}`);
  if (!Number.isNaN(padded)) return padded;
  return 0;
}

function normalizeQuarterlyPoints<T extends { period: string }>(rows: T[]): T[] {
  return [...rows]
    .sort((a, b) => parsePeriod(a.period) - parsePeriod(b.period))
    .slice(-4);
}

function hasValue(row: RowConfig, points: QuarterlyDetailedPoint[]): boolean {
  return points.some((point) => toNumber(point[row.key]) !== null);
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
  const [expandedRows, setExpandedRows] = useState<Record<ParentRowId, boolean>>(DEFAULT_EXPANDED_ROWS);

  const chartData = useMemo(() => {
    const consolidatedData = consolidated && consolidated.length ? consolidated : quarterly;
    const standaloneData = standalone && standalone.length ? standalone : quarterly;
    return normalizeQuarterlyPoints(view === "consolidated" ? consolidatedData : standaloneData);
  }, [consolidated, standalone, quarterly, view]);

  const tableData = useMemo(() => {
    const consolidatedData = consolidatedDetailed && consolidatedDetailed.length ? consolidatedDetailed : standaloneDetailed || [];
    const standaloneData = standaloneDetailed && standaloneDetailed.length ? standaloneDetailed : consolidatedDetailed || [];
    return normalizeQuarterlyPoints(view === "consolidated" ? consolidatedData : standaloneData);
  }, [consolidatedDetailed, standaloneDetailed, view]);

  const availableRows = useMemo(() => TABLE_ROWS.filter((row) => hasValue(row, tableData)), [tableData]);

  const parentRows = useMemo(() => {
    const parents = new Set<ParentRowId>();
    availableRows.forEach((row) => {
      if (row.parentId) parents.add(row.parentId);
    });
    return parents;
  }, [availableRows]);

  const visibleRows = useMemo(
    () =>
      availableRows.filter((row) => {
        if (!row.parentId) return true;
        return expandedRows[row.parentId];
      }),
    [availableRows, expandedRows]
  );

  const toggleRow = (rowId: ParentRowId) => {
    setExpandedRows((current) => ({ ...current, [rowId]: !current[rowId] }));
  };

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
                <tr key={row.id} className={row.section ? "bg-primary/5" : ""}>
                  <td
                    className={`sticky left-0 border-b border-border/50 bg-panel p-2 font-medium ${row.indent ? "pl-6 font-normal text-muted" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      {parentRows.has(row.id as ParentRowId) ? (
                        <button
                          type="button"
                          onClick={() => toggleRow(row.id as ParentRowId)}
                          className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs font-semibold text-muted transition hover:border-primary hover:text-primary"
                          aria-label={`${expandedRows[row.id as ParentRowId] ? "Hide" : "Show"} ${row.label} details`}
                        >
                          {expandedRows[row.id as ParentRowId] ? "-" : "+"}
                        </button>
                      ) : null}
                      <span>{row.label}</span>
                    </div>
                  </td>
                  {tableData.map((point) => (
                    <td key={`${row.id}-${point.period}`} className={`border-b border-border/50 p-2 ${cellColorClass(row, point)}`}>
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
