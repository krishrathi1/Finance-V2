"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/hooks/useAuth";
import { hydrateAlertsFromServer, resetAlertsHydration, setAlertsAuthState } from "@/lib/alerts";
import {
  hydratePortfolioFromServer,
  resetPortfolioHydration,
  setPortfolioAuthState,
} from "@/lib/portfolio";
import {
  hydrateTransactionsFromServer,
  resetTransactionsHydration,
  setTransactionsAuthState,
} from "@/lib/transactions";
import { hydrateWatchlistFromServer, resetWatchlistHydration, setWatchlistAuthState } from "@/lib/watchlist";

/**
 * Bridges auth state into the module-level sync flags of every account-scoped
 * local store (watchlist, portfolio, alerts). Renders nothing — mounted once in
 * the root layout alongside AuthProvider.
 *
 * All three stores follow the same contract: localStorage is the synchronous
 * source of truth, and these hooks tell each store when it's worth talking to
 * the server. Keeping them in one component means a new store gets wired up in
 * one place, and there's a single answer to "when does hydration happen?".
 */
export function AccountSync() {
  const { user, loading } = useAuth();
  const lastUserId = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;

    const isAuthenticated = Boolean(user);
    setWatchlistAuthState(isAuthenticated);
    setPortfolioAuthState(isAuthenticated);
    setAlertsAuthState(isAuthenticated);
    setTransactionsAuthState(isAuthenticated);

    if (user) {
      // Guarded on a change of id, not just presence: re-running on every
      // render of the same session would re-POST the merge payload, and
      // switching accounts must hydrate afresh rather than keep the previous
      // user's data.
      if (lastUserId.current !== user.id) {
        lastUserId.current = user.id;
        void hydrateWatchlistFromServer();
        void hydratePortfolioFromServer();
        void hydrateAlertsFromServer();
        void hydrateTransactionsFromServer();
      }
    } else {
      lastUserId.current = null;
      resetWatchlistHydration();
      resetPortfolioHydration();
      resetAlertsHydration();
      resetTransactionsHydration();
    }
  }, [user, loading]);

  return null;
}
