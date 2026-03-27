"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchIndexHeatmap } from "@/lib/api";
import { cn } from "@/lib/utils";

type HeatmapRow = {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
};

const INDEX_OPTIONS = [
  "NIFTY 50",
  "NIFTY BANK",
  "NIFTY FINANCIAL SERVICES",
  "NIFTY MIDCAP 100",
  "BSE SENSEX",
  "S&P BSE BANKEX"
];

const LEGEND = [
  { label: "Above +5%", className: "border-success/50 bg-success text-white" },
  { label: "+2 to +5%", className: "border-success/40 bg-success/85 text-white" },
  { label: "0 to +2%", className: "border-success/30 bg-success/65 text-white" },
  { label: "0%", className: "border-border/80 bg-panel/90 text-text" },
  { label: "-2 to 0%", className: "border-danger/20 bg-danger/60 text-white" },
  { label: "-5 to -2%", className: "border-danger/30 bg-danger/80 text-white" },
  { label: "Below -5%", className: "border-danger/40 bg-danger text-white" }
];

function tileStyle(changePercent: number) {
  if (changePercent > 5) return "border-success/50 bg-success text-white";
  if (changePercent > 2) return "border-success/40 bg-success/85 text-white";
  if (changePercent > 0) return "border-success/30 bg-success/65 text-white";
  if (changePercent === 0) return "border-border/80 bg-panel/90 text-text";
  if (changePercent > -2) return "border-danger/20 bg-danger/60 text-white";
  if (changePercent > -5) return "border-danger/30 bg-danger/80 text-white";
  return "border-danger/40 bg-danger text-white";
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function MarketHeatmap() {
  const [selectedIndex, setSelectedIndex] = useState<string>("NIFTY 50");
  const [rows, setRows] = useState<HeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async (forceRefresh = false) => {
      try {
        const payload = await fetchIndexHeatmap(selectedIndex, { force: forceRefresh });
        if (!alive) return;
        setRows(payload.rows);
        setUpdatedAt(payload.updatedAt || "");
      } catch {
        if (!alive) return;
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    load(false);
    const timer = setInterval(() => {
      void load(false);
    }, 180_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedIndex]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.changePercent - a.changePercent);
  }, [rows]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <label htmlFor="heatmap-index" className="density-copy text-xs uppercase tracking-[0.2em] text-muted">
            Index
          </label>
          <select
            id="heatmap-index"
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(e.target.value)}
            className="rounded-xl border border-border/70 bg-panel px-3 py-2 text-sm font-semibold outline-none transition-colors focus:border-accent"
          >
            {INDEX_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {LEGEND.map((item) => (
            <span key={item.label} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-3 sm:py-1 sm:text-xs", item.className)}>
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {updatedAt ? <p className="text-xs text-muted">Last update: {new Date(updatedAt).toLocaleTimeString()}</p> : null}

      {loading ? (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2 sm:gap-3">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div key={idx} className="rounded-xl border border-border/60 bg-panel/60 p-[var(--panel-padding)] sm:rounded-2xl">
              <div className="flex items-start justify-between">
                <div className="shimmer h-4 w-16 rounded-full" />
                <div className="shimmer h-5 w-14 rounded-full" />
              </div>
              <div className="mt-6 flex items-end justify-between">
                <div className="shimmer h-3 w-20 rounded-full" />
                <div className="shimmer h-3 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2 sm:gap-3">
          {sortedRows.map((row) => (
            <Link
              key={row.symbol}
              href={`/stocks/${row.symbol}`}
              onMouseEnter={() => setActiveSymbol(row.symbol)}
              onMouseLeave={() => setActiveSymbol(null)}
              onFocus={() => setActiveSymbol(row.symbol)}
              onBlur={() => setActiveSymbol(null)}
              className={cn(
                "group flex min-h-[88px] flex-col justify-between overflow-hidden rounded-xl border p-3 transition duration-200 active:scale-[0.98] sm:min-h-[96px] sm:rounded-2xl",
                tileStyle(row.changePercent)
                ,
                activeSymbol && activeSymbol !== row.symbol && "opacity-45",
                activeSymbol === row.symbol && "-translate-y-1 shadow-xl ring-2 ring-white/20"
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="min-w-0 truncate text-[11px] font-bold tracking-wide sm:text-xs">{row.symbol}</p>
                <p className="shrink-0 text-sm font-black leading-none sm:text-base">{formatSigned(row.changePercent)}%</p>
              </div>
              <div className="flex items-end justify-between gap-1">
                <p className="min-w-0 truncate text-[10px] font-semibold sm:text-[11px]">₹{row.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                <p className="shrink-0 text-[10px] font-semibold opacity-90">{formatSigned(row.change)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
