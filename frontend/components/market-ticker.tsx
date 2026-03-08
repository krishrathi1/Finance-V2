"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchTickerTape } from "@/lib/api";

const DEFAULT_SYMBOLS = ["NIFTY 50", "HDFCBANK", "RELIANCE", "SBIN", "TCS", "INFY", "ICICIBANK", "LT", "BHARTIARTL", "ITC"];

type TickerRow = { symbol: string; cmp: number; change: number; changePercent: number };

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function MarketTicker() {
  const [rows, setRows] = useState<TickerRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async (forceRefresh = false) => {
      try {
        const data = await fetchTickerTape(DEFAULT_SYMBOLS, { force: forceRefresh });
        if (alive && data.length) setRows(data);
      } catch {
        if (alive) setRows([]);
      }
    };

    load(false);
    const timer = setInterval(() => {
      void load(true);
    }, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const tape = useMemo(() => {
    const source = rows.length ? rows : DEFAULT_SYMBOLS.map((symbol) => ({ symbol, cmp: 0, change: 0, changePercent: 0 }));
    return [...source, ...source];
  }, [rows]);

  const durationSeconds = useMemo(() => {
    // Extra-slow tape for better readability across large symbol sets.
    return Math.max(80, Math.min(1800, Math.round(tape.length * 0.3)));
  }, [tape.length]);

  return (
    <div className="ticker-shell border-t border-border/60 bg-panel/70">
      <div className="ticker-track py-2" style={{ animationDuration: `${durationSeconds}s` }}>
        {tape.map((item, idx) => {
          const up = item.change >= 0;
          const color = up ? "text-success" : "text-danger";
          const symbolPath = item.symbol.replace(/\s+/g, "");
          const isStockSymbol = !item.symbol.includes(" ");
          const content = (
            <>
              <span className={color}>{up ? "^" : "v"}</span>
              <span>{item.symbol}</span>
              <span>{item.cmp ? `Rs ${item.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "-"}</span>
              <span className={color}>{item.cmp ? `${formatSigned(item.change)} (${formatSigned(item.changePercent)}%) 1D` : ""}</span>
              <span className={color}>{up ? "^" : "v"}</span>
            </>
          );

          if (!isStockSymbol) {
            return (
              <span key={`${item.symbol}-${idx}`} className="ticker-item inline-flex items-center gap-2 px-5 text-sm font-semibold">
                {content}
              </span>
            );
          }

          return (
            <Link
              key={`${item.symbol}-${idx}`}
              href={`/stocks/${symbolPath}`}
              className="ticker-item inline-flex items-center gap-2 px-5 text-sm font-semibold hover:opacity-90"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
