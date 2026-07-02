"use client";

import { Bell, BellOff, TrendingDown, TrendingUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { FeatureAuthWall } from "@/components/sections/feature-auth-wall";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchTickerTape } from "@/lib/api";
import { checkAlerts, getAlerts, removeAlert } from "@/lib/alerts";
import type { PriceAlert } from "@/lib/alerts";

type AlertRow = PriceAlert & {
  currentPrice: number | null;
  triggered: boolean;
};

export default function AlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async (options: { force?: boolean; keepLoading?: boolean } = {}) => {
    const { force = false, keepLoading = true } = options;
    const alerts = getAlerts();
    if (alerts.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (keepLoading) {
      setLoading(true);
    }
    const symbols = [...new Set(alerts.map((a) => a.symbol))];
    let priceMap: Record<string, number> = {};
    try {
      const tickers = await fetchTickerTape(symbols, { force });
      for (const t of tickers) {
        priceMap[t.symbol.toUpperCase()] = t.cmp;
      }
    } catch {
      // ignore fetch errors — prices stay null
    }
    const triggered = checkAlerts(priceMap);
    const triggeredIds = new Set(triggered.map((t) => t.id));
    const enriched: AlertRow[] = alerts.map((a) => ({
      ...a,
      currentPrice: priceMap[a.symbol] ?? null,
      triggered: triggeredIds.has(a.id),
    }));
    // Sort: triggered first
    enriched.sort((x, y) => Number(y.triggered) - Number(x.triggered));
    setRows(enriched);
    setLoading(false);
  }, []);

  useVisibilityPolling((initial) => {
    if (initial) {
      void loadAlerts();
      return;
    }
    if (rows.length === 0) return;
    void loadAlerts({ force: true, keepLoading: false });
  }, 20_000);

  const handleRemove = useCallback(
    (id: string) => {
      removeAlert(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    },
    []
  );

  const formatPrice = (p: number | null) =>
    p !== null
      ? `₹${p.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "---";

  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">Home</Link> / Alerts
          </p>
          <h1 className="mt-1 font-[var(--font-space)] text-2xl font-bold sm:text-3xl">
            <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
              Price Alerts
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Track your target prices — alerts are stored locally in your browser
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1 rounded-xl border border-success/30 bg-success/10 px-2 py-1 text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Triggered
          </span>
          <span className="flex items-center gap-1 rounded-xl border border-border/50 bg-panel/60 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            Watching
          </span>
        </div>
      </div>

      <FeatureAuthWall
        title="Sign up to use Alerts"
        description="Create and track custom price alerts for your stocks with live trigger status."
        ctaLabel="Sign up to use alerts"
        points={["Create multiple price alerts", "Auto refresh status", "Triggered vs watching tags", "Quick jump to stock pages"]}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-accent" />
              Active Alerts
              <span className="ml-auto text-xs font-normal text-muted">
                {rows.length} alert{rows.length !== 1 ? "s" : ""}
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent>
            {/* Loading */}
            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="shimmer h-16 rounded-xl border border-border/40" />
                ))}
              </div>
            )}

          {/* Empty state */}
          {!loading && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <BellOff className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-lg font-semibold">No active alerts</h3>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Open any stock page and tap the bell icon to set a price alert. You can track
                multiple alerts across different symbols here.
              </p>
              <Link
                href="/"
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <TrendingUp className="h-4 w-4" />
                Browse Stocks
              </Link>
            </div>
          )}

          {/* Alert rows */}
          {!loading && rows.length > 0 && (
            <div className="space-y-2">
              {/* Header row */}
              <div className="hidden grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
                <span className="w-8" />
                <span>Symbol / Note</span>
                <span className="w-28 text-right">Target</span>
                <span className="w-28 text-right">Current</span>
                <span className="w-24 text-right">Status</span>
                <span className="w-8" />
              </div>

              {rows.map((row) => {
                const conditionColor = row.condition === "above" ? "text-success" : "text-danger";
                const priceDiff =
                  row.currentPrice !== null
                    ? row.currentPrice - row.targetPrice
                    : null;
                const diffPercent =
                  priceDiff !== null ? (priceDiff / row.targetPrice) * 100 : null;

                return (
                  <div
                    key={row.id}
                    className={`glow-card group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-xl border bg-panel/60 px-4 py-3 backdrop-blur-sm transition sm:grid-cols-[auto_1fr_auto_auto_auto_auto] sm:gap-4 ${
                      row.triggered
                        ? "border-success/30 bg-success/5"
                        : "border-border/50"
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        row.triggered ? "bg-success/15" : "bg-accent/10"
                      }`}
                    >
                      <Bell
                        className={`h-4 w-4 ${row.triggered ? "text-success fill-current" : "text-accent"}`}
                      />
                    </div>

                    {/* Symbol + note */}
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/stocks/${row.symbol}`}
                          className="text-sm font-semibold transition hover:text-accent"
                        >
                          {row.symbol}
                        </Link>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${conditionColor} bg-current/10`}
                          style={{ backgroundColor: undefined }}
                        >
                          <span className={`${conditionColor} text-[10px] font-semibold`}>
                            {row.condition === "above" ? "↑ Above" : "↓ Below"}
                          </span>
                        </span>
                      </div>
                      {row.note && (
                        <p className="mt-0.5 text-[11px] text-muted truncate max-w-[180px]">
                          {row.note}
                        </p>
                      )}
                    </div>

                    {/* Mobile: target + remove */}
                    <div className="flex items-center gap-2 sm:hidden">
                      <div className="text-right">
                        <p className="text-xs font-semibold">{formatPrice(row.targetPrice)}</p>
                        {row.currentPrice !== null && (
                          <p className={`text-[10px] ${row.triggered ? "text-success" : "text-muted"}`}>
                            {formatPrice(row.currentPrice)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemove(row.id)}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-danger/15 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Desktop: target */}
                    <span className="hidden w-28 text-right text-sm font-medium sm:block">
                      {formatPrice(row.targetPrice)}
                    </span>

                    {/* Desktop: current price */}
                    <span className="hidden w-28 text-right text-sm font-medium sm:block">
                      {formatPrice(row.currentPrice)}
                    </span>

                    {/* Desktop: status badge */}
                    <span className="hidden w-24 sm:flex sm:justify-end">
                      {row.triggered ? (
                        <span className="flex items-center gap-0.5 rounded-lg bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                          {row.condition === "above" ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          Triggered
                        </span>
                      ) : diffPercent !== null ? (
                        <span className="text-xs text-muted">
                          {row.condition === "above" ? "+" : ""}
                          {((row.targetPrice - (row.currentPrice ?? row.targetPrice)) / row.targetPrice * -100).toFixed(1)}% away
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Watching</span>
                      )}
                    </span>

                    {/* Desktop: remove */}
                    <span className="hidden w-8 sm:flex sm:justify-end">
                      <button
                        onClick={() => handleRemove(row.id)}
                        className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          </CardContent>
        </Card>
      </FeatureAuthWall>
    </div>
  );
}
