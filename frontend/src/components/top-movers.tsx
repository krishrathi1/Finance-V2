"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchTickerTape } from "@/lib/api";

type TickerRow = { symbol: string; cmp: number; change: number; changePercent: number; exchange?: "NSE" | "BSE" };

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function TopMovers() {
  const [rows, setRows] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchTickerTape([], { force: false });
      setRows(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useVisibilityPolling((initial) => {
    if (initial) {
      void load();
      return;
    }
    void fetchTickerTape([], { force: true }).then((data) => {
      setRows(data);
    }).catch(() => {});
  }, 15_000);

  const { gainers, losers } = useMemo(() => {
    const sorted = [...rows].filter((r) => r.cmp > 0);
    const gainers = sorted.sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
    const losers = sorted.sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);
    return { gainers, losers };
  }, [rows]);

  if (loading) {
    return (
      <div className="rounded-[28px] border border-border/50 bg-panel/60 p-6 backdrop-blur-sm">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="shimmer h-[260px] rounded-2xl" />
          <div className="shimmer h-[260px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <article className="rounded-[28px] border border-border/50 bg-panel/60 p-6 backdrop-blur-sm shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
            Live Action
          </p>
          <h3 className="mt-0.5 font-[var(--font-space)] text-lg font-bold">
            Top Movers
          </h3>
        </div>
        <span className="shrink-0 text-[10px] text-muted">Refreshed every 15s</span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-8">
        {renderList(gainers, "TOP GAINERS", <TrendingUp className="h-4 w-4" />, true)}
        {renderList(losers, "TOP LOSERS", <TrendingDown className="h-4 w-4" />, false)}
      </div>
    </article>
  );
}

function renderList(
  items: TickerRow[],
  title: string,
  icon: React.ReactNode,
  isGainer: boolean
) {
  return (
    <div>
      <h3
        className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
          isGainer ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {icon}
        {title}
      </h3>
      <ul className="mt-3 space-y-1.5">
        {items.map((item, idx) => {
          const isStock = !item.symbol.includes(" ");
          const symbolPath = encodeURIComponent(item.symbol.replace(/\s+/g, ""));
          const key = `${item.exchange || "NSE"}-${item.symbol}-${idx}`;
          const href = `/stocks/${symbolPath}${item.exchange === "BSE" ? "?exchange=BSE" : ""}`;

          const content = (
            <div className="group flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-bg/60">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="w-3.5 shrink-0 text-[11px] font-medium tabular-nums text-muted">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-bold tracking-tight transition group-hover:text-accent">
                    {item.symbol}
                  </span>
                  <span className="block text-[11px] text-muted">
                    Rs {item.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                  isGainer
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
                }`}
              >
                <span className="text-[10px]">{isGainer ? "↗" : "↘"}</span>
                {formatSigned(item.changePercent)}%
              </span>
            </div>
          );

          if (!isStock) return <li key={key}>{content}</li>;
          return (
            <li key={key}>
              <Link href={href}>{content}</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

