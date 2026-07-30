"use client";

import { Check, Plus, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { addHolding, hasHolding } from "@/lib/portfolio";
import { cn } from "@/shared/utils";
import { todayIstDateKey as today } from "@/shared/market-status";

type Props = {
  symbol: string;
  companyName?: string;
  currentPrice?: number;
  className?: string;
};

export function AddToPortfolioButton({ symbol, companyName = "", currentPrice = 0, className }: Props) {
  const [inPortfolio, setInPortfolio] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [buyPrice, setBuyPrice] = useState(() =>
    currentPrice > 0 ? String(Math.round(currentPrice * 100) / 100) : ""
  );
  const [buyDate, setBuyDate] = useState(today());
  const [saved, setSaved] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setInPortfolio(hasHolding(symbol)); }, [symbol, open]);

  const handleSave = useCallback(() => {
    const qty = parseFloat(quantity);
    const price = parseFloat(buyPrice);
    if (!qty || qty <= 0 || !price || price <= 0) return;
    addHolding(symbol, companyName || symbol, qty, price, buyDate);
    setInPortfolio(true);
    setSaved(true);
    setTimeout(() => setOpen(false), 900);
  }, [symbol, companyName, quantity, buyPrice, buyDate]);

  const handleOpen = useCallback(() => {
    setBuyPrice(currentPrice > 0 ? String(Math.round(currentPrice * 100) / 100) : "");
    setQuantity("1");
    setBuyDate(today());
    setSaved(false);
    setOpen(true);
    setTimeout(() => qtyRef.current?.focus(), 50);
  }, [currentPrice]);

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/60 p-4 backdrop-blur-md"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <div className="relative w-full max-w-xs rounded-2xl border border-border/70 bg-panel/95 p-5 shadow-2xl backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-accent" />
                  <p className="text-sm font-semibold">Add to Portfolio</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted hover:text-text"
                >
                  ✕
                </button>
              </div>

              <div className="mb-3 rounded-xl border border-border/50 bg-bg/50 px-3 py-2 flex justify-between items-center">
                <span className="text-sm font-bold text-accent">{symbol}</span>
                {currentPrice > 0 && (
                  <span className="text-xs text-muted">
                    CMP ₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Quantity</p>
                  <input
                    ref={qtyRef}
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Buy Price (₹)</p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Buy Date</p>
                  <input
                    type="date"
                    value={buyDate}
                    onChange={(e) => setBuyDate(e.target.value)}
                    max={today()}
                    className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={!quantity || !buyPrice || Number(quantity) <= 0 || Number(buyPrice) <= 0}
                  className={cn(
                    "flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition",
                    saved
                      ? "bg-success/20 text-success"
                      : "bg-accent/90 text-white hover:bg-accent disabled:opacity-40"
                  )}
                >
                  {saved ? (
                    <><Check className="h-4 w-4" /> Added!</>
                  ) : (
                    <><Plus className="h-4 w-4" /> Add to Portfolio</>
                  )}
                </button>
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
        title={inPortfolio ? `${symbol} in portfolio` : `Add ${symbol} to portfolio`}
        className={cn(
          "group inline-flex items-center justify-center rounded-lg border p-1.5 transition-all duration-200",
          inPortfolio
            ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
            : "border-border/60 bg-panel/60 text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent",
          className
        )}
      >
        <Wallet
          className={cn("h-4 w-4 transition-transform duration-200 group-hover:scale-110")}
        />
      </button>
      {modal}
    </>
  );
}
