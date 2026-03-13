"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PriceChart } from "@/components/charts/price-chart";
import { MarketStatusBadge } from "@/components/market-status-badge";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

const ranges = [
  { key: "1D", days: 1 },
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "1Y", days: 365 },
  { key: "5Y", days: 1825 }
];

export function PriceSidebar({ data }: { data: DashboardData }) {
  const [range, setRange] = useState("1Y");
  const [isExpanded, setIsExpanded] = useState(false);
  const selected = ranges.find((item) => item.key === range) || ranges[3];

  const rangeHistory = useMemo(() => {
    if (selected.days === 1) {
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
    return ordered.slice(-Math.min(selected.days, ordered.length));
  }, [data.price.history, data.price.intraday, selected.days]);

  const { trend, startPrice, endPrice } = useMemo(() => {
    if (rangeHistory.length < 2) {
      return {
        trend: undefined as "up" | "down" | undefined,
        startPrice: data.price.cmp,
        endPrice: data.price.cmp
      };
    }
    const startObj = rangeHistory[0];
    const endObj = rangeHistory[rangeHistory.length - 1];
    const latestPrice = endObj?.close ?? data.price.cmp;
    return {
      trend: (latestPrice >= startObj.close ? "up" : "down") as "up" | "down",
      startPrice: startObj.close,
      endPrice: latestPrice
    };
  }, [rangeHistory, data.price.cmp]);

  const rangePointChange = startPrice ? endPrice - startPrice : 0;
  const rangePercentChange = startPrice ? (rangePointChange / startPrice) * 100 : 0;
  const isOneDay = selected.key === "1D";
  const pointChange = isOneDay
    ? (Number.isFinite(data.price.change) ? data.price.change : rangePointChange)
    : rangePointChange;
  const percentChange = isOneDay
    ? (Number.isFinite(data.price.changePercent) ? data.price.changePercent : rangePercentChange)
    : rangePercentChange;
  const changeLabel = isOneDay ? "1D" : selected.key;
  const isPositive = pointChange >= 0;

  const sentimentComponent = data.riskScore?.components?.sentiment;
  const bearish = typeof sentimentComponent === "number" ? Math.round((sentimentComponent / 5) * 100) : null;
  const bullish = bearish === null ? null : 100 - bearish;

  const rangeSelector = (
    <div className="mt-3 grid grid-cols-5 gap-1">
      {ranges.map((item) => (
        <button
          key={item.key}
          onClick={() => setRange(item.key)}
          className={`rounded-lg px-2 py-1 text-xs ${range === item.key ? "bg-accent text-white" : "bg-bg text-muted"}`}
        >
          {item.key}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Card className="sticky top-24 p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="font-[var(--font-space)] text-2xl font-bold">{data.companyName}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <p>
                {data.symbol} • {data.exchange}
              </p>
              <MarketStatusBadge compact />
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="rounded-md p-2 text-muted transition-colors hover:bg-accent/20 hover:text-foreground"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
          <p className="min-w-0 text-3xl font-bold leading-none">{formatCurrency(data.price.cmp, data.price.currency)}</p>
          <div className={`min-w-0 text-right ${isPositive ? "text-success" : "text-danger"}`}>
            <p className="text-2xl font-semibold leading-none">
              {isPositive ? "+" : ""}
              {formatCurrency(pointChange, data.price.currency)}
            </p>
            <p className="mt-1 text-sm font-semibold opacity-90">
              {formatPercent(percentChange)} {changeLabel}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <PriceChart data={rangeHistory} trend={trend} />
        </div>

        {rangeSelector}

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>52W Low {formatCurrency(data.price.fiftyTwoWeekLow)}</span>
            <span>52W High {formatCurrency(data.price.fiftyTwoWeekHigh)}</span>
          </div>
          <div className="h-2 rounded-full bg-bg">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${((data.price.cmp - data.price.fiftyTwoWeekLow) / (data.price.fiftyTwoWeekHigh - data.price.fiftyTwoWeekLow + 0.0001)) * 100}%`
              }}
              className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-lime-400"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 p-3">
          <p className="text-sm font-semibold">Investor Sentiment</p>
          {bullish === null || bearish === null ? (
            <p className="mt-2 text-xs text-muted">Live sentiment data is unavailable right now.</p>
          ) : (
            <>
              <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-bg">
                <div className="bg-success" style={{ width: `${bullish}%` }} />
                <div className="bg-danger" style={{ width: `${bearish}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <p className="text-success">{bullish}% Bullish</p>
                <p className="text-danger">{bearish}% Bearish</p>
              </div>
            </>
          )}
        </div>
      </Card>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative flex h-[80vh] w-full max-w-6xl flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl"
            >
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute right-4 top-4 rounded-md p-2 text-muted transition-colors hover:bg-accent/20 hover:text-foreground"
              >
                <X className="h-6 w-6" />
              </button>

              <div className="mb-6 space-y-1">
                <p className="font-[var(--font-space)] text-3xl font-bold">{data.companyName}</p>
                <p className="text-muted">
                  {data.symbol} • {data.exchange}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <p className="text-4xl font-bold">{formatCurrency(data.price.cmp, data.price.currency)}</p>
                <div className={`flex items-baseline gap-2 text-xl font-semibold ${isPositive ? "text-success" : "text-danger"}`}>
                  <span>{isPositive ? "+" : ""}{formatCurrency(pointChange, data.price.currency)}</span>
                  <span className="text-base opacity-90">({formatPercent(percentChange)}) {changeLabel}</span>
                </div>
              </div>

              <div className="mt-8 flex-1 min-h-0">
                <PriceChart data={rangeHistory} trend={trend} height="50vh" />
              </div>

              <div className="mt-6 mx-auto w-full max-w-md">
                {rangeSelector}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


