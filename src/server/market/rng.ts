// Deterministic seeded RNG utilities — the backbone of the market engine.
// Same symbol + same day always yields the same data, so every endpoint
// stays consistent without any external provider.

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic gaussian via Box-Muller */
export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Deterministic float in [min, max] from a string key */
export function seededFloat(key: string, min: number, max: number): number {
  const rand = mulberry32(hashString(key));
  return min + rand() * (max - min);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Normalise x from [lo, hi] into [0, 1], clamped */
export function norm(x: number | null | undefined, lo: number, hi: number): number {
  if (x === null || x === undefined || !Number.isFinite(x)) return 0.5;
  return clamp((x - lo) / (hi - lo), 0, 1);
}

/** Inverse: high value of metric → low score (for PE etc.) */
export function invNorm(x: number | null | undefined, lo: number, hi: number): number {
  return 1 - norm(x, lo, hi);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0.5;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** IST helpers — the whole engine runs on IST trading days */
export function istNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
}

export function istDateKey(d: Date = istNow()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** India market hours: 09:15–15:30 IST, Mon–Fri */
export function isMarketOpen(d: Date = istNow()): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = d.getHours() * 60 + d.getMinutes();
  return minutes >= 555 && minutes <= 930;
}

/** Progress through the trading session, 0..1 */
export function marketSessionProgress(d: Date = istNow()): number {
  const minutes = d.getHours() * 60 + d.getMinutes();
  return clamp((minutes - 555) / (930 - 555), 0, 1);
}
