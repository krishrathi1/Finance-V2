"use client";

import { useId } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { Gift } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { StockDashboard, DividendYear } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BAR_COLOR = "#f59e0b";

const ACTION_BADGE_CLASS: Record<string, string> = {
  "Bonus": "border-success/30 bg-success/10 text-success",
  "Split": "border-brand/30 bg-brand/10 text-brand",
  "Buyback": "border-violet-400/30 bg-violet-400/10 text-violet-300",
  "Dividend": "border-success/30 bg-success/10 text-success",
  "Rights": "border-warn/30 bg-warn/10 text-warn",
};

/** Dividend history bar chart + table + corporate actions timeline. */
export function DividendHistorySection({ d }: { d: StockDashboard }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradId = `divGrad-${uid}`;

  // Display newest-first
  const dividends = [...d.dividendHistory].reverse();
  const actions = d.corporateActions;

  return (
    <div>
      <SectionHeading
        icon={Gift}
        kicker="Shareholder Returns"
        title="Dividends & Corporate Actions"
        right={<span className="text-xs text-muted-foreground">{dividends.length}-yr history</span>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Bar chart */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dividend per Share (₹)
          </p>
          <div className="mt-4 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dividends} barCategoryGap="25%" margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BAR_COLOR} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={BAR_COLOR} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted))", fontSize: 10 }}
                />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip content={<DivTooltip />} cursor={{ fill: "hsl(var(--border) / 0.25)" }} />
                <Bar dataKey="dps" name="DPS" fill={`url(#${gradId})`} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table with payout bars */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-sm">
          <p className="px-4 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Yearly Breakdown
          </p>
          <div className="mt-2 pb-1">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-4 text-left">Year</TableHead>
                  <TableHead className="text-right">DPS ₹</TableHead>
                  <TableHead className="text-right">Yield %</TableHead>
                  <TableHead className="pr-4 text-left">Payout Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividends.map((dv, i) => (
                  <TableRow
                    key={dv.year}
                    className="border-border/40 transition-colors hover:bg-brand/5"
                  >
                    <TableCell className={i === 0 ? "pl-4 font-semibold text-text" : "pl-4 text-text"}>
                      {dv.year}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{dv.dps.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{dv.yield.toFixed(2)}%</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center gap-2">
                        <Progress value={dv.payout} className="h-1.5 w-full" />
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {dv.payout.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Corporate actions timeline */}
      <div className="mt-4 rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Corporate Actions Timeline
        </p>
        <ol className="mt-4 space-y-3 border-l-2 border-brand/60 pl-4">
          {actions.length === 0 ? (
            <li className="text-xs text-muted-foreground">No corporate actions recorded.</li>
          ) : (
            actions.map((a, i) => (
              <li key={`${a.date}-${i}`} className="relative">
                <span
                  className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full border-2 border-panel bg-brand"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border/50 bg-bg/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {a.date}
                  </span>
                  <Badge variant="outline" className={ACTION_BADGE_CLASS[a.type] ?? ""}>
                    {a.type}
                  </Badge>
                  <span className="text-xs leading-5 text-text/85">{a.detail}</span>
                </div>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}

function DivTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as DividendYear | undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-panel/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-text">{row.year}</p>
      <p className="mt-1 flex items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BAR_COLOR }} />
        DPS
        <span className="ml-auto pl-3 font-semibold tabular-nums text-text">₹{row.dps.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
        Yield
        <span className="font-semibold tabular-nums text-text">{row.yield.toFixed(2)}%</span>
      </p>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
        Payout
        <span className="font-semibold tabular-nums text-text">{row.payout.toFixed(0)}%</span>
      </p>
    </div>
  );
}
