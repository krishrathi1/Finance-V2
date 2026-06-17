"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchTickerTape } from "@/lib/api";

type TickerRow = { symbol: string; cmp: number; change: number; changePercent: number; exchange?: "NSE" | "BSE" };

function stockHref(row: TickerRow) {
  const symbolPath = encodeURIComponent(row.symbol.replace(/\s+/g, ""));
  return `/stocks/${symbolPath}${row.exchange === "BSE" ? "?exchange=BSE" : ""}`;
}

function ShimmerChips() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="shimmer h-9 w-28 shrink-0 rounded-full border border-border/70"
        />
      ))}
    </div>
  );
}

export function PopularStocks() {
  const [rows, setRows] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async (force = false) => {
      try {
        const data = await fetchTickerTape([], { force });
        if (alive) setRows(data.slice(0, 16));
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load(false);

    const timer = setInterval(() => void load(true), 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-gradient-to-b from-accent to-amber-400" />
        <div>
          <h2 className="font-[var(--font-space)] text-base font-bold sm:text-lg">
            Live Stocks
          </h2>
          <p className="text-[11px] text-muted sm:text-xs">
            Quick access to Indian equities with live prices
          </p>
        </div>
      </div>

      {loading ? (
        <ShimmerChips />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-panel/70 p-4 text-sm text-muted">
          Live stock prices are unavailable right now.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {rows.map((row) => {
            const positive = row.changePercent >= 0;
            return (
              <Link
                key={`${row.exchange || "NSE"}-${row.symbol}`}
                href={stockHref(row)}
                className="group flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-panel/70 px-3 py-1.5 backdrop-blur transition hover:border-accent/40 hover:bg-panel active:scale-[0.98]"
              >
                <span className="text-xs font-bold tracking-wide text-text group-hover:text-accent">
                  {row.symbol}
                </span>
                {row.exchange ? (
                  <span className="rounded border border-border/50 bg-bg/45 px-1 py-0.5 text-[9px] font-bold text-muted">
                    {row.exchange}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    positive
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger"
                  }`}
                >
                  {positive ? "+" : ""}
                  {row.changePercent.toFixed(2)}%
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
