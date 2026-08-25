"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { parseBrokerCsv, type BrokerImportResult, type ParsedTradeRow } from "@/lib/broker-importer";
import { addHolding } from "@/lib/portfolio";

export function BrokerImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<BrokerImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const res = parseBrokerCsv(text);
        setResult(res);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleExecuteImport = () => {
    if (!result || result.totalValid === 0) return;
    setIsProcessing(true);

    try {
      const validTrades = result.trades.filter((t) => t.status === "Valid");
      for (const trade of validTrades) {
        addHolding(
          trade.symbol,
          trade.companyName || trade.symbol,
          trade.quantity,
          trade.buyPrice,
          trade.buyDate,
          `Imported from ${trade.brokerDetected}`
        );
      }
      onImportComplete();
      onClose();
    } catch (e) {
      console.error("Error executing trade import:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border/80 bg-panel p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">Import Broker Statement</h3>
              <p className="text-xs text-muted">
                Zerodha Tradebook, Groww P&amp;L, Angel One, or Generic CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted hover:text-fg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-4 overflow-y-auto space-y-4 pr-1">
          {/* File Upload Zone */}
          {!result && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border/70 hover:border-primary/50 bg-bg/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
              <div className="p-4 rounded-full bg-secondary/80 text-primary mb-3">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-fg">
                Drag &amp; drop your broker CSV here, or <span className="text-primary underline">browse</span>
              </p>
              <p className="text-xs text-muted mt-1.5">
                Automatically detects Zerodha, Groww, AngelOne &amp; standard formats
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-fg bg-secondary/40 px-3 py-1 rounded-full">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Client-side only: your trade data never leaves your browser</span>
              </div>
            </div>
          )}

          {/* Preview & Confirmation Screen */}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-bg/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-medium">File:</span>
                  <span className="text-xs font-mono font-semibold text-fg">{fileName}</span>
                  <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded bg-primary/15 text-primary">
                    {result.brokerName} Detected
                  </span>
                </div>
                <button
                  onClick={() => {
                    setResult(null);
                    setFileName("");
                  }}
                  className="text-xs text-muted hover:text-fg underline"
                >
                  Choose another file
                </button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-xs text-muted">Ready to Import</span>
                    <p className="text-lg font-bold font-mono text-emerald-400">
                      {result.totalValid} Valid Lots
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-border/60 bg-bg/40 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-xs text-muted">Ignored / Sells</span>
                    <p className="text-lg font-bold font-mono text-muted">
                      {result.totalErrors} Rows
                    </p>
                  </div>
                </div>
              </div>

              {/* Parsed Rows Preview Table */}
              <div className="rounded-xl border border-border/60 overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-secondary/80 border-b border-border/60 text-muted uppercase font-mono text-[10px]">
                    <tr>
                      <th className="p-2.5">Symbol</th>
                      <th className="p-2.5 text-right">Quantity</th>
                      <th className="p-2.5 text-right">Buy Price (₹)</th>
                      <th className="p-2.5 text-center">Buy Date</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                    {result.trades.map((t, idx) => (
                      <tr key={idx} className="hover:bg-secondary/30">
                        <td className="p-2.5 font-bold text-fg">{t.symbol}</td>
                        <td className="p-2.5 text-right">{t.quantity}</td>
                        <td className="p-2.5 text-right">₹{t.buyPrice.toFixed(2)}</td>
                        <td className="p-2.5 text-center text-muted">{t.buyDate}</td>
                        <td className="p-2.5 text-center">
                          {t.status === "Valid" ? (
                            <span className="text-emerald-400 font-sans text-[10px] font-semibold">Valid</span>
                          ) : (
                            <span className="text-rose-400 font-sans text-[10px]" title={t.error}>
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {result && (
          <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-muted hover:text-fg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={isProcessing || result.totalValid === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              <span>{isProcessing ? "Importing..." : `Import ${result.totalValid} Holdings`}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
