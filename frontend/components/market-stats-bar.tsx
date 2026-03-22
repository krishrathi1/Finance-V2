"use client";

import { useEffect, useState } from "react";
import { Activity, BarChart3, Shield, Zap } from "lucide-react";

import { fetchTickerTape } from "@/lib/api";

export function MarketStatsBar() {
  const [stats, setStats] = useState({ totalStocks: 0, advancing: 0, declining: 0, avgChange: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchTickerTape([], { force: false });
        if (alive && data.length) {
          const advancing = data.filter((r) => r.changePercent > 0).length;
          const declining = data.filter((r) => r.changePercent < 0).length;
          const avgChange = data.reduce((sum, r) => sum + r.changePercent, 0) / data.length;
          setStats({ totalStocks: data.length, advancing, declining, avgChange });
        }
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer h-[72px] rounded-xl border border-border/70" />
        ))}
      </div>
    );
  }

  const items = [
    {
      icon: <Activity className="h-4 w-4" />,
      label: "Stocks Tracked",
      value: stats.totalStocks.toString(),
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      icon: <Zap className="h-4 w-4" />,
      label: "Advancing",
      value: stats.advancing.toString(),
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      icon: <BarChart3 className="h-4 w-4" />,
      label: "Declining",
      value: stats.declining.toString(),
      color: "text-danger",
      bgColor: "bg-danger/10",
    },
    {
      icon: <Shield className="h-4 w-4" />,
      label: "Avg. Change",
      value: `${stats.avgChange >= 0 ? "+" : ""}${stats.avgChange.toFixed(2)}%`,
      color: stats.avgChange >= 0 ? "text-success" : "text-danger",
      bgColor: stats.avgChange >= 0 ? "bg-success/10" : "bg-danger/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="stat-card flex items-center gap-3 rounded-xl border border-border/70 bg-panel/70 px-3 py-3 sm:px-4"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bgColor} ${item.color}`}>
            {item.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
