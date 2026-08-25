"use client";

import { Check, X, ListChecks } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

function tallyTone(passCount: number): string {
  if (passCount >= 7) return "border-success/30 bg-success/10 text-success";
  if (passCount >= 4) return "border-warn/30 bg-warn/10 text-warn";
  return "border-danger/30 bg-danger/10 text-danger";
}

/** Fundamental checklist — 10 signals, bullish tally badge. */
export function FundamentalSignalsSection({ d }: { d: StockDashboard }) {
  const signals = d.fundamentalSignals;
  const passCount = signals.filter((s) => s.pass).length;

  return (
    <div>
      <SectionHeading
        icon={ListChecks}
        kicker="Quality Checklist"
        title="Fundamental Signals"
        right={
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              tallyTone(passCount)
            )}
          >
            {passCount} / {signals.length} signals pass
          </span>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {signals.map((s) => (
          <div
            key={s.label}
            className={cn(
              "flex items-start gap-3 rounded-2xl border bg-panel/60 p-4 backdrop-blur-sm",
              s.pass ? "border-success/30" : "border-danger/30"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                s.pass ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
              )}
            >
              {s.pass ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{s.label}</p>
              <p className={cn("mt-1 text-xs leading-5", s.pass ? "text-muted-foreground" : "text-muted-foreground")}>
                {s.detail}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                s.pass
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-danger/30 bg-danger/10 text-danger"
              )}
            >
              {s.pass ? "Pass" : "Fail"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
