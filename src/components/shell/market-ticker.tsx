"use client";

import { useCallback, useState } from "react";
import { apiGet } from "@/lib/api";
import { useApp, usePolling } from "@/lib/store";
import { fmtInr, type TickerRow } from "@/lib/types";
import { ChangePill } from "@/components/shared/change-pill";

/** Scrolling top tape with the most-traded universe rows. */
export function MarketTicker() {
  const [rows, setRows] = useState<TickerRow[] | null>(null);
  const openStock = useApp((s) => s.openStock);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<TickerRow[]>("/api/market/ticker");
      setRows([...data].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 30));
    } catch {
      // keep last snapshot
    }
  }, []);

  usePolling(load, 20000);

  if (!rows || rows.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="ticker-shell h-9 border-b border-border/25 bg-bg/60 shimmer dark:bg-bg/40"
      />
    );
  }

  // Duplicated once for a seamless -50% loop.
  const tape = [...rows, ...rows];

  return (
    <div
      className="ticker-shell h-9 border-b border-border/25 bg-bg/60 dark:bg-bg/40"
      role="region"
      aria-label="Live market ticker"
    >
      <div className="ticker-track h-full items-center">
        {tape.map((row, i) => (
          <button
            key={`${row.symbol}-${i}`}
            type="button"
            onClick={() => openStock(row.symbol)}
            aria-label={`Open ${row.name} (${row.symbol})`}
            className="flex h-9 items-center gap-2 whitespace-nowrap px-4 text-xs transition hover:opacity-75"
          >
            <span className="font-semibold text-text">{row.symbol}</span>
            <span className="tabular-nums text-muted-foreground">{fmtInr(row.price)}</span>
            <ChangePill value={row.changePercent} size="xs" />
          </button>
        ))}
      </div>
    </div>
  );
}
