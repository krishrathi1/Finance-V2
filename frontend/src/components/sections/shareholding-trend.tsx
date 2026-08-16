"use client";

import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { shareholdingTrend, type ShareholdingPoint } from "@/shared/shareholding-trend";

function points(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

const ARROW = {
  up: { Icon: ArrowUp, className: "text-success" },
  down: { Icon: ArrowDown, className: "text-danger" },
  flat: { Icon: ArrowRight, className: "text-muted" },
} as const;

/**
 * Which way each holder class is moving.
 *
 * The Shareholding section beside this offers a quarter picker — pick a
 * quarter, see that quarter. That presents the data without answering what it
 * is for: promoters steadily reducing their stake is the most watched signal
 * in Indian retail investing, and it is invisible one quarter at a time.
 */
export function ShareholdingTrend({ history }: { history?: ShareholdingPoint[] | null }) {
  const trend = shareholdingTrend(history);

  if (!trend) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-purple-500" />
        <h3 className="text-lg font-semibold">Ownership Trend</h3>
        <span className="ml-auto text-[11px] text-muted">
          {trend.quarters} quarters to {trend.latestQuarter}
        </span>
      </div>

      <div className="mt-4 space-y-1.5">
        {trend.trends.map((holder) => {
          const { Icon, className } = ARROW[holder.direction];
          return (
            <div
              key={holder.key}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-bg/40 px-3 py-2"
            >
              <Icon className={`h-4 w-4 shrink-0 ${className}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{holder.label}</p>
                <p className="text-[10px] text-muted">
                  {holder.comparable
                    ? `${holder.quartersReported} quarters reported`
                    : "filing format changed — history not comparable"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums">{holder.latest.toFixed(2)}%</p>
                <p className={`text-[10px] tabular-nums ${className}`}>
                  {points(holder.changeOneYearPoints ?? holder.changeFullPoints)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {trend.flags.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {trend.flags.map((flag) => (
            <li key={flag} className="flex items-start gap-2 text-[11px] leading-4 text-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-muted">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          No material shift in ownership across the reported quarters.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-4 text-muted/60">
        A class the filing doesn&apos;t break out is left out rather than counted as zero —
        otherwise the quarter a provider starts reporting it reads as a sudden stake being built.
      </p>
    </Card>
  );
}
