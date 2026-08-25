"use client";

// Central client state: current view + persisted collections
// (watchlist / portfolio / alerts), each synced with the API and
// mirrored to localStorage for offline-first reads.

import { create } from "zustand";
import { apiGet, apiPost, apiPut, apiDelete } from "./api";
import type {
  ViewKey,
  WatchlistItem,
  Holding,
  PriceAlert,
  MarketOverview,
} from "./types";

interface AppState {
  view: ViewKey;
  stockSymbol: string | null;
  compareA: string | null;
  compareB: string | null;

  watchlist: WatchlistItem[];
  holdings: Holding[];
  alerts: PriceAlert[];
  loaded: boolean;

  setView: (view: ViewKey) => void;
  openStock: (symbol: string) => void;
  setCompare: (a: string | null, b: string | null) => void;

  hydrate: () => Promise<void>;
  addToWatchlist: (symbol: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  setWatchlistNote: (symbol: string, note: string) => Promise<void>;
  inWatchlist: (symbol: string) => boolean;

  addHolding: (input: { symbol: string; quantity: number; buyPrice: number; buyDate?: string; targetPrice?: number; notes?: string }) => Promise<void>;
  updateHolding: (id: string, input: { quantity?: number; buyPrice?: number; targetPrice?: number | null; notes?: string; buyDate?: string }) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;

  addAlert: (input: { symbol: string; targetPrice: number; condition: "above" | "below"; note?: string }) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  refreshAlerts: () => Promise<void>;
  refreshLive: () => Promise<void>;
}

const LS_WATCHLIST = "msv-watchlist-cache";
const LS_HOLDINGS = "msv-holdings-cache";
const LS_ALERTS = "msv-alerts-cache";

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — ignore
  }
}

export const useApp = create<AppState>((set, get) => ({
  view: "home",
  stockSymbol: null,
  compareA: null,
  compareB: null,

  watchlist: [],
  holdings: [],
  alerts: [],
  loaded: false,

  setView: (view) => {
    set({ view });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  },

  openStock: (symbol) => {
    set({ view: "stock", stockSymbol: symbol.toUpperCase() });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  },

  setCompare: (a, b) => set({ compareA: a?.toUpperCase() ?? null, compareB: b?.toUpperCase() ?? null }),

  hydrate: async () => {
    // instant paint from cache
    set({
      watchlist: readCache<WatchlistItem[]>(LS_WATCHLIST) ?? [],
      holdings: readCache<Holding[]>(LS_HOLDINGS) ?? [],
      alerts: readCache<PriceAlert[]>(LS_ALERTS) ?? [],
    });
    try {
      const [watchlist, holdings, alerts] = await Promise.all([
        apiGet<WatchlistItem[]>("/api/watchlist"),
        apiGet<Holding[]>("/api/portfolio"),
        apiGet<PriceAlert[]>("/api/alerts"),
      ]);
      set({ watchlist, holdings, alerts, loaded: true });
      writeCache(LS_WATCHLIST, watchlist);
      writeCache(LS_HOLDINGS, holdings);
      writeCache(LS_ALERTS, alerts);
    } catch {
      set({ loaded: true });
    }
  },

  addToWatchlist: async (symbol) => {
    if (get().inWatchlist(symbol)) return;
    try {
      await apiPost("/api/watchlist", { symbol });
    } catch {
      // offline-first: local entry so UI still updates
      const item: WatchlistItem = { id: `local-${symbol}`, symbol, note: null, name: symbol, price: null, changePercent: null };
      set({ watchlist: [item, ...get().watchlist] });
      writeCache(LS_WATCHLIST, get().watchlist);
      return;
    }
    await get().hydrate();
  },

  removeFromWatchlist: async (symbol) => {
    set({ watchlist: get().watchlist.filter((w) => w.symbol !== symbol) });
    writeCache(LS_WATCHLIST, get().watchlist);
    try {
      await apiDelete(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`);
    } catch {
      // keep local state
    }
  },

  setWatchlistNote: async (symbol, note) => {
    set({
      watchlist: get().watchlist.map((w) => (w.symbol === symbol ? { ...w, note } : w)),
    });
    writeCache(LS_WATCHLIST, get().watchlist);
    try {
      await apiPost("/api/watchlist", { symbol, note });
    } catch {
      // local only
    }
  },

  inWatchlist: (symbol) => get().watchlist.some((w) => w.symbol === symbol),

  addHolding: async (input) => {
    try {
      await apiPost("/api/portfolio", input);
      await get().hydrate();
    } catch (err) {
      throw err;
    }
  },

  updateHolding: async (id, input) => {
    set({ holdings: get().holdings.map((h) => (h.id === id ? { ...h, ...input } : h)) });
    try {
      await apiPut("/api/portfolio", { id, ...input });
    } catch {
      // local only
    }
  },

  removeHolding: async (id) => {
    set({ holdings: get().holdings.filter((h) => h.id !== id) });
    writeCache(LS_HOLDINGS, get().holdings);
    try {
      await apiDelete(`/api/portfolio?id=${id}`);
    } catch {
      // local only
    }
  },

  addAlert: async (input) => {
    try {
      await apiPost("/api/alerts", input);
      await get().refreshAlerts();
    } catch (err) {
      throw err;
    }
  },

  removeAlert: async (id) => {
    set({ alerts: get().alerts.filter((a) => a.id !== id) });
    writeCache(LS_ALERTS, get().alerts);
    try {
      await apiDelete(`/api/alerts?id=${id}`);
    } catch {
      // local only
    }
  },

  refreshAlerts: async () => {
    try {
      const alerts = await apiGet<PriceAlert[]>("/api/alerts");
      set({ alerts });
      writeCache(LS_ALERTS, alerts);
    } catch {
      // keep state
    }
  },

  refreshLive: async () => {
    // refresh prices on watchlist + holdings without full hydrate
    try {
      const [watchlist, holdings] = await Promise.all([
        apiGet<WatchlistItem[]>("/api/watchlist"),
        apiGet<Holding[]>("/api/portfolio"),
      ]);
      set({ watchlist, holdings });
      writeCache(LS_WATCHLIST, watchlist);
      writeCache(LS_HOLDINGS, holdings);
    } catch {
      // keep state
    }
  },
}));

// ── polling hook ────────────────────────────────────────────────────────

import { useEffect } from "react";

/** Polls a fetcher on an interval, skipping hidden tabs. */
export function usePolling(fn: () => void, intervalMs: number) {
  useEffect(() => {
    fn();
    let timer: ReturnType<typeof setInterval>;
    const tick = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        fn();
      }
    };
    timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}

export type { MarketOverview };
