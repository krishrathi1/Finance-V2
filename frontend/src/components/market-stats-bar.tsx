"use client";

import { useMemo, useState } from "react";
import { Activity, BarChart3, CandlestickChart, ShieldCheck, Waves } from "lucide-react";

import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchTickerTape } from "@/lib/api";

type TickerRow = { symbol: string; cmp: number; change: number; changePercent: number };

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function findIndexRow(rows: TickerRow[], labels: string[]) {
  return rows.find((row) => labels.includes(row.symbol.toUpperCase())) || null;
}

export function MarketStatsBar() {
  const [marketRows, setMarketRows] = useState<TickerRow[]>([]);
  const [indexRows, setIndexRows] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (force = false) => {
    try {
      const [market, indexes] = await Promise.all([
        fetchTickerTape([], { force }),
        fetchTickerTape(["NIFTY 50", "BSE SENSEX"], { force }),
      ]);

      setMarketRows(market);
      setIndexRows(indexes);
    } catch {
      // Keep the last good snapshot on refresh failures.
    } finally {
      setLoading(false);
    }
  };

  useVisibilityPolling((initial) => void load(!initial), 20_000);

  const stats = useMemo(() => {
    const advancing = marketRows.filter((row) => row.changePercent > 0).length;
    const declining = marketRows.filter((row) => row.changePercent < 0).length;
    const avgChange = marketRows.length
      ? marketRows.reduce((sum, row) => sum + row.changePercent, 0) / marketRows.length
      : 0;

    return {
      totalStocks: marketRows.length,
      advancing,
      declining,
      avgChange,
    };
  }, [marketRows]);

  const nifty = findIndexRow(indexRows, ["NIFTY 50", "NIFTY50"]);
  const sensex = findIndexRow(indexRows, ["BSE SENSEX", "SENSEX", "BSESENSEX"]);

  if (loading) {
    return (
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2 sm:gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/70 bg-panel/65 p-[var(--panel-padding)]">
            <div className="flex items-center gap-3">
              <div className="shimmer h-10 w-10 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="shimmer h-3 w-20 rounded-full" />
                <div className="shimmer h-5 w-24 rounded-full" />
                <div className="shimmer h-3 w-28 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items = [
    {
      icon: <CandlestickChart className="h-4 w-4" />,
      label: "NIFTY 50",
      value: nifty ? nifty.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "--",
      delta: nifty ? `${formatSigned(nifty.changePercent)}%` : "Waiting for live feed",
      color: nifty && nifty.changePercent < 0 ? "text-danger" : "text-success",
      deltaColor: nifty && nifty.changePercent < 0 ? "text-danger/70" : "text-success/70",
      bgColor: nifty && nifty.changePercent < 0 ? "bg-danger/10" : "bg-success/10",
    },
    {
      icon: <Activity className="h-4 w-4" />,
      label: "BSE SENSEX",
      value: sensex ? sensex.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "--",
      delta: sensex ? `${formatSigned(sensex.changePercent)}%` : "Waiting for live feed",
      color: sensex && sensex.changePercent < 0 ? "text-danger" : "text-success",
      deltaColor: sensex && sensex.changePercent < 0 ? "text-danger/70" : "text-success/70",
      bgColor: sensex && sensex.changePercent < 0 ? "bg-danger/10" : "bg-success/10",
    },
    {
      icon: <BarChart3 className="h-4 w-4" />,
      label: "Adv / Dec",
      value: `${stats.advancing} / ${stats.declining}`,
      delta: `${stats.totalStocks.toLocaleString("en-IN")} tracked`,
      color: "text-accent",
      deltaColor: "text-accent/70",
      bgColor: "bg-accent/10",
    },
    {
      icon: <Waves className="h-4 w-4" />,
      label: "Avg. Change",
      value: `${stats.avgChange >= 0 ? "+" : ""}${stats.avgChange.toFixed(2)}%`,
      delta: stats.avgChange >= 0 ? "Momentum positive" : "Momentum negative",
      color: stats.avgChange >= 0 ? "text-success" : "text-danger",
      deltaColor: stats.avgChange >= 0 ? "text-success/70" : "text-danger/70",
      bgColor: stats.avgChange >= 0 ? "bg-success/10" : "bg-danger/10",
    },
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: "Coverage",
      value: stats.totalStocks.toLocaleString("en-IN"),
      delta: "Live market breadth snapshot",
      color: "text-text",
      deltaColor: "text-muted",
      bgColor: "bg-bg/80",
    },
  ];

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="stat-card density-panel flex items-center gap-3 rounded-xl border border-border/70 bg-panel/80"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bgColor} ${item.color}`}>
            {item.icon}
          </div>
          <div className="min-w-0">
            <p className="density-kicker text-[11px] uppercase tracking-[0.16em] text-muted">{item.label}</p>
            <p className={`density-value mt-1 text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className={`density-copy mt-1 text-[11px] ${item.deltaColor}`}>
              {item.delta}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
