"use client";

import { Heart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { addToWatchlist, isInWatchlist, removeFromWatchlist, WATCHLIST_SYNCED_EVENT } from "@/lib/watchlist";
import { cn } from "@/shared/utils";

type Props = {
  symbol: string;
  className?: string;
};

export function WatchlistButton({ symbol, className }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isInWatchlist(symbol));
  }, [symbol]);

  useEffect(() => {
    function handleSynced() {
      setActive(isInWatchlist(symbol));
    }
    window.addEventListener(WATCHLIST_SYNCED_EVENT, handleSynced);
    return () => window.removeEventListener(WATCHLIST_SYNCED_EVENT, handleSynced);
  }, [symbol]);

  const toggle = useCallback(() => {
    if (active) {
      removeFromWatchlist(symbol);
      setActive(false);
    } else {
      addToWatchlist(symbol);
      setActive(true);
    }
  }, [active, symbol]);

  return (
    <button
      onClick={toggle}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      className={cn(
        "group inline-flex items-center justify-center rounded-lg border p-1.5 transition-all duration-200",
        active
          ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
          : "border-border/60 bg-panel/60 text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent",
        className
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-transform duration-200 group-hover:scale-110",
          active && "fill-current"
        )}
      />
    </button>
  );
}
