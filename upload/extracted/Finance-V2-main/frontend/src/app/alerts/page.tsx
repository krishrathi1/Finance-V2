"use client";

import { Bell, BellOff, TrendingDown, TrendingUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FeatureAuthWall } from "@/components/sections/feature-auth-wall";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchTickerTape } from "@/lib/api";
import { ALERTS_SYNCED_EVENT, checkAlerts, getAlerts, refreshAlertsFromServer, removeAlert } from "@/lib/alerts";
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

    // Ask the server to evaluate first. It owns trigger state because it's the
    // only side that can record a crossing that happened while this page was
    // closed — and the only side that sends the email. Falls back to local
    // evaluation when signed out or offline.
    const synced = await refreshAlertsFromServer();

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
        // Zero, negative and NaN quotes are dropped here rather than stored:
        // a zero satisfies every "below" target, and NaN silently loses every
        // comparison. Either one turns a data glitch into a wrong verdict.
        const price = Number(t.cmp);
        if (!Number.isFinite(price) || price <= 0) continue;
        priceMap[t.symbol.toUpperCase()] = price;
      }
    } catch {
      // ignore fetch errors — prices stay null
    }
    // Server state is sticky: an alert that fired at 3am stays flagged even
    // though price has since moved back. Local evaluation can only ever report
    // "true right now", which is why it's the fallback rather than the default.
    const triggeredIds = synced
      ? new Set(alerts.filter((a) => a.triggeredAt).map((a) => a.id))
      : new Set(checkAlerts(priceMap).map((t) => t.id));
    const enriched: AlertRow[] = alerts.map((a) => ({
      ...a,
      // Upper-cased to match how priceMap is keyed — and how checkAlerts
      // already looks it up. Reading it raw here meant a lower-cased alert
      // symbol showed no price on screen while still being evaluated against
      // one, so the badge and the number disagreed.
      currentPrice: priceMap[a.symbol.toUpperCase()] ?? null,
      triggered: triggeredIds.has(a.id),
    }));
    // Sort: triggered first
    enriched.sort((x, y) => Number(y.triggered) - Number(x.triggered));
    setRows(enriched);
    setLoading(false);
  }, []);

  // Hydration on sign-in replaces localStorage after this page may already
  // have rendered from an empty local store, so re-read when that lands.
  useEffect(() => {
    const handler = () => void loadAlerts({ keepLoading: false });
    window.addEventListener(ALERTS_SYNCED_EVENT, handler);
    return () => window.removeEventListener(ALERTS_SYNCED_EVENT, handler);
  }, [loadAlerts]);

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

  /** Trigger timestamps come from MySQL as "YYYY-MM-DD HH:MM:SS" (server time,
   *  no zone). Rendering the date and time as-is avoids the Date parser
   *  guessing a timezone and shifting the moment the alert actually fired. */
  const formatTriggerTime = (value: string) => value.replace("T", " ").slice(0, 16);

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
            Track your target prices — saved to your account and emailed to you when a target is hit
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
        points={[
          "Create multiple price alerts",
          "Email when a target is hit",
          "Saved to your account, on every device",
          "Triggered vs watching tags",
        ]}
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
                Open any stock page and tap the bell icon to set a price alert. We&apos;ll watch the
                price for you and email you when a target is hit — even with this page closed.
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
                    className={`glow-card group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border bg-panel/60 px-3 py-3 backdrop-blur-sm transition sm:grid-cols-[auto_1fr_auto_auto_auto_auto] sm:gap-4 sm:px-4 ${
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

                    {/* Symbol + note. min-w-0 lets the note truncate against the
                        real column width instead of a fixed pixel cap. */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/stocks/${row.symbol}`}
                          className="text-sm font-semibold transition hover:text-accent"
                        >
                          {row.symbol}
                        </Link>
                        <span className={`${conditionColor} text-[10px] font-semibold uppercase`}>
                          {row.condition === "above" ? "↑ Above" : "↓ Below"}
                        </span>
                        {/* Status is desktop-only in its own column, so surface it
                            here on phones — otherwise the only cue that an alert
                            fired is a faint border tint, and the legend above
                            promises a Triggered/Watching distinction. */}
                        {row.triggered ? (
                          <span className="flex items-center gap-0.5 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success sm:hidden">
                            {row.condition === "above" ? (
                              <TrendingUp className="h-2.5 w-2.5" />
                            ) : (
                              <TrendingDown className="h-2.5 w-2.5" />
                            )}
                            Triggered
                          </span>
                        ) : row.armed === false ? (
                          <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 sm:hidden">
                            Waiting to arm
                          </span>
                        ) : diffPercent !== null ? (
                          <span className="text-[10px] text-muted sm:hidden">
                            {(((row.currentPrice ?? row.targetPrice) - row.targetPrice) / row.targetPrice * 100).toFixed(1)}% away
                          </span>
                        ) : null}
                      </div>
                      {row.note && (
                        <p className="mt-0.5 truncate text-[11px] text-muted">{row.note}</p>
                      )}
                      {row.triggered && row.triggeredPrice ? (
                        <p className="mt-0.5 text-[10px] text-success/80">
                          Hit {formatPrice(row.triggeredPrice)}
                          {row.triggeredAt ? ` on ${formatTriggerTime(row.triggeredAt)}` : ""}
                        </p>
                      ) : row.armed === false ? (
                        <p className="mt-0.5 text-[10px] text-muted/80">
                          Price is already past this target — arms once it moves back
                        </p>
                      ) : null}
                    </div>

                    {/* Mobile: target + remove */}
                    <div className="flex shrink-0 items-center gap-1 sm:hidden">
                      <div className="text-right leading-tight">
                        <p className="text-xs font-semibold tabular-nums">{formatPrice(row.targetPrice)}</p>
                        {row.currentPrice !== null && (
                          <p className={`text-[10px] tabular-nums ${row.triggered ? "text-success" : "text-muted"}`}>
                            {formatPrice(row.currentPrice)}
                          </p>
                        )}
                      </div>
                      {/* 44x44 hit area (the icon stays small) — the previous
                          p-1.5 wrapper was ~26px, below the minimum comfortable
                          touch target and easy to miss on a destructive action. */}
                      <button
                        onClick={() => handleRemove(row.id)}
                        aria-label={`Remove alert for ${row.symbol}`}
                        className="-mr-1.5 flex h-11 w-11 items-center justify-center rounded-lg text-muted transition active:bg-danger/15 active:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
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
                      ) : row.armed === false ? (
                        <span className="rounded-lg bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-500">
                          Waiting
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
