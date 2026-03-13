"use client";

import { useEffect, useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getIndianMarketStatus } from "@/lib/market-status";

export function MarketStatusBadge({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState(() => getIndianMarketStatus());

  useEffect(() => {
    const sync = () => setStatus(getIndianMarketStatus());
    sync();
    const timer = setInterval(sync, 30_000);
    return () => clearInterval(timer);
  }, []);

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
