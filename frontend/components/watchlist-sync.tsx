"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/hooks/useAuth";
import { hydrateWatchlistFromServer, resetWatchlistHydration, setWatchlistAuthState } from "@/lib/watchlist";

/**
 * Bridges auth state into lib/watchlist.ts's module-level sync flags.
 * Renders nothing — mounted once in the root layout alongside AuthProvider.
 */
export function WatchlistSync() {
  const { user, loading } = useAuth();
  const lastUserId = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;
    setWatchlistAuthState(Boolean(user));

    if (user) {
      if (lastUserId.current !== user.id) {
        lastUserId.current = user.id;
        void hydrateWatchlistFromServer();
      }
    } else {
      lastUserId.current = null;
      resetWatchlistHydration();
    }
  }, [user, loading]);

  return null;
}
