const STORAGE_KEY = "ff-watchlists";
const DEFAULT_LIST = "My Watchlist";

/** Fired after a server hydration/merge overwrites localStorage, so any
 * already-rendered watchlist UI knows to re-read from storage. */
export const WATCHLIST_SYNCED_EVENT = "ff-watchlist-synced";

export type WatchlistStore = {
  lists: Record<string, string[]>;
  notes?: Record<string, Record<string, string>>;
};

function read(): WatchlistStore {
  if (typeof window === "undefined") return { lists: { [DEFAULT_LIST]: [] }, notes: { [DEFAULT_LIST]: {} } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lists: { [DEFAULT_LIST]: [] }, notes: { [DEFAULT_LIST]: {} } };
    const parsed = JSON.parse(raw) as WatchlistStore;
    if (!parsed.lists || typeof parsed.lists !== "object") {
      return { lists: { [DEFAULT_LIST]: [] }, notes: { [DEFAULT_LIST]: {} } };
    }
    if (!parsed.notes || typeof parsed.notes !== "object") {
      parsed.notes = {};
    }
    // Ensure default list always exists
    if (!parsed.lists[DEFAULT_LIST]) {
      parsed.lists[DEFAULT_LIST] = [];
    }
    if (!parsed.notes[DEFAULT_LIST]) {
      parsed.notes[DEFAULT_LIST] = {};
    }
    return parsed;
  } catch {
    return { lists: { [DEFAULT_LIST]: [] }, notes: { [DEFAULT_LIST]: {} } };
  }
}

function write(store: WatchlistStore) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage full or unavailable (e.g. Safari private mode)
  }
}

// ---------------------------------------------------------------------------
// Server sync (best-effort). localStorage stays the source of truth for the
// current tab/session — every read/write above is untouched and still works
// fully offline/anonymous. When the user is signed in, mutations are also
// fired at the server in the background so the same account sees its
// watchlist on another device; a failed sync just leaves the next login's
// hydration to reconcile things instead of blocking or erroring the UI.
// ---------------------------------------------------------------------------

let authenticated = false;
let hydrated = false;

/** Set by the auth layer (see components/watchlist-sync.tsx) whenever sign-in
 * state changes, so mutations know whether it's worth calling the server. */
export function setWatchlistAuthState(isAuthenticated: boolean) {
  authenticated = isAuthenticated;
}

/** Call on sign-out so the next sign-in (possibly a different account) hydrates fresh. */
export function resetWatchlistHydration() {
  hydrated = false;
}

function notifySynced() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WATCHLIST_SYNCED_EVENT));
  }
}

function syncOp(action: string, extra: Record<string, unknown> = {}) {
  if (!authenticated || typeof window === "undefined") return;
  fetch("/api/v1/watchlist", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  }).catch(() => {
    // Offline or a transient server error — localStorage already has the
    // change; it'll reconcile on the next successful hydrate/merge.
  });
}

/**
 * Pulls the server's watchlist into localStorage. If there's local data that
 * predates sign-in (an anonymous user's saved watchlist), it's merged into
 * the server store first so signing in never silently discards it.
 * Safe to call multiple times — only does work once per sign-in.
 */
export async function hydrateWatchlistFromServer(): Promise<void> {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const local = read();
    const hasLocalData =
      Object.keys(local.lists).length > 1 || Object.values(local.lists).some((symbols) => symbols.length > 0);

    const res = hasLocalData
      ? await fetch("/api/v1/watchlist", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "merge", store: local }),
        })
      : await fetch("/api/v1/watchlist", { credentials: "include" });

    if (res.ok) {
      write(await res.json());
      notifySynced();
    }
  } catch {
    // Offline or logged out mid-flight — keep whatever's already local.
  }
}

/** Get all symbols in a specific watchlist (defaults to "My Watchlist") */
export function getWatchlist(listName: string = DEFAULT_LIST): string[] {
  const store = read();
  return store.lists[listName] || [];
}

/** Add a symbol to a watchlist */
export function addToWatchlist(symbol: string, listName: string = DEFAULT_LIST): string[] {
  const store = read();
  if (!store.lists[listName]) {
    store.lists[listName] = [];
  }
  if (!store.notes?.[listName]) {
    store.notes = { ...(store.notes || {}), [listName]: {} };
  }
  const upper = symbol.toUpperCase();
  if (!store.lists[listName].includes(upper)) {
    store.lists[listName].push(upper);
  }
  write(store);
  syncOp("addSymbol", { listName, symbol: upper });
  return store.lists[listName];
}

/** Remove a symbol from a watchlist */
export function removeFromWatchlist(symbol: string, listName: string = DEFAULT_LIST): string[] {
  const store = read();
  if (!store.lists[listName]) return [];
  const upper = symbol.toUpperCase();
  store.lists[listName] = store.lists[listName].filter((s) => s !== upper);
  if (store.notes?.[listName]) {
    delete store.notes[listName][upper];
  }
  write(store);
  syncOp("removeSymbol", { listName, symbol: upper });
  return store.lists[listName];
}

/** Check if a symbol is in a watchlist */
export function isInWatchlist(symbol: string, listName: string = DEFAULT_LIST): boolean {
  const store = read();
  if (!store.lists[listName]) return false;
  return store.lists[listName].includes(symbol.toUpperCase());
}

/** Get all watchlist names */
export function getWatchlists(): string[] {
  const store = read();
  return Object.keys(store.lists);
}

/** Create a new watchlist */
export function createWatchlist(listName: string): string[] {
  const store = read();
  if (!store.lists[listName]) {
    store.lists[listName] = [];
  }
  if (!store.notes) {
    store.notes = {};
  }
  if (!store.notes[listName]) {
    store.notes[listName] = {};
  }
  write(store);
  syncOp("createList", { listName });
  return Object.keys(store.lists);
}

/** Delete a watchlist (cannot delete default) */
export function deleteWatchlist(listName: string): string[] {
  if (listName === DEFAULT_LIST) return getWatchlists();
  const store = read();
  delete store.lists[listName];
  if (store.notes) {
    delete store.notes[listName];
  }
  write(store);
  syncOp("deleteList", { listName });
  return Object.keys(store.lists);
}

export function getWatchlistNote(symbol: string, listName: string = DEFAULT_LIST): string {
  const store = read();
  return store.notes?.[listName]?.[symbol.toUpperCase()] || "";
}

export function setWatchlistNote(symbol: string, note: string, listName: string = DEFAULT_LIST): void {
  const store = read();
  if (!store.notes) {
    store.notes = {};
  }
  if (!store.notes[listName]) {
    store.notes[listName] = {};
  }
  const upper = symbol.toUpperCase();
  const trimmed = note.trim();
  if (trimmed) {
    store.notes[listName][upper] = trimmed;
  } else {
    delete store.notes[listName][upper];
  }
  write(store);
  syncOp("setNote", { listName, symbol: upper, note: trimmed });
}

export function getWatchlistNotes(listName: string = DEFAULT_LIST): Record<string, string> {
  const store = read();
  return store.notes?.[listName] || {};
}
