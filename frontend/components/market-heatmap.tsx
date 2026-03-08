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
  { label: "Above +5%", className: "bg-emerald-700/90 text-white" },
  { label: "+2 to +5%", className: "bg-emerald-600/85 text-white" },
  { label: "0 to +2%", className: "bg-emerald-500/80 text-white" },
  { label: "0%", className: "bg-zinc-500/80 text-white" },
  { label: "-2 to 0%", className: "bg-rose-400/90 text-white" },
  { label: "-5 to -2%", className: "bg-rose-500/90 text-white" },
  { label: "Below -5%", className: "bg-red-700/95 text-white" }
];

function tileStyle(changePercent: number) {
  if (changePercent > 5) return "bg-emerald-700/90 border-emerald-400/40 text-white";
  if (changePercent > 2) return "bg-emerald-600/85 border-emerald-400/35 text-white";
  if (changePercent > 0) return "bg-emerald-500/80 border-emerald-300/35 text-white";
  if (changePercent === 0) return "bg-zinc-500/80 border-zinc-300/35 text-white";
  if (changePercent > -2) return "bg-rose-400/90 border-rose-200/40 text-white";
  if (changePercent > -5) return "bg-rose-500/90 border-rose-300/35 text-white";
  return "bg-red-700/95 border-red-400/35 text-white";
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function MarketHeatmap() {
  const [selectedIndex, setSelectedIndex] = useState<string>("NIFTY 50");
  const [rows, setRows] = useState<HeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

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
      void load(true);
    }, 20_000);
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
          <label htmlFor="heatmap-index" className="text-xs uppercase tracking-[0.2em] text-muted">
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

        <div className="flex flex-wrap gap-2">
          {LEGEND.map((item) => (
            <span key={item.label} className={cn("rounded-full px-3 py-1 text-xs font-semibold", item.className)}>
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {updatedAt ? <p className="text-xs text-muted">Last update: {new Date(updatedAt).toLocaleTimeString()}</p> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div key={idx} className="h-[96px] animate-pulse rounded-2xl border border-border/60 bg-panel/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {sortedRows.map((row) => (
            <Link
              key={row.symbol}
              href={`/stocks/${row.symbol}`}
              className={cn(
                "group flex h-[96px] flex-col justify-between rounded-2xl border p-3 transition-transform hover:-translate-y-0.5",
                tileStyle(row.changePercent)
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold tracking-wide">{row.symbol}</p>
                <p className="text-2xl font-black leading-none">{formatSigned(row.changePercent)}%</p>
              </div>
              <div className="flex items-end justify-between gap-2">
                <p className="text-sm font-semibold">Rs {row.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                <p className="text-xs font-semibold opacity-90">{formatSigned(row.change)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
