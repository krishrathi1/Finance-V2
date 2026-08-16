/**
 * Underwater analysis — how long this stock spends below its previous high,
 * and how long it takes to climb back.
 *
 * `price-stats.ts` reports the single deepest drawdown, which answers "how bad
 * did it get". It does not answer the question that actually decides whether
 * someone can hold a position: *how long*. A 30% fall that recovers in four
 * months and a 30% fall still unrecovered three years later produce the same
 * `maxDrawdown` figure and are completely different experiences.
 *
 * "Underwater" means the price sits below a high it has previously reached.
 * The time spent there is the time a holder spent watching a position worth
 * less than it once was, which is when people sell at the bottom.
 *
 * Pure and dependency-free.
 */

import type { PricePoint } from "@/shared/price-stats";

type Point = { date: string; close: number; time: number };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clean(history: PricePoint[] | null | undefined): Point[] {
  if (!Array.isArray(history)) return [];
  const points: Point[] = [];
  for (const point of history) {
    const close = Number(point?.close);
    const time = Date.parse(`${point?.date}T00:00:00Z`);
    if (!Number.isFinite(close) || close <= 0 || Number.isNaN(time)) continue;
    points.push({ date: point.date, close, time });
  }
  points.sort((a, b) => a.time - b.time);

  const deduped: Point[] = [];
  let lastTime = Number.NaN;
  for (const point of points) {
    if (point.time === lastTime) continue;
    deduped.push(point);
    lastTime = point.time;
  }
  return deduped;
}

export type UnderwaterSpell = {
  /** The high the price fell away from. */
  peakDate: string;
  peakPrice: number;
  troughDate: string;
  troughPrice: number;
  /** Deepest point of this spell, as a negative percentage. */
  depthPercent: number;
  /** Calendar days from the peak until the peak was regained, or until today. */
  days: number;
  /** Calendar days from the trough back to the old peak. Null if still under. */
  recoveryDays: number | null;
  /** Date the old peak was regained. Null while still underwater. */
  recoveredOn: string | null;
  recovered: boolean;
};

export type DrawdownAnalysis = {
  spells: UnderwaterSpell[];
  /** Share of the whole history spent below a previous high, 0-100. */
  timeUnderwaterPercent: number;
  /** The longest single stretch below a previous high, in calendar days. */
  longestUnderwaterDays: number;
  longestUnderwaterSpell: UnderwaterSpell | null;
  /** The deepest spell, whether or not it was the longest. */
  deepestSpell: UnderwaterSpell | null;
  /** Median days to recover, across spells that did recover. Null if none did. */
  medianRecoveryDays: number | null;
  /** Set when the series ends below a previous high. */
  currentlyUnderwater: boolean;
  currentDepthPercent: number | null;
  currentUnderwaterDays: number | null;
  /** Calendar days the series covers, the denominator for the share above. */
  totalDays: number;
};

/**
 * Only spells at least this deep are counted.
 *
 * Without a floor, every one-tick dip below a high registers as a drawdown and
 * the "time underwater" figure approaches 100% for every stock — technically
 * true and completely uninformative. 5% is roughly where a move stops being
 * noise for Indian equity.
 */
export const MIN_SPELL_DEPTH_PERCENT = 5;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Break the series into underwater spells and summarise them.
 *
 * Returns null for a series too short to contain one, or one that never fell
 * far enough below a high to count. A stock that only ever rose has no
 * underwater history, and reporting "0 days underwater" against an empty spell
 * list would read as a computation that failed rather than a clean record.
 */
export function drawdownAnalysis(
  history: PricePoint[] | null | undefined,
  minDepthPercent = MIN_SPELL_DEPTH_PERCENT
): DrawdownAnalysis | null {
  const points = clean(history);
  if (points.length < 2) return null;

  const spells: UnderwaterSpell[] = [];

  let peak = points[0];
  let trough: Point | null = null;
  let underwaterSince: Point | null = null;

  const closeSpell = (recoveredOn: Point | null) => {
    if (!underwaterSince || !trough) return;
    const depthPercent = ((trough.close - peak.close) / peak.close) * 100;
    // Judge depth at close, not on entry: a dip that never got deep enough was
    // never a drawdown worth naming.
    if (depthPercent <= -minDepthPercent) {
      const end = recoveredOn ?? points[points.length - 1];
      spells.push({
        peakDate: peak.date,
        peakPrice: peak.close,
        troughDate: trough.date,
        troughPrice: trough.close,
        depthPercent,
        days: Math.round((end.time - peak.time) / MS_PER_DAY),
        recoveryDays: recoveredOn
          ? Math.round((recoveredOn.time - trough.time) / MS_PER_DAY)
          : null,
        recoveredOn: recoveredOn ? recoveredOn.date : null,
        recovered: Boolean(recoveredOn),
      });
    }
    trough = null;
    underwaterSince = null;
  };

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];

    if (point.close >= peak.close) {
      // Regained the old high — whatever spell was running ends here.
      closeSpell(point);
      peak = point;
      continue;
    }

    if (!underwaterSince) underwaterSince = point;
    if (!trough || point.close < trough.close) trough = point;
  }

  // The series may simply end while still below a high.
  closeSpell(null);

  if (!spells.length) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const totalDays = Math.max(1, Math.round((last.time - first.time) / MS_PER_DAY));

  const underwaterDays = spells.reduce((sum, spell) => sum + spell.days, 0);

  const longestUnderwaterSpell = spells.reduce((longest, spell) =>
    spell.days > longest.days ? spell : longest
  );
  const deepestSpell = spells.reduce((deepest, spell) =>
    spell.depthPercent < deepest.depthPercent ? spell : deepest
  );

  const recoveryDays = spells
    .map((spell) => spell.recoveryDays)
    .filter((days): days is number => days !== null);

  const openSpell = spells.find((spell) => !spell.recovered) ?? null;

  return {
    // Deepest first — that is the one a reader wants to see.
    spells: [...spells].sort((a, b) => a.depthPercent - b.depthPercent),
    // Spells never overlap (each ends where the next high is regained), so
    // summing their spans cannot exceed the period.
    timeUnderwaterPercent: Math.min(100, (underwaterDays / totalDays) * 100),
    longestUnderwaterDays: longestUnderwaterSpell.days,
    longestUnderwaterSpell,
    deepestSpell,
    medianRecoveryDays: median(recoveryDays),
    currentlyUnderwater: Boolean(openSpell),
    currentDepthPercent: openSpell
      ? ((last.close - openSpell.peakPrice) / openSpell.peakPrice) * 100
      : null,
    currentUnderwaterDays: openSpell ? openSpell.days : null,
    totalDays,
  };
}
