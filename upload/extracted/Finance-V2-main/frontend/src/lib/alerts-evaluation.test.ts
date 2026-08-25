/**
 * Regression tests for the client-side alert fallback.
 *
 * `checkAlerts` runs when the server can't be reached (signed out or
 * offline). It never sends email, so a wrong result here is a badge rather
 * than a notification — but a badge claiming a target was hit when it wasn't
 * is exactly the kind of thing someone acts on.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "ff-price-alerts";

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

/** Seed alerts directly so the tests don't depend on the add/sync path. */
function seedAlerts(alerts: Array<Record<string, unknown>>) {
  (globalThis as any).localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

const alert = (symbol: string, condition: "above" | "below", targetPrice: number) => ({
  id: `${symbol}-${condition}-${targetPrice}`,
  symbol,
  targetPrice,
  condition,
  note: "",
  createdAt: "2025-01-01T00:00:00.000Z",
});

describe("checkAlerts with an unusable quote", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installBrowserGlobals();
  });

  it("does not fire a below-target alert on a zero quote", async () => {
    // Only `undefined` was rejected, so a suspended or badly-parsed scrip
    // quoting 0 satisfied every downside target the user had on it.
    seedAlerts([alert("TCS", "below", 3000)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ TCS: 0 })).toEqual([]);
  });

  it("does not fire on a negative quote", async () => {
    seedAlerts([alert("TCS", "below", 3000)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ TCS: -100 })).toEqual([]);
  });

  it("does not fire on a NaN quote", async () => {
    seedAlerts([alert("TCS", "below", 3000), alert("TCS", "above", 100)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ TCS: Number.NaN })).toEqual([]);
  });

  it("skips a symbol with no quote at all", async () => {
    seedAlerts([alert("TCS", "below", 3000)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ INFY: 1500 })).toEqual([]);
  });

  it("still fires on a genuine crossing", async () => {
    seedAlerts([alert("TCS", "below", 3000), alert("INFY", "above", 1400)]);
    const { checkAlerts } = await import("./alerts");

    const triggered = checkAlerts({ TCS: 2900, INFY: 1500 });
    expect(triggered).toHaveLength(2);
    expect(triggered.map((entry) => entry.currentPrice).sort()).toEqual([1500, 2900]);
  });

  it("leaves an untouched target alone", async () => {
    seedAlerts([alert("TCS", "below", 3000)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ TCS: 3100 })).toEqual([]);
  });

  it("treats the target itself as met, in both directions", async () => {
    seedAlerts([alert("TCS", "below", 3000), alert("INFY", "above", 1500)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ TCS: 3000, INFY: 1500 })).toHaveLength(2);
  });

  it("matches a lower-cased alert symbol against the upper-cased price map", async () => {
    seedAlerts([alert("tcs", "below", 3000)]);
    const { checkAlerts } = await import("./alerts");

    expect(checkAlerts({ TCS: 2900 })).toHaveLength(1);
  });
});
