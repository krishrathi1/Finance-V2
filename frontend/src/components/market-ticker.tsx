"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
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

// The ticker source (fetchTickerTape([])) returns the entire listed Indian
// universe (~7,000 symbols). The marquee must only render a small bounded
// slice — rendering all of them produced ~190k DOM nodes and froze the page.
const TICKER_LIMIT = 30;

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

  const load = async (forceRefresh = false) => {
    try {
      const data = await fetchTickerTape([], { force: forceRefresh });
      if (data.length) setRows(data);
    } catch {
      setRows([]);
    }
  };

  useVisibilityPolling((initial) => void load(!initial), 15_000);

  const tape = useMemo(() => {
    // Sort A-Z and take a bounded slice; duplicate for seamless scrolling loop.
    const sorted = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
    const visible = sorted.slice(0, TICKER_LIMIT);
    return visible.length ? [...visible, ...visible] : [];
  }, [rows]);

  const durationSeconds = useMemo(() => {
    const minDuration = 40;
    const maxDuration = 240;
    const secondsPerItem = 1.8;
    return Math.max(minDuration, Math.min(maxDuration, Math.round(tape.length * secondsPerItem)));
  }, [tape.length]);

  // Reserve the strip's height rather than collapsing to nothing. This lives in
  // the sticky header, so returning null made the header ~30px shorter until
  // quotes arrived and then taller again — shoving every page's content down
  // mid-load. An empty shell of the same height keeps the header a fixed size
  // whether or not the tape has data.
  if (!tape.length) {
    return (
      <div
        className="ticker-shell min-h-[29px] border-t border-border/60 bg-panel/70 sm:min-h-[37px]"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="ticker-shell min-h-[29px] border-t border-border/60 bg-panel/70 sm:min-h-[37px]">
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
