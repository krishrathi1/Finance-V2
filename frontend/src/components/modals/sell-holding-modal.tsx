"use client";

import { ArrowDownRight, Check, TrendingDown, TrendingUp, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { closeHoldingUnits } from "@/lib/portfolio";
import type { HoldingWithValue } from "@/lib/portfolio";
import { recordTransaction } from "@/lib/transactions";
import { todayIstDateKey as today } from "@/shared/market-status";

type Props = {
  holding: HoldingWithValue;
  onClose: () => void;
  onSold: () => void;
};

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Records a sale against an open holding.
 *
 * Shows the realised outcome *before* the user commits, computed against this
 * holding's own cost — the estimate is deliberately labelled as such, because
 * the figure that finally lands in realised P&L comes from FIFO matching
 * across every lot of the symbol, which can differ when the same stock was
 * bought more than once.
 */
export function SellHoldingModal({ holding, onClose, onSold }: Props) {
  const [quantity, setQuantity] = useState(String(holding.quantity));
  const [price, setPrice] = useState(
    holding.currentPrice ? String(Math.round(holding.currentPrice * 100) / 100) : ""
  );
  const [tradedOn, setTradedOn] = useState(today());
  const [fees, setFees] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const parsedQuantity = parseFloat(quantity);
  const parsedPrice = parseFloat(price);
  const parsedFees = fees.trim() ? parseFloat(fees) : 0;

  const preview = useMemo(() => {
    if (!Number.isFinite(parsedQuantity) || !Number.isFinite(parsedPrice)) return null;
    if (parsedQuantity <= 0 || parsedPrice <= 0) return null;
    const feeAmount = Number.isFinite(parsedFees) && parsedFees > 0 ? parsedFees : 0;
    const proceeds = parsedQuantity * parsedPrice - feeAmount;
    const cost = parsedQuantity * holding.buyPrice;
    const pnl = proceeds - cost;
    return {
      proceeds,
      cost,
      pnl,
      pnlPercent: cost > 0 ? (pnl / cost) * 100 : 0,
      isFullExit: parsedQuantity >= holding.quantity - 1e-9,
    };
  }, [parsedQuantity, parsedPrice, parsedFees, holding.buyPrice, holding.quantity]);

  const handleSell = useCallback(() => {
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return setError("Enter a valid quantity");
    }
    // Guarding here as well as in the input's max: selling more than you hold
    // would create an unmatched sale that quietly misstates realised P&L.
    if (parsedQuantity > holding.quantity + 1e-9) {
      return setError(`You only hold ${holding.quantity.toLocaleString("en-IN")} units`);
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return setError("Enter a valid sell price");
    }
    if (fees.trim() && (!Number.isFinite(parsedFees) || parsedFees < 0)) {
      return setError("Enter valid charges, or leave blank");
    }
    setError("");

    recordTransaction({
      symbol: holding.symbol,
      companyName: holding.companyName,
      side: "sell",
      quantity: parsedQuantity,
      price: parsedPrice,
      fees: Number.isFinite(parsedFees) ? parsedFees : 0,
      tradedOn,
      notes: notes.trim() || undefined,
    });
    closeHoldingUnits(holding.id, parsedQuantity);

    setSaved(true);
    setTimeout(() => {
      onSold();
      onClose();
    }, 700);
  }, [
    parsedQuantity,
    parsedPrice,
    parsedFees,
    fees,
    tradedOn,
    notes,
    holding.id,
    holding.symbol,
    holding.companyName,
    holding.quantity,
    onSold,
    onClose,
  ]);

  const isGain = (preview?.pnl ?? 0) >= 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Sell ${holding.symbol}`}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border/70 bg-panel/95 p-5 shadow-2xl backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-danger" />
            <p className="text-sm font-semibold">Sell Holding</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition hover:bg-accent/10 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Position summary */}
        <div className="mb-4 rounded-xl border border-border/50 bg-bg/50 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-accent">{holding.symbol}</span>
            <span className="text-xs text-muted">
              Holding {holding.quantity.toLocaleString("en-IN")} @ ₹{fmt(holding.buyPrice)}
            </span>
          </div>
          {holding.currentPrice !== null && (
            <p className="mt-1 text-[11px] text-muted">
              Live price ₹{fmt(holding.currentPrice)}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sell-qty" className="mb-1 block text-xs font-medium text-muted">
                Quantity *
              </label>
              <div className="relative">
                <input
                  id="sell-qty"
                  type="number"
                  min="0"
                  max={holding.quantity}
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(String(holding.quantity))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent transition hover:bg-accent/20"
                >
                  MAX
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="sell-price" className="mb-1 block text-xs font-medium text-muted">
                Sell Price (₹) *
              </label>
              <input
                id="sell-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 2800"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sell-date" className="mb-1 block text-xs font-medium text-muted">
                Sell Date *
              </label>
              <input
                id="sell-date"
                type="date"
                value={tradedOn}
                onChange={(e) => setTradedOn(e.target.value)}
                max={today()}
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <label htmlFor="sell-fees" className="mb-1 block text-xs font-medium text-muted">
                Charges (₹)
              </label>
              <input
                id="sell-fees"
                type="number"
                min="0"
                step="0.01"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="brokerage + STT"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sell-notes" className="mb-1 block text-xs font-medium text-muted">
              Notes (optional)
            </label>
            <input
              id="sell-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Booked partial profit"
              className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {/* Realised preview */}
          {preview && (
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                isGain ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  {isGain ? (
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-danger" />
                  )}
                  Estimated realised P&amp;L
                </span>
                <span
                  className={`text-sm font-bold tabular-nums ${isGain ? "text-success" : "text-danger"}`}
                >
                  {isGain ? "+" : ""}₹{fmt(preview.pnl)}
                  <span className="ml-1 text-xs font-semibold">
                    ({isGain ? "+" : ""}
                    {preview.pnlPercent.toFixed(2)}%)
                  </span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                <span>Net proceeds ₹{fmt(preview.proceeds)}</span>
                <span>{preview.isFullExit ? "Closes position" : "Partial exit"}</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-muted/70">
                Estimate against this holding&apos;s cost. Your booked figure is matched
                first-in-first-out across every lot of {holding.symbol}.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={handleSell}
            disabled={saved}
            className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 ${
              saved ? "bg-success" : "bg-gradient-to-r from-danger to-rose-500"
            }`}
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" /> Sale recorded
              </>
            ) : (
              <>
                <ArrowDownRight className="h-4 w-4" /> Record Sale
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
