"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TooltipProps } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
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

interface Slice {
  name: string;
  value: number;
  color: string;
}

/** Latest-quarter ownership donut + 8-quarter shareholding trend table. */
export function ShareholdingSection({ d }: { d: StockDashboard }) {
  const rows = d.shareholding;
  const latest = rows[rows.length - 1];

  if (!latest) {
    return (
      <div>
        <SectionHeading icon={PieIcon} kicker="Ownership" title="Shareholding" />
        <div className="rounded-2xl border border-border/50 bg-panel/40 p-6 text-center text-sm text-muted-foreground">
          No shareholding data available.
        </div>
      </div>
    );
  }

  const slices: Slice[] = [
    { name: "Promoters", value: latest.promoters, color: "#f59e0b" },
    { name: "FII", value: latest.fii, color: "#22c55e" },
    { name: "DII", value: latest.dii, color: "#eab308" },
    { name: "Public", value: latest.public, color: "#94a3b8" },
  ];

  // Data arrives oldest → newest; display newest-first.
  const trend = [...rows].reverse();

  return (
    <div>
      <SectionHeading
        icon={PieIcon}
        kicker="Ownership"
        title="Shareholding"
        right={
          <span className="text-xs text-muted-foreground">
            Latest: {latest.quarter}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Pie card */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm">
          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<ShareTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-muted-foreground">{s.name}</span>
                <span className="font-semibold tabular-nums text-text">{s.value.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
            {latest.quarter} · Source: shareholding pattern
          </p>
        </div>

        {/* Trend table */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-sm">
          <div className="pb-1">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-4 text-left">Quarter</TableHead>
                  <TableHead className="text-right">Promoters %</TableHead>
                  <TableHead className="text-right">FII %</TableHead>
                  <TableHead className="text-right">DII %</TableHead>
                  <TableHead className="pr-4 text-right">Public %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trend.map((row, i) => {
                  // trend is newest-first; previous-in-time quarter is the next row.
                  const prev = trend[i + 1];
                  const rising = prev ? row.promoters > prev.promoters : false;
                  const falling = prev ? row.promoters < prev.promoters : false;
                  return (
                    <TableRow
                      key={row.quarter}
                      className={cn(
                        "border-border/40 transition-colors hover:bg-brand/5",
                        i === 0 && "bg-brand/5 font-medium"
                      )}
                    >
                      <TableCell className="pl-4 font-semibold text-text">{row.quarter}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          rising && "text-success",
                          falling && "text-danger"
                        )}
                      >
                        {row.promoters.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.fii.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.dii.toFixed(1)}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {row.public.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload as Slice | undefined;
  if (!slice) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-panel/95 px-3 py-2 text-xs shadow-xl">
      <p className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
        {slice.name}
        <span className="ml-auto pl-3 font-semibold tabular-nums text-text">
          {slice.value.toFixed(1)}%
        </span>
      </p>
    </div>
  );
}
