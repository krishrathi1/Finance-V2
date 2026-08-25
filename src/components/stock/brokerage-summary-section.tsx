"use client";

import { Briefcase } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { Badge } from "@/components/ui/badge";
import { fmtInr, fmtPct } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConsensusScale {
  consensus: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
}

function ratingTone(rating: string): { className: string; text: string } {
  switch (rating) {
    case "Strong Buy":
      return { className: "border-success/40 bg-success/15 text-success", text: "text-success" };
    case "Buy":
      return { className: "border-success/30 bg-success/10 text-success", text: "text-success" };
    case "Hold":
      return { className: "border-warn/30 bg-warn/10 text-warn", text: "text-warn" };
    case "Sell":
      return { className: "border-danger/30 bg-danger/10 text-danger", text: "text-danger" };
    case "Strong Sell":
      return { className: "border-danger/40 bg-danger/15 text-danger", text: "text-danger" };
    default:
      return { className: "border-border/60 bg-panel/70 text-muted-foreground", text: "text-muted-foreground" };
  }
}

const SCALE_ORDER = ["Strong Sell", "Sell", "Hold", "Buy", "Strong Buy"] as const;

function scalePosition(consensus: string): number {
  const idx = SCALE_ORDER.findIndex((s) => s === consensus);
  if (idx === -1) return 2;
  return (idx / (SCALE_ORDER.length - 1)) * 100;
}

function consensusTone(consensus: string): string {
  if (consensus === "Strong Buy" || consensus === "Buy") return "text-success";
  if (consensus === "Hold") return "text-warn";
  return "text-danger";
}

/** Brokerage consensus card + broker report cards. */
export function BrokerageSummarySection({ d }: { d: StockDashboard }) {
  const b = d.brokerage;
  const cons = b.consensus as ConsensusScale["consensus"];
  const pos = scalePosition(cons);
  const price = d.quote.price;

  return (
    <div>
      <SectionHeading
        icon={Briefcase}
        kicker="Analyst View"
        title="Brokerage Summary"
        right={
          <span className="text-xs text-muted-foreground">{b.reports.length} broker reports</span>
        }
      />

      <div className="space-y-4">
        {/* Consensus card */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Consensus Rating
              </p>
              <p className={cn("mt-1 font-display text-3xl font-bold tracking-tight", consensusTone(cons))}>
                {cons}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Consensus Target
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-text">
                {fmtInr(b.consensusTarget, 0)}
              </p>
              <p className={cn("mt-0.5 text-xs font-semibold tabular-nums", b.upsidePct >= 0 ? "text-success" : "text-danger")}>
                {fmtPct(b.upsidePct, 1)} upside
              </p>
            </div>
          </div>

          {/* Consensus scale */}
          <div className="mt-5">
            <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500">
              <div
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-text shadow"
                style={{ left: `${pos}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground">
              {SCALE_ORDER.map((s) => (
                <span
                  key={s}
                  className={cn(s === cons && "font-semibold text-text")}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Vote breakdown */}
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            {[
              { label: "Strong Buy", value: b.strongBuy },
              { label: "Buy", value: b.buy },
              { label: "Hold", value: b.hold },
              { label: "Sell", value: b.sell },
              { label: "Strong Sell", value: b.strongSell },
            ].map((v) => {
              const total = b.strongBuy + b.buy + b.hold + b.sell + b.strongSell;
              const pct = total > 0 ? (v.value / total) * 100 : 0;
              return (
                <div key={v.label}>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{v.label}</p>
                  <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-text">{v.value}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        v.label === "Strong Buy" || v.label === "Buy" ? "bg-success"
                          : v.label === "Hold" ? "bg-warn" : "bg-danger"
                      )}
                      style={{ width: `${pct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[10px] text-muted-foreground">
            Current price <span className="font-semibold tabular-nums text-text">{fmtInr(price)}</span> — target {fmtInr(b.consensusTarget, 0)}.
          </p>
        </div>

        {/* Broker report cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {b.reports.map((r, i) => {
            const tone = ratingTone(r.rating);
            return (
              <div
                key={`${r.broker}-${i}`}
                className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-sm font-bold text-text">{r.broker}</p>
                  <Badge variant="outline" className={tone.className}>
                    {r.rating}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Target Price</p>
                    <p className={cn("font-display text-lg font-bold tabular-nums", tone.text)}>
                      {fmtInr(r.target, 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Date</p>
                    <p className="text-xs tabular-nums text-text">{r.date}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{r.summary}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
