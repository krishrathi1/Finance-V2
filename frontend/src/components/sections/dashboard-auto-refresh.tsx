"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function DashboardAutoRefresh({ symbol, active, warning }: { symbol: string; active: boolean; warning?: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) {
      sessionStorage.removeItem(`dashboard-refresh:${symbol}`);
      setAttempt(0);
      return;
    }

    const storageKey = `dashboard-refresh:${symbol}`;
    const count = Number(sessionStorage.getItem(storageKey) || "0");
    if (count >= 2) {
      setAttempt(count);
      return;
    }

    setAttempt(count);
    const delay = count === 0 ? 4000 : 10000;
    const timer = window.setTimeout(() => {
      sessionStorage.setItem(storageKey, String(count + 1));
      startTransition(() => {
        router.refresh();
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [active, router, symbol]);

  if (!active) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-text">
      <p className="font-medium">Loading live stock data...</p>
      <p className="mt-1 text-muted">
        {warning || "The backend is warming up. The page will refresh automatically when richer data is ready."}
      </p>
      {attempt >= 2 ? <p className="mt-1 text-xs text-muted">Live sources are still slow right now, so fallback data is being shown.</p> : null}
    </div>
  );
}
