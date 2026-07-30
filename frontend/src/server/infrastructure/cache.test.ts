import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("cache (getFresh/getStale/setCache)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a key that was never set", async () => {
    const { getFresh, getStale } = await import("@/server/infrastructure/cache");
    expect(getFresh("missing")).toBeNull();
    expect(getStale("missing")).toBeNull();
  });

  it("returns the cached value while within its TTL", async () => {
    const { getFresh, setCache } = await import("@/server/infrastructure/cache");
    setCache("k", { hello: "world" }, 10_000);
    expect(getFresh("k")).toEqual({ hello: "world" });
    vi.advanceTimersByTime(9_999);
    expect(getFresh("k")).toEqual({ hello: "world" });
  });

  it("goes stale (fresh miss) once the TTL passes, but is still available via getStale", async () => {
    const { getFresh, getStale, setCache } = await import("@/server/infrastructure/cache");
    setCache("k", "value", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(getFresh("k")).toBeNull();
    expect(getStale("k")).toBe("value");
  });

  it("evicts and returns null once past the stale window (min(1h, ttl*10))", async () => {
    const { getFresh, getStale, setCache } = await import("@/server/infrastructure/cache");
    setCache("k", "value", 1_000);
    // stale window = min(60min, 1000*10ms) = 10s
    vi.advanceTimersByTime(10_001);
    expect(getFresh("k")).toBeNull();
    expect(getStale("k")).toBeNull();
  });

  it("overwrites an existing key's value and TTL", async () => {
    const { getFresh, setCache } = await import("@/server/infrastructure/cache");
    setCache("k", "first", 10_000);
    setCache("k", "second", 10_000);
    expect(getFresh("k")).toBe("second");
  });
});
