import { describe, it, expect, beforeEach, vi } from "vitest";

// lib/watchlist.ts guards every localStorage/window access behind
// `typeof window === "undefined"`, so the default node test environment
// (no window/localStorage) needs a minimal stand-in rather than pulling in
// jsdom just for this one file.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

function installBrowserGlobals() {
  (globalThis as any).window = new EventTarget();
  (globalThis as any).localStorage = new MemoryStorage();
}

describe("lib/watchlist server sync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installBrowserGlobals();
  });

  it("stays local-only and never calls the server when signed out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const watchlist = await import("./watchlist");

    watchlist.addToWatchlist("TCS");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(watchlist.getWatchlist()).toContain("TCS");
  });

  it("fires a background POST for each mutation once signed in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ lists: {}, notes: {} }) });
    vi.stubGlobal("fetch", fetchMock);
    const watchlist = await import("./watchlist");

    watchlist.setWatchlistAuthState(true);
    watchlist.addToWatchlist("INFY", "Tech");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/watchlist", expect.objectContaining({ method: "POST" }));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ action: "addSymbol", listName: "Tech", symbol: "INFY" });
  });

  it("a failed background sync does not throw or roll back the local write", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const watchlist = await import("./watchlist");

    watchlist.setWatchlistAuthState(true);
    expect(() => watchlist.addToWatchlist("RELIANCE")).not.toThrow();
    expect(watchlist.getWatchlist()).toContain("RELIANCE");
  });

  it("merges pre-existing local data into the server on hydrate and adopts the merged result", async () => {
    const merged = { lists: { "My Watchlist": ["TCS", "INFY"] }, notes: { "My Watchlist": {} } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => merged });
    vi.stubGlobal("fetch", fetchMock);
    const watchlist = await import("./watchlist");

    // Data saved anonymously before sign-in.
    watchlist.addToWatchlist("TCS");
    watchlist.setWatchlistAuthState(true);

    let syncedFired = false;
    (globalThis as any).window.addEventListener(watchlist.WATCHLIST_SYNCED_EVENT, () => {
      syncedFired = true;
    });

    await watchlist.hydrateWatchlistFromServer();

    const mergeCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST" && JSON.parse(init.body).action === "merge"
    );
    expect(mergeCall).toBeTruthy();
    expect(watchlist.getWatchlist()).toEqual(["TCS", "INFY"]);
    expect(syncedFired).toBe(true);
  });

  it("only hydrates once per sign-in, and again after resetWatchlistHydration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ lists: {}, notes: {} }) });
    vi.stubGlobal("fetch", fetchMock);
    const watchlist = await import("./watchlist");

    watchlist.setWatchlistAuthState(true);
    await watchlist.hydrateWatchlistFromServer();
    await watchlist.hydrateWatchlistFromServer();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    watchlist.resetWatchlistHydration();
    await watchlist.hydrateWatchlistFromServer();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
