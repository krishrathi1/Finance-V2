/**
 * Shared HTTP utilities for the Node backend providers.
 * Every provider uses these so timeout/retry/UA behavior is consistent and
 * a single failing upstream never throws past the provider boundary.
 */

export const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  method?: string;
  body?: BodyInit;
  /** Next.js fetch cache hint; defaults to no-store for live data. */
  revalidate?: number;
}

export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { headers = {}, timeoutMs = 8000, method = "GET", body } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      method,
      headers: { "user-agent": DESKTOP_UA, ...headers },
      body,
      signal: controller.signal,
    };
    if (typeof opts.revalidate === "number") init.next = { revalidate: opts.revalidate };
    else (init as RequestInit).cache = "no-store";
    return await fetch(url, init);
  } finally {
    clearTimeout(timer);
  }
}

function redactSecrets(message: unknown): string {
  return String(message)
    .replace(/([?&](?:api[_-]?key|apikey|key|token|secret|password)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(AIza[0-9A-Za-z_-]{20,})/g, "[redacted-google-key]");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET JSON with retries. Returns null on any failure (never throws). */
export async function getJson<T = any>(url: string, opts: FetchOpts = {}): Promise<T | null> {
  const retries = opts.retries ?? 1;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        // Retry only on transient/blocking statuses
        if (![401, 403, 429, 500, 502, 503, 504].includes(res.status)) break;
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await wait(Number.isFinite(retryAfter) ? Math.min(2000, retryAfter * 1000) : 250 * (attempt + 1));
        }
        continue;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) console.warn(`[provider] getJson failed: ${redactSecrets(lastErr)}`);
  return null;
}

/** GET text with retries. Returns null on any failure (never throws). */
export async function getText(url: string, opts: FetchOpts = {}): Promise<string | null> {
  const retries = opts.retries ?? 1;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        if (![401, 403, 429, 500, 502, 503, 504].includes(res.status)) break;
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await wait(Number.isFinite(retryAfter) ? Math.min(2000, retryAfter * 1000) : 250 * (attempt + 1));
        }
        continue;
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) console.warn(`[provider] getText failed: ${redactSecrets(lastErr)}`);
  return null;
}

/** Parse a number from messy input (commas, %, strings). Returns null if not finite. */
export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Round to 2 decimals, returning null for non-finite input. */
export function round2(value: unknown): number | null {
  const n = toFloat(value);
  if (n === null) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Run a provider call with a hard timeout, resolving to null on timeout/failure. */
export async function safeCall<T>(fn: () => Promise<T>, timeoutMs: number, label = "call"): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
      try {
        return await fn();
      } catch (err) {
        console.warn(`[provider] ${label} failed: ${redactSecrets(err)}`);
        return null;
      }
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Normalize an Indian symbol: strip exchange suffixes, upper-case. */
export function baseSymbol(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "");
}
