const STORAGE_KEY = "ff-watchlists";
const DEFAULT_LIST = "My Watchlist";

export type WatchlistStore = {
  lists: Record<string, string[]>;
};

function read(): WatchlistStore {
  if (typeof window === "undefined") return { lists: { [DEFAULT_LIST]: [] } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lists: { [DEFAULT_LIST]: [] } };
    const parsed = JSON.parse(raw) as WatchlistStore;
    if (!parsed.lists || typeof parsed.lists !== "object") {
      return { lists: { [DEFAULT_LIST]: [] } };
    }
    // Ensure default list always exists
    if (!parsed.lists[DEFAULT_LIST]) {
      parsed.lists[DEFAULT_LIST] = [];
    }
    return parsed;
  } catch {
    return { lists: { [DEFAULT_LIST]: [] } };
  }
}

function write(store: WatchlistStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
  const upper = symbol.toUpperCase();
  if (!store.lists[listName].includes(upper)) {
    store.lists[listName].push(upper);
  }
  write(store);
  return store.lists[listName];
}

/** Remove a symbol from a watchlist */
export function removeFromWatchlist(symbol: string, listName: string = DEFAULT_LIST): string[] {
  const store = read();
  if (!store.lists[listName]) return [];
  const upper = symbol.toUpperCase();
  store.lists[listName] = store.lists[listName].filter((s) => s !== upper);
  write(store);
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
  write(store);
  return Object.keys(store.lists);
}

/** Delete a watchlist (cannot delete default) */
export function deleteWatchlist(listName: string): string[] {
  if (listName === DEFAULT_LIST) return getWatchlists();
  const store = read();
  delete store.lists[listName];
  write(store);
  return Object.keys(store.lists);
}
