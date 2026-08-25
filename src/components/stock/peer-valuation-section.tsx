"use client";

import { Users2 } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";
import { useApp } from "@/lib/store";
import { fmtCr, fmtInr } from "@/lib/types";
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
import { numOrDash } from "./helpers";

const EXPENSIVE_CLASS: Record<string, string> = {
  Cheap: "border-success/30 bg-success/10 text-success",
  Fair: "border-warn/30 bg-warn/10 text-warn",
  Expensive: "border-danger/30 bg-danger/10 text-danger",
};

/** Peer valuation table — highlights the current stock row. */
export function PeerValuationSection({ d }: { d: StockDashboard }) {
  const openStock = useApp((s) => s.openStock);
  const rows = d.peerValuation;
  const med = d.peerMedian;
  const currentSymbol = d.symbol;

  return (
    <div>
      <SectionHeading
        icon={Users2}
        kicker="Comparables"
        title="Peer Valuation"
        right={<span className="text-xs text-muted-foreground">{rows.length} peers</span>}
      />

      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Peer Median</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
          <span className="text-muted-foreground">P/E <span className="font-semibold text-text">{med.pe === null ? "—" : med.pe.toFixed(1)}</span></span>
          <span className="text-muted-foreground">P/B <span className="font-semibold text-text">{med.pb.toFixed(1)}</span></span>
          <span className="text-muted-foreground">EV/EBITDA <span className="font-semibold text-text">{med.evEbitda.toFixed(1)}</span></span>
          <span className="text-muted-foreground">ROE <span className="font-semibold text-text">{med.roe.toFixed(1)}%</span></span>
        </div>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
            EXPENSIVE_CLASS[med.expensive]
          )}
        >
          Stock is {med.expensive}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-sm">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="pl-4 text-left">Company</TableHead>
              <TableHead className="text-right">Mkt Cap</TableHead>
              <TableHead className="text-right">P/E</TableHead>
              <TableHead className="text-right">P/B</TableHead>
              <TableHead className="text-right">EV/EBITDA</TableHead>
              <TableHead className="text-right">ROE</TableHead>
              <TableHead className="text-right">Rev Gr</TableHead>
              <TableHead className="text-right">Pft Gr</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="pr-4 text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  No peers in this sector.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => {
                const isCurrent = c.symbol === currentSymbol;
                return (
                  <TableRow
                    key={c.symbol}
                    className={cn(
                      "border-border/40 transition-colors",
                      isCurrent ? "bg-brand/10" : "hover:bg-brand/5"
                    )}
                  >
                    <TableCell className={cn("pl-4", isCurrent && "border-l-2 border-brand")}>
                      <button
                        type="button"
                        onClick={() => !isCurrent && openStock(c.symbol)}
                        disabled={isCurrent}
                        aria-label={`Open ${c.name} (${c.symbol})`}
                        className={cn(
                          "group block max-w-[220px] text-left",
                          isCurrent && "cursor-default"
                        )}
                      >
                        <span className={cn("block font-semibold transition", isCurrent ? "text-brand" : "text-text group-hover:text-brand")}>
                          {c.symbol}
                          {isCurrent && <span className="ml-1 text-[9px] uppercase tracking-wider text-brand/80">this stock</span>}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">{c.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCr(c.marketCapCr)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.pe === null ? "—" : c.pe.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.pb.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.evEbitda.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numOrDash(c.roe, 1, "%")}</TableCell>
                    <TableCell className="text-right tabular-nums">{numOrDash(c.revenueGrowth, 0, "%")}</TableCell>
                    <TableCell className="text-right tabular-nums">{numOrDash(c.profitGrowth, 0, "%")}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInr(c.price)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <ChangePill size="xs" value={c.changePercent} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
