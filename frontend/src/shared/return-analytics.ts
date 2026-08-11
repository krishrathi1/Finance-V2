/**
 * Return and downside-risk analytics over the daily price history already in
 * the dashboard payload.
 *
 * Where `price-stats.ts` answers "what has this done overall", these answer
 * "over which periods, and how bad does the bad side get" — the questions that
 * separate a stock that drifted up smoothly from one that got there through
 * violent swings.
 *
 * Pure and dependency-free.
 */

import type { PricePoint } from "@/shared/price-stats";
import { TRADING_DAYS_PER_YEAR } from "@/shared/price-stats";

type Point = { date: string; close: number; time: number };

function clean(history: PricePoint[] | null | undefined): Point[] {
  if (!Array.isArray(history)) return [];
  const out: Point[] = [];
  for (const point of history) {
    const close = Number(point?.close);
    const time = Date.parse(`${point?.date}T00:00:00Z`);
    if (!Number.isFinite(close) || close <= 0 || Number.isNaN(time)) continue;
    out.push({ date: point.date, close, time });
  }
  return out.sort((a, b) => a.time - b.time);
}

function dailyReturns(points: Point[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    returns.push((points[index].close - points[index - 1].close) / points[index - 1].close);
  }
  return returns;
}

// ---------------------------------------------------------------------------
// Trailing returns
// ---------------------------------------------------------------------------

export type TrailingReturn = {
  label: string;
  days: number;
  percent: number;
  /** Annualised for windows beyond a year, so they're comparable. */
  annualised: boolean;
};

const TRAILING_WINDOWS: Array<{ label: string; days: number }> = [
  { label: "1M", days: 21 },
  { label: "3M", days: 63 },
  { label: "6M", days: 126 },
  { label: "1Y", days: 252 },
  { label: "3Y", days: 756 },
  { label: "5Y", days: 1260 },
];

/**
 * Point-to-point returns over standard windows, counted in trading days.
 *
 * Windows longer than a year are annualised so "3Y" and "1Y" can sit in the
 * same row without the longer one looking artificially spectacular. Windows
 * the series is too short to cover are omitted rather than clamped to the
 * full history, which would silently mislabel a 2-year return as "5Y".
 */
