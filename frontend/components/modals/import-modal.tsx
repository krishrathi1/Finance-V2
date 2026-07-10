"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Plus } from "lucide-react";
import { parsePortfolioDocument } from "@/lib/api";
import { addHolding } from "@/lib/portfolio";
import { todayIstDateKey as today } from "@/lib/market-status";

/** A valid extracted quantity/price must be a finite, positive number. */
function parsePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ImportModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extracted, setExtracted] = useState<any[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleUpload = async () => {
    if (!file) return setError("Please select a file first");
    setLoading(true);
    setError("");
    try {
      const res = await parsePortfolioDocument(file);
      if (!res.holdings || res.holdings.length === 0) {
        setError("No stocks found in this document. Please try a clearer document.");
      } else {
        setExtracted(res.holdings);
      }
    } catch (err: any) {
      setError(err.message || "Failed to parse document");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    // Rows where the AI failed to extract a usable quantity/price are
    // skipped rather than defaulted to fabricated values (1 share, ₹0) —
    // those looked like real positions but silently corrupted portfolio
    // P&L. The review list below flags these before the user confirms.
    extracted.forEach((h) => {
      const quantity = parsePositive(h.quantity);
      const buyPrice = parsePositive(h.buyPrice);
      if (h.symbol && quantity !== null && buyPrice !== null) {
        addHolding(h.symbol.toUpperCase(), h.companyName || h.symbol, quantity, buyPrice, h.buyDate || today());
      }
    });
    onSave();
    onClose();
  };

  const validCount = extracted.filter((h) => h.symbol && parsePositive(h.quantity) !== null && parsePositive(h.buyPrice) !== null).length;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-xl rounded-2xl border border-border/70 bg-panel/95 p-6 shadow-2xl backdrop-blur-2xl text-text">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <p className="text-base font-semibold">Bulk Import AI</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-accent/10 hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        {extracted.length === 0 ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm font-medium">Upload Portfolio List</p>
              <p className="text-xs text-muted leading-relaxed">
                Upload a PDF, Word, or TXT file of your holdings. Our AI will automatically extract symbols, dates, and prices for you.
              </p>
            </div>
            <div className="relative rounded-2xl border-2 border-dashed border-border/50 bg-bg/30 p-12 transition-colors hover:border-accent/40">
              <input type="file" onChange={handleFileChange} className="absolute inset-0 cursor-pointer opacity-0" id="file-upload" accept=".pdf,.docx,.txt" />
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                  <Plus className="h-6 w-6 text-accent" />
                </div>
                <p className="text-sm font-semibold">{file ? file.name : "Choose a file or drop it here"}</p>
                <p className="mt-1 text-[11px] text-muted">Supports PDF, DOCX, and TXT</p>
              </div>
            </div>
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent to-amber-500 py-3 text-sm font-bold text-white transition hover:shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>{loading ? "AI is analyzing document..." : "Extract Holdings"}</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm font-medium">Review {extracted.length} Stocks</p>
              <p className="text-xs text-muted">AI successfully read these items. Please confirm before adding to portfolio.</p>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-border/40 bg-bg/40 p-2 scrollbar-thin scrollbar-thumb-accent/20">
              <div className="grid gap-2">
                {extracted.map((h, i) => {
                  const quantity = parsePositive(h.quantity);
                  const buyPrice = parsePositive(h.buyPrice);
                  const rowValid = Boolean(h.symbol) && quantity !== null && buyPrice !== null;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-xl bg-panel/60 p-3 text-sm border transition-all ${
                        rowValid ? "border-border/20 hover:border-accent/30" : "border-danger/40 bg-danger/5"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[10px] font-bold text-accent">
                          {h.symbol?.slice(0, 2).toUpperCase() || "??"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{h.symbol}</p>
                          <p className="text-[10px] text-muted">{h.buyDate || "No date"}</p>
                          {!rowValid && (
                            <p className="text-[10px] font-semibold text-danger">
                              Skipped — couldn&apos;t read a valid quantity/price
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">{buyPrice !== null ? `₹${buyPrice.toLocaleString("en-IN")}` : "—"}</p>
                        <p className="text-[10px] text-muted">{quantity !== null ? `${quantity} shares` : "—"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setExtracted([])}
                className="flex-1 rounded-xl border border-border/60 py-3 text-sm font-bold text-muted transition hover:bg-bg hover:text-text"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={validCount === 0}
                className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white transition hover:shadow-lg disabled:opacity-50"
              >
                {validCount === extracted.length ? "Confirm & Add All" : `Confirm & Add ${validCount} of ${extracted.length}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
