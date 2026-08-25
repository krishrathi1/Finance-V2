"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { Landmark } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { fmtCr, fmtPct } from "@/lib/types";
import type { StockDashboard, YearlyFinancial } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pctClass } from "./helpers";

const REVENUE_COLOR = "#f59e0b";
const PROFIT_COLOR = "#22c55e";

/** Yearly revenue vs net-profit bars + last-8-quarters results table. */
export function FinancialsSection({ d }: { d: StockDashboard }) {
  // Data arrives oldest → newest; display the table newest-first.
  const quarterly = d.quarterly.slice(-8).reverse();

  return (
    <div>
      <SectionHeading
        icon={Landmark}
        kicker="Statements"
        title="Financials"
        right={
          <span className="text-xs text-muted-foreground">
            {d.yearly.length}-yr history · {quarterly.length} quarters
          </span>
        }
      />

      <div className="space-y-4">
        {/* Yearly chart */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue vs Net Profit — annual
            </p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: REVENUE_COLOR }} />
                Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROFIT_COLOR }} />
                Net Profit
              </span>
            </div>
          </div>
          <div className="mt-4 h-[240px]">
            {d.yearly.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No annual financial history
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.yearly} barGap={3} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="year"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted))", fontSize: 10 }}
                  />
                  <YAxis hide domain={[0, "auto"]} />
                  <Tooltip content={<YearlyTooltip />} cursor={{ fill: "hsl(var(--border) / 0.25)" }} />
                  <Bar dataKey="revenue" name="Revenue" fill={REVENUE_COLOR} fillOpacity={0.85} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="netProfit" name="Net Profit" fill={PROFIT_COLOR} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Quarterly table */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-sm">
          <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quarterly Results
          </p>
          <div className="mt-2 pb-1">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-4 text-left">Quarter</TableHead>
                  <TableHead className="text-right">Revenue (₹ Cr)</TableHead>
                  <TableHead className="text-right">Net Profit (₹ Cr)</TableHead>
                  <TableHead className="text-right">OPM %</TableHead>
                  <TableHead className="text-right">EPS ₹</TableHead>
                  <TableHead className="pr-4 text-right">YoY Growth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quarterly.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No quarterly data
                    </TableCell>
                  </TableRow>
                ) : (
                  quarterly.map((q, i) => (
                    <TableRow
                      key={q.quarter}
                      className={cn(
                        "border-border/40 transition-colors hover:bg-brand/5",
                        i === 0 && "bg-brand/5 font-medium"
                      )}
                    >
                      <TableCell className="pl-4 font-semibold text-text">{q.quarter}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.revenue.toFixed(1)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          q.netProfit < 0 && "text-danger"
                        )}
                      >
                        {q.netProfit.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{q.opm.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹{q.eps.toFixed(1)}
                      </TableCell>
                      <TableCell className={cn("pr-4 text-right font-semibold tabular-nums", pctClass(q.growthYoY))}>
                        {fmtPct(q.growthYoY, 1)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function YearlyTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as YearlyFinancial | undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-panel/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-text">FY {row.year}</p>
      <div className="mt-1.5 space-y-1">
        <p className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: REVENUE_COLOR }} />
          Revenue
          <span className="ml-auto pl-3 font-semibold tabular-nums text-text">{fmtCr(row.revenue)}</span>
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROFIT_COLOR }} />
          Net Profit
          <span className="ml-auto pl-3 font-semibold tabular-nums text-text">{fmtCr(row.netProfit)}</span>
        </p>
      </div>
    </div>
  );
}
