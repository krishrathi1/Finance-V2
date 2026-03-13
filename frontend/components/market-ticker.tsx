"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchTickerTape } from "@/lib/api";

type TickerRow = { symbol: string; cmp: number; change: number; changePercent: number };

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function TrendMarker({ up }: { up: boolean }) {
  if (up) {
    return (
      <span
        className="inline-block h-0 w-0 border-l-[7px] border-r-[7px] border-b-[11px] border-l-transparent border-r-transparent border-b-[#39ff14] align-middle"
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="inline-block h-0 w-0 border-l-[7px] border-r-[7px] border-t-[11px] border-l-transparent border-r-transparent border-t-[#ff0015] align-middle"
      aria-hidden="true"
    />
  );
}

export function MarketTicker() {
  const [rows, setRows] = useState<TickerRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async (forceRefresh = false) => {
      try {
        // No symbol filter = backend returns the full NSE market ticker feed.
        const data = await fetchTickerTape([], { force: forceRefresh });
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
    return rows.length ? [...rows, ...rows] : [];
  }, [rows]);

  const durationSeconds = useMemo(() => {
    // Extra-slow tape for better readability across large symbol sets.
    return Math.max(80, Math.min(1800, Math.round(tape.length * 0.3)));
  }, [tape.length]);

  if (!tape.length) {
    return null;
  }

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
              <TrendMarker up={up} />
              <span>{item.symbol}</span>
              <span>{item.cmp ? `Rs ${item.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "-"}</span>
              <span className={color}>{item.cmp ? `${formatSigned(item.change)} (${formatSigned(item.changePercent)}%) 1D` : ""}</span>
              <TrendMarker up={up} />
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
