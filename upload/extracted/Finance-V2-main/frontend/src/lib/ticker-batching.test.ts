/**
 * Regression tests for the ticker request split.
 *
 * The `/ticker` endpoint keeps only the first 50 symbols of a request — a
 * deliberate bound so one call can't fan out to hundreds of upstream quotes.
 * It is a per-request limit, but callers pass whole portfolios (up to 500
 * holdings), watchlists and alert lists, so anything past the 50th symbol was
 * silently dropped: those holdings rendered blank and the portfolio total
 * understated itself without saying so.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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

const symbols = (count: number) => Array.from({ length: count }, (_, index) => `SYM${index}`);

/** Echoes back a priced row for whatever the request asked for. */
function pricingFetchMock() {
  return vi.fn(async (url: string) => {
    const query = new URL(url, "http://localhost").searchParams.get("symbols");
    const requested = query ? query.split(",") : [];
    return {
      ok: true,
      json: async () => ({
        data: requested.map((symbol) => ({
          symbol,
          cmp: 100,
          change: 0,
          changePercent: 0,
        })),
      }),
    };
  });
}

/** Symbols carried by one request URL. */
function requestedSymbols(call: unknown[]): string[] {
  const query = new URL(String(call[0]), "http://localhost").searchParams.get("symbols");
  return query ? query.split(",") : [];
}

describe("fetchTickerTape batching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installBrowserGlobals();
  });

  it("prices every symbol in a portfolio larger than one request allows", async () => {
    const fetchMock = pricingFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape } = await import("./api");

    const rows = await fetchTickerTape(symbols(120));

    expect(rows).toHaveLength(120);
    expect(new Set(rows.map((row: any) => row.symbol)).size).toBe(120);
    // The 51st and 120th are exactly the ones the old single request lost.
    expect(rows.some((row: any) => row.symbol === "SYM50")).toBe(true);
    expect(rows.some((row: any) => row.symbol === "SYM119")).toBe(true);
  });

  it("keeps each request within the endpoint's 50-symbol bound", async () => {
    const fetchMock = pricingFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape, TICKER_SYMBOLS_PER_REQUEST } = await import("./api");

    await fetchTickerTape(symbols(120));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(requestedSymbols(call).length).toBeLessThanOrEqual(TICKER_SYMBOLS_PER_REQUEST);
    }
  });

  it("splits without dropping or duplicating a symbol", async () => {
    const fetchMock = pricingFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape } = await import("./api");

    const input = symbols(101);
    await fetchTickerTape(input);

    const sent = fetchMock.mock.calls.flatMap((call) => requestedSymbols(call));
    expect(sent).toEqual(input);
  });

  it("still makes a single request for a list that fits", async () => {
    const fetchMock = pricingFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape } = await import("./api");

    await fetchTickerTape(symbols(50));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requests the whole-market snapshot once when given no symbols", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape } = await import("./api");

    await fetchTickerTape([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("symbols=");
  });

  it("keeps the prices it did get when one batch fails", async () => {
    // A failed batch costs its own symbols their price, not everyone else's.
    let call = 0;
    const fetchMock = vi.fn(async (url: string) => {
      call += 1;
      if (call === 2) throw new Error("network");
      const query = new URL(url, "http://localhost").searchParams.get("symbols");
      const requested = query ? query.split(",") : [];
      return {
        ok: true,
        json: async () => ({
          data: requested.map((symbol) => ({ symbol, cmp: 100, change: 0, changePercent: 0 })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape } = await import("./api");

    const rows = await fetchTickerTape(symbols(120));

    expect(rows.length).toBe(70);
    expect(rows.some((row: any) => row.symbol === "SYM0")).toBe(true);
    expect(rows.some((row: any) => row.symbol === "SYM119")).toBe(true);
  });

  it("throws when every batch fails, so the caller's stale fallback applies", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchTickerTape } = await import("./api");

    await expect(fetchTickerTape(symbols(120))).rejects.toThrow();
  });
});
