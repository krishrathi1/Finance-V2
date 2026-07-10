"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchIndexHeatmap, fetchMarketIndexOptions, type MarketIndexOption } from "@/lib/api";
import { cn } from "@/lib/utils";

type HeatmapRow = {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
  exchange?: "NSE" | "BSE";
};

type HeatmapGroupTone = "success" | "danger" | "neutral";

const LIVE_REFRESH_MS = 30_000;

const LEGEND = [
  { label: "Above +5%", className: "border-success/50 bg-success text-white" },
  { label: "+2 to +5%", className: "border-success/40 bg-success/85 text-white" },
  { label: "0 to +2%", className: "border-success/30 bg-success/65 text-white" },
  { label: "0%", className: "border-border/80 bg-panel/90 text-text" },
  { label: "-2 to 0%", className: "border-danger/20 bg-danger/60 text-white" },
  { label: "-5 to -2%", className: "border-danger/30 bg-danger/80 text-white" },
  { label: "Below -5%", className: "border-danger/40 bg-danger text-white" },
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

function formatPrice(value: number) {
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatSourceLabel(source: string) {
  if (!source) return "";
  if (source === "provider-unavailable") return "provider unavailable";
  if (source === "bse-official") return "BSE live heatmap";
  if (source.startsWith("nse-official")) {
    const quoteSource = source.split("/")[1];
    return quoteSource ? `NSE official list + ${quoteSource} quotes` : "NSE official list";
  }
  return source.replace(/-/g, " ");
}

function HeatmapTile({
  row,
  activeSymbol,
  setActiveSymbol,
}: {
  row: HeatmapRow;
  activeSymbol: string | null;
  setActiveSymbol: (symbol: string | null) => void;
}) {
  const symbolPath = encodeURIComponent(row.symbol.replace(/\s+/g, ""));
  const href = `/stocks/${symbolPath}${row.exchange === "BSE" ? "?exchange=BSE" : ""}`;
  const activeKey = `${row.exchange || "NSE"}-${row.symbol}`;

  return (
    <Link
      href={href}
      onMouseEnter={() => setActiveSymbol(activeKey)}
      onMouseLeave={() => setActiveSymbol(null)}
      onFocus={() => setActiveSymbol(activeKey)}
      onBlur={() => setActiveSymbol(null)}
      className={cn(
        "group flex flex-col gap-2 overflow-hidden rounded-xl border p-3 transition duration-200 active:scale-[0.98] sm:rounded-2xl",
        tileStyle(row.changePercent),
        activeSymbol && activeSymbol !== activeKey && "opacity-45",
        activeSymbol === activeKey && "-translate-y-1 shadow-xl ring-2 ring-white/20"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold tracking-wide sm:text-xs">{row.symbol}</p>
          {row.exchange ? <p className="text-[9px] font-bold uppercase opacity-80">{row.exchange}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-black leading-none sm:text-base">{formatSigned(row.changePercent)}%</p>
      </div>
      <div className="flex items-end justify-between gap-1">
        <p className="min-w-0 truncate text-[10px] font-semibold sm:text-[11px]">{formatPrice(row.cmp)}</p>
        <p className="shrink-0 text-[10px] font-semibold opacity-90">{formatSigned(row.change)}</p>
      </div>
    </Link>
  );
}

function HeatmapGroup({
  title,
  count,
  tone,
  rows,
  activeSymbol,
  setActiveSymbol,
}: {
  title: string;
  count: number;
  tone: HeatmapGroupTone;
  rows: HeatmapRow[];
  activeSymbol: string | null;
  setActiveSymbol: (symbol: string | null) => void;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "danger"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-border/60 bg-panel/60 text-muted";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{title}</h3>
        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", toneClass)}>
          {count}
        </span>
      </div>

      {rows.length ? (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(165px,1fr))]">
          {rows.map((row, index) => (
            <HeatmapTile
              key={`${row.exchange || "NSE"}-${row.symbol}-${index}`}
              row={row}
              activeSymbol={activeSymbol}
              setActiveSymbol={setActiveSymbol}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-panel/50 p-4 text-sm text-muted">
          No stocks in this group right now.
        </div>
      )}
    </div>
  );
}

export function MarketHeatmap() {
  const [indexOptions, setIndexOptions] = useState<MarketIndexOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>("");
  const [rows, setRows] = useState<HeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [constituentCount, setConstituentCount] = useState<number>(0);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetchMarketIndexOptions()
      .then((options) => {
        if (!alive) return;
        setIndexOptions(options);
        setSelectedIndex((current) => current || options[0]?.value || "");
      })
      .catch(() => {
        if (alive) setIndexOptions([]);
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!selectedIndex) {
      setLoading(false);
      loadRef.current = () => {};
      return;
    }

    let alive = true;

    const load = async () => {
      setRefreshing(true);
      try {
        const payload = await fetchIndexHeatmap(selectedIndex, { force: true });
        if (!alive) return;
        setRows(payload.rows);
        setUpdatedAt(payload.updatedAt || "");
        setSource(typeof payload.source === "string" ? payload.source : "");
        setConstituentCount(
          typeof payload.constituentCount === "number" ? payload.constituentCount : payload.rows.length
        );
      } catch {
        if (!alive) return;
        setRows([]);
        setSource("");
        setConstituentCount(0);
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadRef.current = () => void load();
    setLoading(true);
    void load();

    return () => {
      alive = false;
    };
  }, [selectedIndex]);

  useVisibilityPolling((initial) => {
    // Initial load (and reloads on index change) are handled by the effect above.
    if (!initial) loadRef.current();
  }, LIVE_REFRESH_MS);

  const groupedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.changePercent - a.changePercent);
    const gainers = sorted.filter((row) => row.changePercent > 0);
    const unchanged = sorted.filter((row) => row.changePercent === 0);
    const losers = sorted.filter((row) => row.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
    const averageChange = rows.length
      ? rows.reduce((sum, row) => sum + row.changePercent, 0) / rows.length
      : 0;

    return { gainers, losers, unchanged, averageChange };
  }, [rows]);

  const selectedLabel = indexOptions.find((option) => option.value === selectedIndex)?.label || selectedIndex;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="heatmap-index" className="density-copy text-xs uppercase tracking-[0.2em] text-muted">
            Index
          </label>
          <select
            id="heatmap-index"
            value={selectedIndex}
            onChange={(event) => setSelectedIndex(event.target.value)}
            disabled={optionsLoading || !indexOptions.length}
            className="rounded-xl border border-border/70 bg-panel px-3 py-2 text-sm font-semibold outline-none transition-colors focus:border-accent"
          >
            {indexOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              refreshing ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 bg-panel/60 text-muted"
            )}
          >
            {refreshing ? "Refreshing live prices" : "Auto refresh 30s"}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-3 sm:py-1 sm:text-xs", item.className)}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {updatedAt ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{selectedLabel}</span>
          <span>Last update: {new Date(updatedAt).toLocaleTimeString()}</span>
          {constituentCount ? <span>{constituentCount} constituents</span> : null}
          {source ? <span>{formatSourceLabel(source)}</span> : null}
          <span>Avg move: {formatSigned(groupedRows.averageChange)}%</span>
        </div>
      ) : null}

      {loading ? (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2 sm:gap-3">
          {Array.from({ length: 18 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border/60 bg-panel/60 p-[var(--panel-padding)] sm:rounded-2xl">
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
      ) : rows.length ? (
        <div className="space-y-5">
          <HeatmapGroup
            title="Gainers"
            count={groupedRows.gainers.length}
            tone="success"
            rows={groupedRows.gainers}
            activeSymbol={activeSymbol}
            setActiveSymbol={setActiveSymbol}
          />
          <HeatmapGroup
            title="Losers"
            count={groupedRows.losers.length}
            tone="danger"
            rows={groupedRows.losers}
            activeSymbol={activeSymbol}
            setActiveSymbol={setActiveSymbol}
          />

          {groupedRows.unchanged.length ? (
            <HeatmapGroup
              title="Unchanged"
              count={groupedRows.unchanged.length}
              tone="neutral"
              rows={groupedRows.unchanged}
              activeSymbol={activeSymbol}
              setActiveSymbol={setActiveSymbol}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 text-sm text-muted">
          Live heatmap data is unavailable right now. Please try another index or refresh shortly.
        </div>
      )}
    </section>
  );
}
