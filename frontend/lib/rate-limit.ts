/**
 * Fixed-window rate limiter.
 *
 * Uses Upstash Redis (REST-based, so it works in the Edge runtime that
 * middleware.ts runs on) when UPSTASH_REDIS_REST_URL/TOKEN are configured —
 * shared correctly across multiple containers/instances. Falls back to the
 * previous per-instance in-memory Map when they aren't set, so single
 * -container deployments keep working with zero config, and a Redis outage
 * degrades to per-instance limiting instead of failing requests.
 */

// The "/cloudflare" entry point is the Node-API-free build (no `process.*`
// usage) — required because middleware.ts runs in Next's Edge runtime, which
// the default "@upstash/redis" build isn't compatible with (it references
// `process.version`, which doesn't exist there and breaks at runtime).
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

// ---------------------------------------------------------------------------
// In-memory fallback (unchanged behavior from before Redis support)
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

function rateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      if (buckets.size >= MAX_BUCKETS) {
        const oldestKey = buckets.keys().next().value as string | undefined;
        if (oldestKey) buckets.delete(oldestKey);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Redis-backed limiter (shared across instances)
// ---------------------------------------------------------------------------

// Resolved lazily so builds/tests without Redis env vars never try to
// construct a client. `undefined` = not yet resolved, `null` = not configured.
let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

// One Ratelimit instance per distinct (limit, windowMs) pair, reused across
// calls — every call site here uses a handful of fixed configs, not a
// unique one per request.
const limiters = new Map<string, Ratelimit>();

function getLimiter(redis: Redis, limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
      analytics: false,
      prefix: "ratelimit",
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

async function rateLimitRedis(redis: Redis, key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const limiter = getLimiter(redis, limit, windowMs);
  const result = await limiter.limit(key);
  if (result.success) return { ok: true, retryAfterSeconds: 0 };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
}

/**
 * Check + increment a fixed-window rate-limit bucket for `key`.
 * Redis-backed (shared across instances) when Upstash env vars are set;
 * otherwise per-instance in-memory. Never throws — a Redis error falls back
 * to the in-memory limiter for that call rather than failing the request.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return rateLimitMemory(key, limit, windowMs);
  try {
    return await rateLimitRedis(redis, key, limit, windowMs);
  } catch (err) {
    console.warn(`[rate-limit] Redis error, falling back to in-memory for this call: ${String(err)}`);
    return rateLimitMemory(key, limit, windowMs);
  }
}

export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").at(-1)?.trim() || "unknown";
  return "unknown";
}
