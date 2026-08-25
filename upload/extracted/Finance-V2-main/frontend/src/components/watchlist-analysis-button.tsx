"use client";

import Link from "next/link";
import { Loader2, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { fetchWatchlistAnalysis } from "@/lib/api";
import { cn } from "@/shared/utils";
import { Badge } from "@/components/ui/badge";

type Props = {
  symbol: string;
  className?: string;
  compactLabel?: boolean;
};

type AnalysisResult = {
  answer: string;
  source: "gemini" | "fallback";
};

export function WatchlistAnalysisButton({ symbol, className, compactLabel = false }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!open || analysis) {
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    fetchWatchlistAnalysis(symbol)
      .then((result) => {
        if (!cancelled) {
          setAnalysis(result);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [analysis, open, symbol]);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const modal = open && mounted
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <div className="relative w-full max-w-xl rounded-2xl border border-border/70 bg-panel/95 p-5 shadow-2xl backdrop-blur-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="text-sm font-semibold">AI Quant Review</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {symbol} watchlist analysis in a buy-side quant research tone
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1 text-muted transition hover:bg-accent/10 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-xl border border-border/50 bg-bg/50 px-3 py-2">
              <span className="text-sm font-bold text-accent">{symbol}</span>
              <Badge variant="outline" className="border-border/60 bg-panel/70 px-2 py-0.5 text-[11px] text-muted">
                Source: {analysis?.source === "gemini" ? "Gemini" : "Fallback"}
              </Badge>
            </div>

            <div className="rounded-2xl border border-border/60 bg-bg/40 p-4">
              {loading ? (
                <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building AI review...
                </div>
              ) : (
                <p className="min-h-52 whitespace-pre-line text-sm leading-7 text-text">
                  {analysis?.answer || "No analysis available."}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                Use this as a review layer, not as a final investment decision.
              </p>
              <Link
                href={`/stocks/${symbol}`}
                className="rounded-xl bg-accent/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent"
              >
                Open Dashboard
              </Link>
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
        title={`Run AI analysis for ${symbol}`}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-panel/60 px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent",
          className
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>{compactLabel ? "AI" : "AI Analysis"}</span>
      </button>
      {modal}
    </>
  );
}
