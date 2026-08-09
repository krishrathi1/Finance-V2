"use client";

import { Bell, X, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { addAlert, getAlertsForSymbol, removeAlert } from "@/lib/alerts";
import { cn } from "@/shared/utils";

type Props = {
  symbol: string;
  currentPrice: number;
  className?: string;
};

export function PriceAlertButton({ symbol, currentPrice, className }: Props) {
  const [hasAlert, setHasAlert] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const alerts = getAlertsForSymbol(symbol);
    setHasAlert(alerts.length > 0);
  }, [symbol, open]);

  const handleOpen = useCallback(() => {
    setTargetPrice(currentPrice > 0 ? String(Math.round(currentPrice)) : "");
    setCondition("above");
    setNote("");
    setSaved(false);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [currentPrice]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSave = useCallback(() => {
    const price = parseFloat(targetPrice);
    if (!price || price <= 0) return;
    // Pass the observed price so the server can decide whether this alert
    // starts armed. The target input is pre-filled with the current price, so
    // without this a user who doesn't edit it gets an instant "triggered"
    // email for a threshold they never actually crossed.
    addAlert(symbol, price, condition, note, currentPrice > 0 ? currentPrice : undefined);
    setHasAlert(true);
    setSaved(true);
    setTimeout(() => setOpen(false), 900);
  }, [symbol, targetPrice, condition, note, currentPrice]);

  const handleRemoveAll = useCallback(() => {
    const alerts = getAlertsForSymbol(symbol);
    alerts.forEach((a) => removeAlert(a.id));
    setHasAlert(false);
    setOpen(false);
  }, [symbol]);

  const modal = open && mounted
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/60 p-4 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-border/70 bg-panel/90 p-5 shadow-2xl backdrop-blur-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-accent" />
                <p className="text-sm font-semibold">Set Price Alert</p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1 text-muted transition hover:bg-accent/10 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Symbol + current price */}
            <div className="mb-4 rounded-xl border border-border/50 bg-bg/50 px-3 py-2 flex items-center justify-between">
              <span className="text-sm font-bold text-accent">{symbol}</span>
              <span className="text-sm font-medium text-muted">
                Current: ₹{currentPrice > 0 ? currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"}
              </span>
            </div>

            {/* Condition */}
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Alert me when price is</p>
              <div className="grid grid-cols-2 gap-2">
                {(["above", "below"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCondition(c)}
                    className={cn(
                      "rounded-xl border py-2 text-xs font-semibold transition",
                      condition === c
                        ? c === "above"
                          ? "border-success/50 bg-success/10 text-success"
                          : "border-danger/50 bg-danger/10 text-danger"
                        : "border-border/50 bg-panel/40 text-muted hover:border-accent/30 hover:text-text"
                    )}
                  >
                    {c === "above" ? "Above ↑" : "Below ↓"}
                  </button>
                ))}
              </div>
            </div>

            {/* Target price */}
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Target price (₹)</p>
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="e.g. 1500"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>

            {/* Note (optional) */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-medium text-muted">Note (optional)</p>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Breakout target"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!targetPrice || Number(targetPrice) <= 0}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition",
                  saved
                    ? "bg-success/20 text-success"
                    : "bg-accent/90 text-white hover:bg-accent disabled:opacity-40"
                )}
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Set Alert
                  </>
                )}
              </button>
              {hasAlert && (
                <button
                  onClick={handleRemoveAll}
                  className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20"
                >
                  Remove All
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        onClick={handleOpen}
        title={hasAlert ? `Active alert for ${symbol}` : `Set price alert for ${symbol}`}
        className={cn(
          "group inline-flex items-center justify-center rounded-lg border p-1.5 transition-all duration-200",
          hasAlert
            ? "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
            : "border-border/60 bg-panel/60 text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent",
          className
        )}
      >
        <Bell
          className={cn(
            "h-4 w-4 transition-transform duration-200 group-hover:scale-110",
            hasAlert && "fill-current"
          )}
        />
      </button>
      {modal}
    </>
  );
}
