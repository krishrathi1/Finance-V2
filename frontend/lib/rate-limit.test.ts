import { describe, it, expect, beforeEach, vi } from "vitest";

// No UPSTASH_REDIS_REST_URL/TOKEN set in the test env -> exercises the
// in-memory fallback path exclusively (matches an unconfigured deployment).
describe("rateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows requests under the limit", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const result = await rateLimit(key, 3, 60_000);
      expect(result.ok).toBe(true);
    }
  });

  it("blocks once the limit is exceeded and reports a positive retry-after", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await rateLimit(key, 3, 60_000);
    }
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const keyA = `test:a:${Math.random()}`;
    const keyB = `test:b:${Math.random()}`;
    await rateLimit(keyA, 1, 60_000);
    const blockedA = await rateLimit(keyA, 1, 60_000);
    const okB = await rateLimit(keyB, 1, 60_000);
    expect(blockedA.ok).toBe(false);
    expect(okB.ok).toBe(true);
  });

  it("resets the window after it expires", async () => {
    vi.useFakeTimers();
    try {
      const { rateLimit } = await import("@/lib/rate-limit");
      const key = `test:${Math.random()}`;
      await rateLimit(key, 1, 1000);
      expect((await rateLimit(key, 1, 1000)).ok).toBe(false);
      vi.advanceTimersByTime(1001);
      expect((await rateLimit(key, 1, 1000)).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers x-real-ip when present", async () => {
    const { clientIpFromHeaders } = await import("@/lib/rate-limit");
    const headers = new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" });
    expect(clientIpFromHeaders(headers)).toBe("1.2.3.4");
  });

  it("falls back to the last hop of x-forwarded-for", async () => {
    const { clientIpFromHeaders } = await import("@/lib/rate-limit");
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" });
    expect(clientIpFromHeaders(headers)).toBe("3.3.3.3");
  });

  it("returns 'unknown' when no IP headers are present", async () => {
    const { clientIpFromHeaders } = await import("@/lib/rate-limit");
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
