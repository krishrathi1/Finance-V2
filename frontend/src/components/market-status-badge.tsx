"use client";

import { useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import {
  getExchangeBackedMarketStatus,
  getIndianMarketStatus,
  type ExchangeMarketSnapshot,
  type MarketStatusScope,
} from "@/shared/market-status";

let snapshotCache: { loadedAt: number; value: ExchangeMarketSnapshot } | null = null;
let snapshotPending: Promise<ExchangeMarketSnapshot> | null = null;

async function fetchMarketSnapshot(): Promise<ExchangeMarketSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.loadedAt < 15_000) return snapshotCache.value;
  if (snapshotPending) return snapshotPending;
  snapshotPending = (async () => {
    const response = await fetch("/api/v1/stocks/market-status", { cache: "no-store" });
    if (!response.ok) throw new Error("Market status unavailable");
    const value = (await response.json()) as ExchangeMarketSnapshot;
    snapshotCache = { loadedAt: Date.now(), value };
    return value;
  })().finally(() => {
    snapshotPending = null;
  });
  return snapshotPending;
}

export function MarketStatusBadge({
  compact = false,
  scope = "capital",
}: {
  compact?: boolean;
  scope?: MarketStatusScope;
}) {
  const [status, setStatus] = useState(() => getIndianMarketStatus());

  useVisibilityPolling(async () => {
    try {
      const snapshot = await fetchMarketSnapshot();
      setStatus(getExchangeBackedMarketStatus(snapshot, scope));
    } catch {
      setStatus(getIndianMarketStatus());
    }
  }, 30_000);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={
              compact
                ? "inline-flex items-center gap-1.5 rounded-full px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                : "inline-flex items-center gap-2 rounded-full border border-border/70 bg-panel px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
            }
            aria-label={`Market status: ${status.label}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${status.dotClassName}`} aria-hidden="true" />
            <span>{status.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{status.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
