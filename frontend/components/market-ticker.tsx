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
      void load(false);
    }, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const tape = useMemo(() => {
    return rows.length ? [...rows, ...rows] : [];
  }, [rows]);

  const durationSeconds = useMemo(() => {
    const minDuration = 212; // 360 / 1.7
    const maxDuration = 1882; // 3200 / 1.7
    const secondsPerItem = 5.88; // 10 / 1.7
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
              <span key={`${item.symbol}-${idx}`} className="ticker-item inline-flex items-center gap-1.5 px-3 text-xs font-semibold sm:gap-2 sm:px-5 sm:text-sm">
                {content}
              </span>
            );
          }

          return (
            <Link
              key={`${item.symbol}-${idx}`}
              href={`/stocks/${symbolPath}`}
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
