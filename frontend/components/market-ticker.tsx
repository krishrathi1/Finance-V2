"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchTickerTape } from "@/lib/api";

type TickerRow = {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
  exchange?: "NSE" | "BSE";
  high?: number;
  low?: number;
};

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function TrendMarker({ up }: { up: boolean }) {
  if (up) {
    return (
      <span
        className="inline-block h-0 w-0 border-l-[7px] border-r-[7px] border-b-[11px] border-l-transparent border-r-transparent align-middle"
        style={{ borderBottomColor: "hsl(var(--success))" }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="inline-block h-0 w-0 border-l-[7px] border-r-[7px] border-t-[11px] border-l-transparent border-r-transparent align-middle"
      style={{ borderTopColor: "hsl(var(--danger))" }}
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
        const data = await fetchTickerTape([], { force: forceRefresh });
        if (alive && data.length) setRows(data);
      } catch {
        if (alive) setRows([]);
      }
    };

    load(false);
    const timer = setInterval(() => {
      void load(true);
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const tape = useMemo(() => {
    return rows.length ? [...rows, ...rows] : [];
  }, [rows]);

  const durationSeconds = useMemo(() => {
    const minDuration = 280;
    const maxDuration = 4800;
    const secondsPerItem = 3;
    return Math.max(minDuration, Math.min(maxDuration, Math.round(tape.length * secondsPerItem)));
  }, [tape.length]);

  if (!tape.length) {
    return null;
  }

  return (
    <div className="ticker-shell border-t border-border/60 bg-panel/70">
      <div className="ticker-track py-1.5 sm:py-2" style={{ animationDuration: `${durationSeconds}s` }}>
        {tape.map((item, idx) => {
          const up = item.change >= 0;
          const color = up ? "text-success" : "text-danger";
          const symbolPath = encodeURIComponent(item.symbol.replace(/\s+/g, ""));
          const stockHref = `/stocks/${symbolPath}${item.exchange === "BSE" ? "?exchange=BSE" : ""}`;
          const isStockSymbol = !item.symbol.includes(" ");
          const content = (
            <span className="inline-flex items-center gap-2 sm:gap-2.5">
              <TrendMarker up={up} />
              <span className="font-bold tracking-wide text-text">{item.symbol}</span>
              {item.exchange ? (
                <span className="rounded border border-border/50 bg-bg/45 px-1.5 py-0.5 text-[9px] font-bold text-muted">
                  {item.exchange}
                </span>
              ) : null}
              <span className="font-semibold text-text/95">
                Rs {item.cmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {item.high !== undefined && item.low !== undefined && (
                <span className="inline-flex items-center gap-1.5 text-[10px] text-muted/80 font-medium bg-bg/40 border border-border/40 px-1.5 py-0.5 rounded shadow-sm">
                  <span className="text-success/90">H: <span className="font-semibold text-text/85">{item.high.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></span>
                  <span className="text-border/40">|</span>
                  <span className="text-danger/90">L: <span className="font-semibold text-text/85">{item.low.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></span>
                </span>
              )}
              <span className={`${color} font-bold text-xs sm:text-sm whitespace-nowrap`}>
                {formatSigned(item.change)} ({formatSigned(item.changePercent)}%)
              </span>
              <TrendMarker up={up} />
            </span>
          );

          if (!isStockSymbol) {
            return (
              <span key={`${item.symbol}-${idx}`} className="ticker-item inline-flex items-center gap-1.5 px-3 text-xs font-semibold sm:gap-2 sm:px-5 sm:text-sm">
                {content}
              </span>
            );
          }

          return (
            <Link
              key={`${item.symbol}-${idx}`}
              href={stockHref}
              prefetch={false}
              className="ticker-item inline-flex items-center gap-1.5 px-3 text-xs font-semibold hover:opacity-90 active:scale-[0.98] sm:gap-2 sm:px-5 sm:text-sm"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