export function trailingReturns(history: PricePoint[] | null | undefined): TrailingReturn[] {
  const points = clean(history);
  if (points.length < 2) return [];

  const latest = points[points.length - 1];
  const out: TrailingReturn[] = [];

  for (const window of TRAILING_WINDOWS) {
    const startIndex = points.length - 1 - window.days;
    if (startIndex < 0) continue;
    const start = points[startIndex];
    const total = (latest.close - start.close) / start.close;
    const years = window.days / TRADING_DAYS_PER_YEAR;
    const annualised = years > 1;
    const percent = annualised ? (Math.pow(1 + total, 1 / years) - 1) * 100 : total * 100;
    if (!Number.isFinite(percent)) continue;
    out.push({ label: window.label, days: window.days, percent, annualised });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Calendar-year returns
// ---------------------------------------------------------------------------

export type CalendarYearReturn = {
  year: number;
  percent: number;
  /** False when the series doesn't cover the whole year (first/current year). */
  complete: boolean;
};

/**
 * Return for each calendar year in the series.
 *
 * Partial years are flagged rather than dropped: the current year is the one
 * users most want to see, and the first year in a 5-year window is usually
 * partial too. Labelling them beats silently presenting a stub year alongside
 * full ones as if they were comparable.
 */
export function calendarYearReturns(history: PricePoint[] | null | undefined): CalendarYearReturn[] {
  const points = clean(history);
  if (points.length < 2) return [];

  const byYear = new Map<number, Point[]>();
  for (const point of points) {
    const year = new Date(point.time).getUTCFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(point);
    else byYear.set(year, [point]);
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const out: CalendarYearReturn[] = [];

  for (let index = 0; index < years.length; index += 1) {
    const year = years[index];
    const bucket = byYear.get(year)!;
    if (bucket.length < 2) continue;

    // Measure from the previous year's close where available, so January's
    // move belongs to the year it happened in rather than being skipped.
    const previousYear = byYear.get(years[index - 1]);
    const open = previousYear ? previousYear[previousYear.length - 1].close : bucket[0].close;
    const close = bucket[bucket.length - 1].close;
    const percent = ((close - open) / open) * 100;
    if (!Number.isFinite(percent)) continue;

    const firstMonth = new Date(bucket[0].time).getUTCMonth();
    const lastMonth = new Date(bucket[bucket.length - 1].time).getUTCMonth();
    out.push({
      year,
      percent,
      complete: Boolean(previousYear) && firstMonth === 0 ? lastMonth === 11 : firstMonth === 0 && lastMonth === 11,
    });
  }

  return out.sort((a, b) => b.year - a.year);
}

// ---------------------------------------------------------------------------
// Downside risk
// ---------------------------------------------------------------------------

export type DownsideRisk = {
  /** Historical 95% one-day Value at Risk, as a positive percentage. */
  valueAtRisk95: number;
  /** Mean loss on the worst 5% of days (conditional VaR / expected shortfall). */
  expectedShortfall95: number;
  /** Annualised standard deviation of negative returns only. */
  downsideDeviation: number;
  /** Excess return per unit of downside deviation. */
  sortinoRatio: number | null;
  worstDayPercent: number;
};

/**
 * Downside-focused risk measures.
 *
 * Plain volatility punishes upside and downside equally, which misprices a
 * stock that jumps violently upward. These look only at losses.
 *
 * VaR is historical (the empirical 5th percentile) rather than assuming a
 * normal distribution — equity returns have fat tails, and a normal model
 * understates exactly the crash risk this is meant to quantify.
 */
export function downsideRisk(
  history: PricePoint[] | null | undefined,
  /** Annual risk-free rate as a decimal. India's ~10Y G-Sec is a fair default. */
  riskFreeRate = 0.07
): DownsideRisk | null {
  const points = clean(history);
  const returns = dailyReturns(points);
  // Below ~2 months the 5th percentile is a single observation, which is noise.
  if (returns.length < 40) return null;

  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.max(0, Math.floor(sorted.length * 0.05) - 1);
  const valueAtRisk95 = Math.abs(sorted[cutoff]) * 100;

  const tail = sorted.slice(0, cutoff + 1);
  const expectedShortfall95 =
    Math.abs(tail.reduce((sum, value) => sum + value, 0) / tail.length) * 100;

  const negatives = returns.filter((value) => value < 0);
  if (!negatives.length) return null;
  const downsideVariance =
    negatives.reduce((sum, value) => sum + value ** 2, 0) / negatives.length;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

  const meanDaily = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const annualisedReturn = (Math.pow(1 + meanDaily, TRADING_DAYS_PER_YEAR) - 1) * 100;
  const sortinoRatio =
    downsideDeviation > 0 ? (annualisedReturn - riskFreeRate * 100) / downsideDeviation : null;

  return {
    valueAtRisk95,
    expectedShortfall95,
    downsideDeviation,
    sortinoRatio: sortinoRatio !== null && Number.isFinite(sortinoRatio) ? sortinoRatio : null,
    worstDayPercent: sorted[0] * 100,
  };
}

// ---------------------------------------------------------------------------
// Volatility regime
// ---------------------------------------------------------------------------

export type VolatilityRegime = {
  recentPercent: number;
  baselinePercent: number;
  ratio: number;
  regime: "calm" | "normal" | "elevated";
};

/**
 * Recent (30-day) volatility against the full-period baseline.
 *
 * The absolute volatility number means little without context — 25% is calm
 * for a smallcap and alarming for an FMCG major. The ratio says whether *this*
 * stock is currently moving unusually for itself.
 */
export function volatilityRegime(history: PricePoint[] | null | undefined): VolatilityRegime | null {
  const points = clean(history);
  const returns = dailyReturns(points);
  if (returns.length < 60) return null;

  const annualisedStdDev = (values: number[]) => {
    if (values.length < 2) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  };

  const recentPercent = annualisedStdDev(returns.slice(-30));
  const baselinePercent = annualisedStdDev(returns);
  if (recentPercent === null || baselinePercent === null || baselinePercent === 0) return null;

  const ratio = recentPercent / baselinePercent;
  return {
    recentPercent,
    baselinePercent,
    ratio,
    regime: ratio > 1.25 ? "elevated" : ratio < 0.75 ? "calm" : "normal",
  };
}
