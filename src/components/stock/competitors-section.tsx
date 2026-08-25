"use client";

import { Users } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";
import { useApp } from "@/lib/store";
import { fmtCr, fmtInr } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { numOrDash } from "./helpers";

/** Peer comparison table — clicking a peer opens its stock view. */
export function CompetitorsSection({ d }: { d: StockDashboard }) {
  const openStock = useApp((s) => s.openStock);

  return (
    <div>
      <SectionHeading
        icon={Users}
        kicker="Peer Set"
        title="Competitors"
        right={
          d.competitors.length > 0 ? (
            <span className="text-xs text-muted-foreground">{d.competitors.length} peers</span>
          ) : undefined
        }
      />

      {d.competitors.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-panel/40 p-6 text-center text-sm text-muted-foreground">
          No competitor data available.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-sm">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="pl-4 text-left">Company</TableHead>
                <TableHead className="text-right">Mkt Cap</TableHead>
                <TableHead className="text-right">P/E</TableHead>
                <TableHead className="text-right">P/B</TableHead>
                <TableHead className="text-right">ROE</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="pr-4 text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.competitors.map((c) => (
                <TableRow key={c.symbol} className="border-border/40 transition-colors hover:bg-brand/5">
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      onClick={() => openStock(c.symbol)}
                      className="group block max-w-[220px] text-left"
                      aria-label={`Open ${c.name} (${c.symbol})`}
                    >
                      <span className="block font-semibold text-text transition group-hover:text-brand">
                        {c.symbol}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">{c.name}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCr(c.marketCapCr)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.pe === null ? "—" : c.pe.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{numOrDash(c.pb, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numOrDash(c.roe, 1, "%")}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInr(c.price)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <ChangePill size="xs" value={c.changePercent} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
