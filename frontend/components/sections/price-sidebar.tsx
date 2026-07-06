"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { PriceChart } from "@/components/charts/price-chart";
import { MarketStatusBadge } from "@/components/market-status-badge";
import { WatchlistButton } from "@/components/watchlist-button";
import { PriceAlertButton } from "@/components/price-alert-button";
import { AddToPortfolioButton } from "@/components/add-to-portfolio-button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useChartData } from "@/hooks/useChartData";
import { useStockQuote } from "@/hooks/useStockQuote";
import type { DashboardData } from "@/lib/types";

const ranges = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "1Y", label: "1Y" },
  { key: "5Y", label: "5Y" }
];

export function PriceSidebar({ data }: { data: DashboardData }) {
  const [range, setRange] = useState("1Y");
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const selected = ranges.find((item) => item.key === range) || ranges[3];

  // Fetch chart data from NSE API
  const { data: chartData, loading: chartLoading } = useChartData(data.symbol, range, data.exchange);

  // Fetch quote data for 52W high/low
  const { data: quoteData } = useStockQuote(data.symbol, data.exchange);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const rangeHistory = useMemo(() => {
    // Use fetched chart data if available, fallback to dashboard data
    if (chartData?.history && chartData.history.length > 0) {
      return chartData.history;
    }

    // Fallback to existing dashboard data
    if (selected.key === "1D") {
      const intraday = data.price.intraday ?? [];
      if (intraday.length > 0) {
        const ordered = [...intraday].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const latestDate = ordered[ordered.length - 1]?.date?.slice(0, 10);
        const sameDay = latestDate ? ordered.filter((row) => row.date.slice(0, 10) === latestDate) : [];
        return sameDay.length ? sameDay : ordered.slice(-30);
      }
      return data.price.history.slice(-30);
    }
    const ordered = [...data.price.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return ordered.slice(-30);
  }, [chartData, data.price.history, data.price.intraday, selected.key]);

  const currentPrice = quoteData?.lastPrice ?? data.price.cmp;

  const { trend, startPrice, endPrice } = useMemo(() => {
    if (rangeHistory.length < 2) {
      return {
        trend: undefined as "up" | "down" | undefined,
        startPrice: currentPrice,
        endPrice: currentPrice
      };
    }
    const startObj = rangeHistory[0];
    const endObj = rangeHistory[rangeHistory.length - 1];
    const latestPrice = endObj?.close ?? currentPrice;
    return {
      trend: (latestPrice >= startObj.close ? "up" : "down") as "up" | "down",
      startPrice: startObj.close,
      endPrice: latestPrice
    };
  }, [rangeHistory, currentPrice]);

  const rangePointChange = startPrice ? endPrice - startPrice : 0;
  const rangePercentChange = startPrice ? (rangePointChange / startPrice) * 100 : 0;
  const weekLow = quoteData?.fiftytwoWeekLow && quoteData.fiftytwoWeekLow > 0 ? quoteData.fiftytwoWeekLow : data.price.fiftyTwoWeekLow;
  const weekHigh = quoteData?.fiftytwoWeekHigh && quoteData.fiftytwoWeekHigh > 0 ? quoteData.fiftytwoWeekHigh : data.price.fiftyTwoWeekHigh;
  const hasWeekRange = weekLow > 0 && weekHigh > weekLow;
  const weekRangeProgress = Math.max(0, Math.min(100, ((currentPrice - weekLow) / (weekHigh - weekLow + 0.0001)) * 100));
  const isOneDay = selected.key === "1D";
  const pointChange = isOneDay
    ? (Number.isFinite(quoteData?.change) ? Number(quoteData?.change) : Number.isFinite(data.price.change) ? data.price.change : rangePointChange)
    : rangePointChange;
  const percentChange = isOneDay
    ? (Number.isFinite(quoteData?.pChange) ? Number(quoteData?.pChange) : Number.isFinite(data.price.changePercent) ? data.price.changePercent : rangePercentChange)
    : rangePercentChange;
  const changeLabel = isOneDay ? "1D" : selected.key;
  const isPositive = pointChange >= 0;

  const sentimentComponent = data.riskScore?.components?.sentiment;
  const bearish = typeof sentimentComponent === "number" ? Math.round((sentimentComponent / 5) * 100) : null;
  const bullish = bearish === null ? null : 100 - bearish;

  const cur = data.price.currency;
  const money = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? formatCurrency(v, cur) : null;
  const bandStr = (lo: number | null | undefined, hi: number | null | undefined) => {
    const l = money(lo);
    const h = money(hi);
    return l && h ? `${l} – ${h}` : null;
  };
  const todayStats = [
    { label: "Open", value: money(quoteData?.open) },
    { label: "Prev Close", value: money(quoteData?.previousClose) },
    { label: "VWAP", value: money(quoteData?.vwap) },
    { label: "Day Range", value: bandStr(quoteData?.intraDayLow, quoteData?.intraDayHigh) },
    { label: "Circuit", value: bandStr(quoteData?.lowerCP, quoteData?.upperCP) },
  ].filter((s) => s.value);

  const rangeSelector = (
    <div className="mt-3 grid grid-cols-5 gap-1 sm:gap-1.5">
      {ranges.map((item) => (
        <button
          key={item.key}
          onClick={() => setRange(item.key)}
          className={`rounded-lg px-2 py-1.5 text-xs font-medium ${range === item.key ? "bg-accent text-white" : "bg-bg text-muted"}`}
        >
          {item.key}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Card className="p-3 sm:p-4 lg:sticky lg:top-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="font-[var(--font-space)] text-xl font-bold leading-tight sm:text-2xl">{data.companyName}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <p>
                {data.symbol} • {data.exchange}
              </p>
              <MarketStatusBadge compact />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap sm:self-start">
            <WatchlistButton symbol={data.symbol} className="h-9 w-9 p-0" />
            <PriceAlertButton symbol={data.symbol} currentPrice={currentPrice} className="h-9 w-9 p-0" />
            <AddToPortfolioButton symbol={data.symbol} companyName={data.companyName} currentPrice={currentPrice} className="h-9 w-9 p-0" />
            <button
              onClick={() => setIsExpanded(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md p-0 text-muted transition-colors hover:bg-accent/20 hover:text-foreground"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-1">
          <p className="min-w-0 text-2xl font-bold leading-none sm:text-3xl">{formatCurrency(currentPrice, data.price.currency)}</p>
          <div className={`min-w-0 sm:text-right ${isPositive ? "text-success" : "text-danger"}`}>
            <p className="text-xl font-semibold leading-none sm:text-2xl">
              {isPositive ? "+" : ""}
              {formatCurrency(pointChange, data.price.currency)}
            </p>
            <p className="mt-1 text-sm font-semibold opacity-90">
              {formatPercent(percentChange)} {changeLabel}
            </p>
          </div>
        </div>

        <div className="mt-4 min-w-0 overflow-hidden">
          <PriceChart data={rangeHistory} trend={trend} height="clamp(220px, 56vw, 260px)" />
        </div>

        {rangeSelector}

        {hasWeekRange ? <div className="mt-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
            <span>52W Low {formatCurrency(weekLow)}</span>
            <span>52W High {formatCurrency(weekHigh)}</span>
          </div>
          <div className="h-2 rounded-full bg-bg">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${weekRangeProgress}%`
              }}
              className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-lime-400"
            />
          </div>
        </div> : null}

        {todayStats.length > 0 ? (
          <div className="mt-4 rounded-xl border border-border/70 p-3">
            <p className="text-sm font-semibold">Today</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              {todayStats.map((stat) => (
                <div key={stat.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">{stat.label}</span>
                  <span className="font-medium tabular-nums">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-border/70 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">News Sentiment</p>
            <p className="text-[10px] text-muted/60 mt-0.5">From recent news</p>
          </div>
          {bullish === null || bearish === null ? (
            <p className="mt-2 text-xs text-muted">Live sentiment data is unavailable right now.</p>
          ) : (
            <>
              <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-bg">
                <div className="bg-success" style={{ width: `${bullish}%` }} />
                <div className="bg-danger" style={{ width: `${bearish}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                <p className="text-success">{bullish}% Positive</p>
                <p className="text-danger">{bearish}% Negative</p>
              </div>
              <p className="mt-1.5 text-[10px] text-muted/50">Derived from news tone · Not a trader poll</p>
            </>
          )}
        </div>
      </Card>
      {mounted
        ? createPortal(
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[120] flex items-center justify-center bg-bg/35 p-4 backdrop-blur-lg"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="relative flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-border/70 bg-panel/68 p-4 shadow-2xl backdrop-blur-2xl sm:h-[80vh] sm:p-6"
                  >
                    <button
                      onClick={() => setIsExpanded(false)}
                      className="absolute right-4 top-4 rounded-md p-2 text-muted transition-colors hover:bg-accent/20 hover:text-foreground"
                    >
                      <X className="h-6 w-6" />
                    </button>

                    <div className="mb-6 space-y-1">
                      <p className="font-[var(--font-space)] text-xl font-bold sm:text-3xl">{data.companyName}</p>
                      <p className="text-muted">
                        {data.symbol} • {data.exchange}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-2xl font-bold sm:text-4xl">{formatCurrency(currentPrice, data.price.currency)}</p>
                      <div className={`flex items-baseline gap-2 text-base font-semibold sm:text-xl ${isPositive ? "text-success" : "text-danger"}`}>
                        <span>{isPositive ? "+" : ""}{formatCurrency(pointChange, data.price.currency)}</span>
                        <span className="text-sm opacity-90 sm:text-base">({formatPercent(percentChange)}) {changeLabel}</span>
                      </div>
                    </div>

                    <div className="mt-8 min-h-0 min-w-0 flex-1 overflow-hidden">
                      <PriceChart data={rangeHistory} trend={trend} height="100%" />
                    </div>

                    <div className="mx-auto mt-6 w-full max-w-md">
                      {rangeSelector}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )
        : null}
    </>
  );
}


