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
  }, 20_000);

  const { gainers, losers } = useMemo(() => {
    const sorted = [...rows].filter((r) => r.cmp > 0);
    const gainers = sorted.sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
    const losers = sorted.sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);
    return { gainers, losers };
  }, [rows]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="shimmer h-[280px] rounded-2xl border border-border/70" />
        <div className="shimmer h-[280px] rounded-2xl border border-border/70" />
      </div>
    );
  }

  if (!rows.length) return null;

  const renderList = (
    items: TickerRow[],
    title: string,
    icon: React.ReactNode,
    isGainer: boolean
  ) => (
    <div className="glow-card density-panel-lg rounded-2xl border border-border/70 bg-panel/70">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isGainer ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
          {icon}
        </div>
        <h3 className="density-copy font-[var(--font-space)] text-sm font-bold uppercase tracking-wider text-muted">
          {title}
        </h3>
      </div>
      <div className="mt-3 space-y-1.5">
        {items.map((item, idx) => {
          const isStock = !item.symbol.includes(" ");
          const symbolPath = encodeURIComponent(item.symbol.replace(/\s+/g, ""));
          const key = `${item.exchange || "NSE"}-${item.symbol}-${idx}`;
          const href = `/stocks/${symbolPath}${item.exchange === "BSE" ? "?exchange=BSE" : ""}`;
          const content = (
            <div className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-bg/80 active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-bg text-[11px] font-bold text-muted">
                  {idx + 1}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="density-copy text-sm font-semibold">{item.symbol}</p>
                    {item.exchange ? (
                      <span className="rounded border border-border/50 bg-bg/45 px-1 py-0.5 text-[9px] font-bold text-muted">
                        {item.exchange}
                      </span>
                    ) : null}
                  </div>
                  <p className="density-copy text-[11px] text-muted">
                    Rs {item.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`density-value text-sm font-bold ${isGainer ? "text-success" : "text-danger"}`}>
                  {formatSigned(item.changePercent)}%
                </p>
                <p className={`density-copy text-[11px] ${isGainer ? "text-success/70" : "text-danger/70"}`}>
                  {formatSigned(item.change)}
                </p>
              </div>
            </div>
          );

          if (!isStock) return <div key={key}>{content}</div>;
          return (
            <Link key={key} href={href}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {renderList(gainers, "Top Gainers", <TrendingUp className="h-4 w-4" />, true)}
      {renderList(losers, "Top Losers", <TrendingDown className="h-4 w-4" />, false)}
    </div>
  );
}
