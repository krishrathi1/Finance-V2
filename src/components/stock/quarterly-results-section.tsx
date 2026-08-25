"use client";

import { CalendarRange } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";
import { fmtCr } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ebitdaMarginClass(v: number): string {
  if (v > 20) return "text-success";
  if (v < 10) return "text-danger";
  return "text-text";
}

function surpriseClass(v: number): string {
  if (v > 5) return "text-success";
  if (v < -5) return "text-danger";
  return "text-text";
}

/** Extended quarterly results table with EBITDA + surprise vs estimate. */
export function QuarterlyResultsSection({ d }: { d: StockDashboard }) {
  const rows = d.quarterlyExtended;

  return (
    <div>
      <SectionHeading
        icon={CalendarRange}
        kicker="Statements"
        title="Quarterly Results"
        right={<span className="text-xs text-muted-foreground">{rows.length} quarters</span>}
      />

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-sm">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="pl-4 text-left">Quarter</TableHead>
              <TableHead className="text-right">Revenue (₹ Cr)</TableHead>
              <TableHead className="text-right">EBITDA (₹ Cr)</TableHead>
              <TableHead className="text-right">EBITDA Margin</TableHead>
              <TableHead className="text-right">PAT (₹ Cr)</TableHead>
              <TableHead className="text-right">PAT Margin</TableHead>
              <TableHead className="text-right">EPS ₹</TableHead>
              <TableHead className="text-right">YoY Growth</TableHead>
              <TableHead className="pr-4 text-right">Surprise vs Est</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No quarterly data
                </TableCell>
              </TableRow>
            ) : (
              rows.map((q, i) => (
                <TableRow
                  key={q.quarter}
                  className={cn(
                    "border-border/40 transition-colors hover:bg-brand/5",
                    i === 0 && "bg-brand/5 font-medium"
                  )}
                >
                  <TableCell className="pl-4 font-semibold text-text">{q.quarter}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCr(q.revenue).replace("₹", "").replace(" Cr", "").trim()}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCr(q.ebitda).replace("₹", "").replace(" Cr", "").trim()}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", ebitdaMarginClass(q.ebitdaMargin))}>
                    {q.ebitdaMargin.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCr(q.pat).replace("₹", "").replace(" Cr", "").trim()}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.patMargin.toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">₹{q.eps.toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    <ChangePill size="xs" value={q.yoyGrowth} />
                  </TableCell>
                  <TableCell className={cn("pr-4 text-right font-semibold tabular-nums", surpriseClass(q.surprisePct))}>
                    {q.surprisePct >= 0 ? "+" : ""}{q.surprisePct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Source: synthesized from deterministic fundamentals. EBITDA = PAT + interest + tax + D&amp;A; surprise = (PAT − estimate) / estimate × 100.
      </p>
    </div>
  );
}
