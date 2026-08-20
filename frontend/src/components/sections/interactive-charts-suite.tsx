"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart3, LineChart as LineChartIcon, PieChart, ShieldAlert, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/shared/types";

type TabKey = "price-dma" | "financials" | "shareholding" | "drawdown" | "sip";

export function InteractiveChartsSuite({ data }: { data: DashboardData }) {
  const [activeTab, setActiveTab] = useState<TabKey>("price-dma");

  // 1. Price & Moving Averages (50-DMA & 200-DMA)
  const priceChartData = useMemo(() => {
    const history = data.price?.history || [];
    if (!history.length) return [];
    
    // Process rolling averages
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.map((pt, idx) => {
      const priceVal = pt.close;
      let sma50: number | null = null;
      let sma200: number | null = null;

      if (idx >= 49) {
        const slice50 = sorted.slice(idx - 49, idx + 1);
        sma50 = Math.round((slice50.reduce((acc, p) => acc + p.close, 0) / 50) * 100) / 100;
      }
      if (idx >= 199) {
        const slice200 = sorted.slice(idx - 199, idx + 1);
        sma200 = Math.round((slice200.reduce((acc, p) => acc + p.close, 0) / 200) * 100) / 100;
      }

      return {
        date: pt.date,
        price: priceVal,
        sma50,
        sma200,
      };
    });
  }, [data.price?.history]);

  // 2. Financial Growth (Revenue & Net Income Multi-Year)
  const financialGrowthData = useMemo(() => {
    const yearly = data.financials?.yearly || [];
    if (!yearly.length) return [];
    return yearly.map((yr) => ({
      period: yr.period || "FY",
      revenue: yr.revenue ?? null,
      netProfit: yr.profit ?? null,
    })).filter((item) => item.revenue !== null || item.netProfit !== null);
  }, [data.financials?.yearly]);

  // 3. Shareholding Pattern Evolution
  const shareholdingData = useMemo(() => {
    const history = data.shareholding?.history || [];
    if (!history.length) {
      const s = data.shareholding;
      if (s?.promoters || s?.fii || s?.dii) {
        return [
          {
            quarter: s.quarter || "Current",
            Promoters: s.promoters || 0,
            FII: s.fii || 0,
            DII: s.dii || 0,
            Public: s.public || 0,
          },
        ];
      }
      return [];
    }
    return history.map((q) => ({
      quarter: q.quarter,
      Promoters: q.promoters || 0,
      FII: q.fii || 0,
      DII: q.dii || 0,
      Public: q.public || 0,
    }));
  }, [data.shareholding]);

  // 4. Drawdown Risk Curve
  const drawdownData = useMemo(() => {
    const history = data.price?.history || [];
    if (!history.length) return [];
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let peak = -Infinity;
    return sorted.map((pt) => {
      const priceVal = pt.close;
      if (priceVal > peak) peak = priceVal;
      const drawdown = peak > 0 ? ((priceVal - peak) / peak) * 100 : 0;
      return {
        date: pt.date,
        drawdown: Math.round(drawdown * 100) / 100,
        price: priceVal,
      };
    });
  }, [data.price?.history]);

  // 5. SIP Wealth Growth Curve (Simulated ₹10k/mo)
  const sipGrowthData = useMemo(() => {
    const history = data.price?.history || [];
    if (history.length < 2) return [];
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const monthlyInstallment = 10000;
    let invested = 0;
    let totalUnits = 0;

    const points: Array<{ date: string; invested: number; value: number }> = [];

    sorted.forEach((pt, idx) => {
      const priceVal = pt.close;
      if (idx % 20 === 0) {
        invested += monthlyInstallment;
        totalUnits += monthlyInstallment / (priceVal || 1);
      }
      const currentValue = Math.round(totalUnits * priceVal);
      if (idx % 5 === 0 || idx === sorted.length - 1) {
        points.push({
          date: pt.date,
          invested,
          value: currentValue,
        });
      }
    });

    return points;
  }, [data.price?.history]);

  const tabs: Array<{ id: TabKey; label: string; icon: React.ReactNode }> = [
    { id: "price-dma", label: "Price & DMAs", icon: <LineChartIcon className="h-3.5 w-3.5" /> },
    { id: "financials", label: "Financial Growth", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: "shareholding", label: "Shareholding", icon: <PieChart className="h-3.5 w-3.5" /> },
    { id: "drawdown", label: "Drawdown Risk", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    { id: "sip", label: "SIP Growth", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  ];

  const tabColorMap: Record<TabKey, string> = {
    "price-dma": "bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 text-white shadow-lg shadow-amber-500/30 ring-1 ring-amber-400/40",
    "financials": "bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30 ring-1 ring-blue-400/40",
    "shareholding": "bg-gradient-to-r from-purple-600 via-purple-500 to-violet-500 text-white shadow-lg shadow-purple-500/30 ring-1 ring-purple-400/40",
    "drawdown": "bg-gradient-to-r from-rose-600 via-red-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 ring-1 ring-rose-400/40",
    "sip": "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-400/40",
  };

  return (
    <Card className="p-3 sm:p-4">
      <div className="space-y-3.5 border-b border-border/40 pb-3">
        {/* Header Title */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/15 text-primary shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-fg">Interactive Data Graphs &amp; Analytics</h3>
            <p className="text-xs text-muted">Comprehensive visual charts covering price trends, financials, ownership &amp; risk</p>
          </div>
        </div>

        {/* Unified Full-Width Segmented Tab Bar with Custom Active Colors */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 rounded-2xl border border-border/70 bg-bg/60 p-1.5 backdrop-blur-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${
                activeTab === t.id
                  ? tabColorMap[t.id]
                  : "text-muted hover:text-fg hover:bg-panel/80"
              }`}
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Display Container - Minimal Margin to Stick Flush to Borders */}
      <div className="mt-3 h-[350px] w-full -mx-1">
        {activeTab === "price-dma" && (
          priceChartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceChartData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="price" name="Share Price (₹)" stroke="#f59e0b" strokeWidth={2.5} fill="url(#priceGrad)" />
                <Line type="monotone" dataKey="sma50" name="50-Day DMA" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sma200" name="200-Day DMA" stroke="#6366f1" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">Price history chart unavailable.</div>
          )
        )}

        {activeTab === "financials" && (
          financialGrowthData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialGrowthData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="Total Revenue (Cr)" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="netProfit" name="Net Profit (Cr)" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">Financial growth chart data unavailable.</div>
          )
        )}

        {activeTab === "shareholding" && (
          shareholdingData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={shareholdingData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="quarter" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Promoters" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
                <Area type="monotone" dataKey="FII" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="DII" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                <Area type="monotone" dataKey="Public" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">Shareholding trend chart unavailable.</div>
          )
        )}

        {activeTab === "drawdown" && (
          drawdownData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdownData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <YAxis domain={["auto", 0]} tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="drawdown" name="Drawdown from Peak (%)" stroke="#ef4444" strokeWidth={2.5} fill="url(#drawdownGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">Drawdown risk data unavailable.</div>
          )
        )}

        {activeTab === "sip" && (
          sipGrowthData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sipGrowthData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="invested" name="Invested Principal (₹)" stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="value" name="Portfolio Value (₹)" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">SIP simulation data unavailable.</div>
          )
        )}
      </div>
    </Card>
  );
}
