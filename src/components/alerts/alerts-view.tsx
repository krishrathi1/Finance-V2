"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Bell, BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { fmtInr, timeAgo, type PriceAlert } from "@/lib/types";
import { useApp, usePolling } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockSearch } from "@/components/shared/stock-search";
import { SectionHeading } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";

export function AlertsView() {
  const alerts = useApp((s) => s.alerts);
  const addAlert = useApp((s) => s.addAlert);
  const removeAlert = useApp((s) => s.removeAlert);
  const refreshAlerts = useApp((s) => s.refreshAlerts);
  const openStock = useApp((s) => s.openStock);

  usePolling(() => {
    void refreshAlerts();
  }, 20000);

  // ── create form state ──
  const [symbol, setSymbol] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [targetPrice, setTargetPrice] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const armedCount = alerts.filter((a) => a.armed).length;

  const createAlert = async () => {
    const price = Number(targetPrice);
    if (!symbol) {
      toast.error("Pick a stock first");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Enter a target price greater than ₹0");
      return;
    }
    setCreating(true);
    try {
      await addAlert({
        symbol,
        condition,
        targetPrice: price,
        note: note.trim() || undefined,
      });
      toast.success(
        `Alert set — ${symbol} ${condition === "above" ? "rises above" : "falls below"} ₹${price.toLocaleString("en-IN")}`
      );
      setSymbol("");
      setTargetPrice("");
      setNote("");
    } catch {
      toast.error("Could not create the alert — please try again");
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (a: PriceAlert) => {
    await removeAlert(a.id);
    toast.success(`Removed ${a.symbol} alert`);
  };

  return (
    <section aria-label="Price alerts" className="space-y-4">
      <SectionHeading
        icon={Bell}
        kicker="Monitoring"
        title="Price Alerts"
        right={
          <span className="rounded-full border border-border/50 bg-panel/70 px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {armedCount} armed
          </span>
        }
      />

      {/* ── create card ── */}
      <div className="rounded-2xl border border-border/50 bg-panel/60 p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_120px_140px_1fr_auto]">
          <div className="grid gap-1.5">
            <Label className="text-xs">Stock</Label>
            {symbol ? (
              <button
                onClick={() => setSymbol("")}
                className="flex h-11 items-center justify-between rounded-2xl border border-brand/40 bg-brand/10 px-4 text-sm font-semibold text-brand transition hover:bg-brand/15"
                aria-label={`Selected ${symbol}, click to change`}
              >
                {symbol}
                <Plus className="h-3.5 w-3.5 rotate-45" aria-hidden />
              </button>
            ) : (
              <StockSearch placeholder="Stock — e.g. TCS" onSelect={(s) => setSymbol(s.toUpperCase())} />
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="alert-condition" className="text-xs">
              Condition
            </Label>
            <Select value={condition} onValueChange={(v) => setCondition(v === "below" ? "below" : "above")}>
              <SelectTrigger id="alert-condition" className="w-full" aria-label="Alert condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="above">Rises above</SelectItem>
                <SelectItem value="below">Falls below</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="alert-target" className="text-xs">
              Target price (₹)
            </Label>
            <Input
              id="alert-target"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="2500"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="alert-note" className="text-xs">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="alert-note"
              placeholder="Why this level matters…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button
            onClick={() => void createAlert()}
            disabled={creating}
            className="h-10 bg-brand text-white hover:bg-brand/90"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
            Create
          </Button>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
          Alerts are evaluated server-side on every refresh — they fire even if you&apos;re not watching.
        </p>
      </div>

      {/* ── alert list ── */}
      {alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-bold text-text">No alerts yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Create one above and we&apos;ll watch the price server-side.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Price alerts">
          {alerts.map((a, i) => {
            const triggered = a.triggeredAt != null;
            const current = a.currentPrice;
            const distPct =
              current != null && current > 0 ? ((a.targetPrice - current) / current) * 100 : null;
            return (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
                  triggered ? "border-danger/40 bg-danger/5" : "border-border/50 bg-panel/60"
                )}
              >
                {/* bell tile */}
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    triggered ? "bg-danger/12 text-danger" : "bg-brand/12 text-brand"
                  )}
                  aria-hidden
                >
                  <Bell className="h-4 w-4" />
                </div>

                {/* identity */}
                <div className="min-w-0 sm:w-44">
                  <button
                    onClick={() => openStock(a.symbol)}
                    className="font-display text-base font-bold text-text transition hover:text-brand"
                  >
                    {a.symbol}
                  </button>
                  <p className="truncate text-xs text-muted-foreground" title={a.name}>
                    {a.name}
                  </p>
                  {a.note && (
                    <p className="truncate text-xs italic text-muted-foreground/80" title={a.note}>
                      “{a.note}”
                    </p>
                  )}
                </div>

                {/* condition chip */}
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                    a.condition === "above" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}
                >
                  {a.condition === "above" ? (
                    <ArrowUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3 w-3" aria-hidden />
                  )}
                  {a.condition === "above" ? "Above" : "Below"} {fmtInr(a.targetPrice)}
                </span>

                {/* current price + distance */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-text">Now {fmtInr(current)}</span>
                  {!triggered && distPct != null && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {Math.abs(distPct).toFixed(1)}% away
                    </span>
                  )}
                  <ChangePill size="xs" value={a.currentChangePercent} />
                </div>

                {/* status */}
                <div className="flex flex-1 items-center sm:justify-end">
                  {triggered ? (
                    <span className="text-xs font-semibold tabular-nums text-danger">
                      Triggered {timeAgo(a.triggeredAt as string)} @ {fmtInr(a.triggeredPrice)}
                    </span>
                  ) : a.armed ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                      <span className="pulse-dot h-2 w-2 rounded-full bg-success" aria-hidden />
                      Armed — watching
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Waiting to arm</span>
                  )}
                </div>

                {/* remove */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger"
                  onClick={() => void handleRemove(a)}
                  aria-label={`Remove ${a.symbol} alert`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
