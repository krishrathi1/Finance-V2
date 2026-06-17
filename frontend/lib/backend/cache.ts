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

export function getFresh<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttlMs) return null;
  return hit.data as T;
}

export function getStale<T>(key: string): T | null {
  const hit = store.get(key);
  return hit ? (hit.data as T) : null;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { at: Date.now(), ttlMs, data });
}
