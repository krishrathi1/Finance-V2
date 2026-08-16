/**
 * Rolling-window returns over the daily price history already in the payload.
 *
 * A trailing return answers "what did the last three years do", which is one
 * observation of one start date. Move that start date back a month and the
 * number can change completely — which is why a stock can advertise a superb
 * 5-year CAGR that nobody actually earned unless they bought on exactly the
 * right day.
 *
 * Rolling returns answer the honest version: across *every* start date in the
 * history, what did holding for N years return? The distribution — worst case,
 * median, and how often the window ended up at all — is the part that tells
 * someone what they were realistically signing up for.
 *
 * Pure and dependency-free.
 */

import type { PricePoint } from "@/shared/price-stats";
import { TRADING_DAYS_PER_YEAR } from "@/shared/price-stats";

type Point = { date: string; close: number; time: number };

/**
 * Drop unusable rows, order chronologically, and collapse duplicate dates.
 *
 * Duplicates matter more here than elsewhere: windows are indexed by position,
 * so a repeated date shifts every window's true span and quietly makes a "1Y"
 * window shorter than a year.
 */
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

function median(sortedAscending: number[]): number {
  const middle = Math.floor(sortedAscending.length / 2);
  return sortedAscending.length % 2 === 0
    ? (sortedAscending[middle - 1] + sortedAscending[middle]) / 2
    : sortedAscending[middle];
}

export type RollingWindowStat = {
  label: string;
  windowDays: number;
  /** Distinct start dates tested. */
  windows: number;
  bestPercent: number;
  worstPercent: number;
  medianPercent: number;
  averagePercent: number;
  /** Share of windows that ended above where they started, 0-100. */
  positiveSharePercent: number;
  /** Share of windows that beat the comparison rate, 0-100. */
  aboveBenchmarkPercent: number;
  /** Windows past a year are annualised so the labels are comparable. */
  annualised: boolean;
};

const WINDOWS: Array<{ label: string; days: number }> = [
  { label: "1Y", days: TRADING_DAYS_PER_YEAR },
  { label: "3Y", days: TRADING_DAYS_PER_YEAR * 3 },
  { label: "5Y", days: TRADING_DAYS_PER_YEAR * 5 },
];

/**
 * A fixed deposit is the return an Indian retail investor gives up to hold
 * equity, which makes it the honest bar for "was this worth the risk".
 */
export const DEFAULT_BENCHMARK_PERCENT = 7;

/**
 * Rolling returns for each window the history can actually cover.
 *
 * Windows the series is too short for are omitted rather than computed from a
 * truncated span — reporting a 2-year result under a "5Y" label is the exact
 * overstatement this function exists to prevent. A window needs at least
 * `minWindows` distinct start dates before it is reported, because a
 * "distribution" of three observations has no worst case worth quoting.
 */
export function rollingReturns(
  history: PricePoint[] | null | undefined,
  benchmarkPercent = DEFAULT_BENCHMARK_PERCENT,
  minWindows = 30
): RollingWindowStat[] {
  const points = clean(history);
  if (points.length < 2) return [];

  const out: RollingWindowStat[] = [];

  for (const window of WINDOWS) {
    const windowCount = points.length - window.days;
    if (windowCount < minWindows) continue;

    const years = window.days / TRADING_DAYS_PER_YEAR;
    const annualised = years > 1;

    const returns: number[] = [];
    for (let start = 0; start + window.days < points.length; start += 1) {
      const from = points[start].close;
      const to = points[start + window.days].close;
      const total = (to - from) / from;
      // `from` is guaranteed positive by clean(), so total > -1 and the
      // fractional power below is always real.
      const percent = annualised ? (Math.pow(1 + total, 1 / years) - 1) * 100 : total * 100;
      if (Number.isFinite(percent)) returns.push(percent);
    }

    if (returns.length < minWindows) continue;

    const sorted = [...returns].sort((a, b) => a - b);
    const total = returns.reduce((sum, value) => sum + value, 0);

    out.push({
      label: window.label,
      windowDays: window.days,
      windows: returns.length,
      bestPercent: sorted[sorted.length - 1],
      worstPercent: sorted[0],
      medianPercent: median(sorted),
      averagePercent: total / returns.length,
      positiveSharePercent: (returns.filter((value) => value > 0).length / returns.length) * 100,
      aboveBenchmarkPercent:
        (returns.filter((value) => value > benchmarkPercent).length / returns.length) * 100,
      annualised,
    });
  }

  return out;
}

export type ConsistencyVerdict = {
  /** The window the verdict is drawn from. */
  label: string;
  /** Share of windows that beat the benchmark, 0-100. */
  reliabilityPercent: number;
  verdict: "dependable" | "mixed" | "unreliable";
  summary: string;
};

/**
 * A single plain-language read on the longest window available.
 *
 * The longest window is used deliberately: a stock can look consistent over
 * one year purely because the sample sits inside one bull run, and only a
 * longer window covers a full cycle.
 */
export function consistencyVerdict(
  stats: RollingWindowStat[],
  benchmarkPercent = DEFAULT_BENCHMARK_PERCENT
): ConsistencyVerdict | null {
  if (!stats.length) return null;
  const longest = stats[stats.length - 1];

  const reliabilityPercent = longest.aboveBenchmarkPercent;
  const verdict: ConsistencyVerdict["verdict"] =
    reliabilityPercent >= 75 ? "dependable" : reliabilityPercent >= 50 ? "mixed" : "unreliable";

  const period = longest.annualised ? "per year" : "in total";
  const summary =
    `Across ${longest.windows.toLocaleString("en-IN")} overlapping ${longest.label} holding periods, ` +
    `${reliabilityPercent.toFixed(0)}% beat ${benchmarkPercent}% ${period}. ` +
    `The worst returned ${longest.worstPercent.toFixed(1)}%, the median ${longest.medianPercent.toFixed(1)}%.`;

  return { label: longest.label, reliabilityPercent, verdict, summary };
}
