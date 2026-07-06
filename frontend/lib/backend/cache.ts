/**
 * Tiny in-memory TTL cache for server-side route handlers (local single-process
 * replacement for the Python Redis layer). Holds a "fresh" value with a TTL and
 * retains the last value as "stale" for graceful fallback when a live build fails.
 */

interface Entry {
  at: number;
  ttlMs: number;
  data: unknown;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;
const MAX_STALE_MS = 60 * 60_000;

export function getFresh<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttlMs) return null;
  return hit.data as T;
}

export function getStale<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.at > Math.min(MAX_STALE_MS, hit.ttlMs * 10)) {
    if (hit) store.delete(key);
    return null;
  }
  return hit.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  const now = Date.now();
  for (const [cacheKey, entry] of store) {
    if (now - entry.at > Math.min(MAX_STALE_MS, entry.ttlMs * 10)) store.delete(cacheKey);
  }
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (oldestKey) store.delete(oldestKey);
  }
  store.set(key, { at: now, ttlMs, data });
}
