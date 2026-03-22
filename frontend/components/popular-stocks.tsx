"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchTickerTape } from "@/lib/api";

const POPULAR_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFOSYS",
  "ICICIBANK",
  "SBIN",
  "BAJFINANCE",
  "ASIANPAINT",
  "MARUTI",
  "LT",
];

type TickerRow = { symbol: string; cmp: number; change: number; changePercent: number };

function ShimmerChips() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {POPULAR_SYMBOLS.map((sym) => (
        <div
          key={sym}
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
        const data = await fetchTickerTape(POPULAR_SYMBOLS, { force });
        if (alive) {
          // Keep only the popular symbols in the order defined
          const map = new Map(data.map((r) => [r.symbol, r]));
          const ordered = POPULAR_SYMBOLS
            .map((sym) => map.get(sym))
            .filter((r): r is TickerRow => r !== undefined);
          setRows(ordered);
        }
      } catch {
        /* silently ignore — page still renders */
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load(false);

    // Refresh every 20 seconds
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
            Popular Stocks
          </h2>
          <p className="text-[11px] text-muted sm:text-xs">
            Quick access to top Indian equities — live prices
          </p>
        </div>
      </div>

      {loading ? (
        <ShimmerChips />
      ) : rows.length === 0 ? (
        /* Fallback: show plain symbol links when prices are unavailable */
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {POPULAR_SYMBOLS.map((sym) => (
            <Link
              key={sym}
              href={`/stocks/${sym}`}
              className="shrink-0 rounded-full border border-border/70 bg-panel/60 px-4 py-2 text-xs font-semibold text-muted backdrop-blur transition hover:border-accent/50 hover:text-text"
            >
              {sym}
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {rows.map((row) => {
            const positive = row.changePercent >= 0;
            return (
              <Link
                key={row.symbol}
                href={`/stocks/${row.symbol}`}
                className="group flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-panel/70 px-3 py-1.5 backdrop-blur transition hover:border-accent/40 hover:bg-panel"
              >
                <span className="text-xs font-bold tracking-wide text-text group-hover:text-accent">
                  {row.symbol}
                </span>
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
