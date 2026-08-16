/**
 * Risk and return statistics derived from the daily price history the
 * dashboard already carries (~5 years of OHLCV).
 *
 * These answer the questions a price chart implies but never states: how hard
 * has this fallen before, how violently does it move day to day, and what has
 * holding it actually compounded at. All of it is computed from data already
 * in the payload — no extra provider calls.
 *
 * Pure and dependency-free so every formula is directly testable.
 */

export type PricePoint = {
  date: string;
  close?: number | null;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  volume?: number | null;
};

/** Indian equity markets trade ~252 days a year; the standard annualisation base. */
export const TRADING_DAYS_PER_YEAR = 252;

type CleanPoint = { date: string; close: number; time: number };

/**
 * Drop unusable rows and put the series in chronological order.
 *
 * Providers vary on ordering, and a reversed series would silently invert
 * every return in this file — turning a gain into a loss — so ordering is
 * enforced here rather than assumed.
 */
function cleanSeries(history: PricePoint[] | null | undefined): CleanPoint[] {
  if (!Array.isArray(history)) return [];
  const cleaned: CleanPoint[] = [];
  for (const point of history) {
    const close = Number(point?.close);
    const time = Date.parse(`${point?.date}T00:00:00Z`);
    // A zero or negative close is bad data, not a real price, and would make
    // the log return below -Infinity.
    if (!Number.isFinite(close) || close <= 0 || Number.isNaN(time)) continue;
    cleaned.push({ date: point.date, close, time });
  }
  cleaned.sort((a, b) => a.time - b.time);
  return cleaned;
}

export type DrawdownStat = {
  /** Peak-to-trough decline as a negative percentage. */
  percent: number;
  peakDate: string;
  peakPrice: number;
  troughDate: string;
  troughPrice: number;
  /** Trading days from peak to trough. */
  days: number;
  /** True once the series returns to the old peak. */
  recovered: boolean;
};

/**
 * Largest peak-to-trough decline over the series.
 *
 * Tracks the running maximum and the deepest fall below it — the standard
 * definition. Deliberately *not* "high minus low", which would report a
 * drawdown even when the low came first and no holder ever experienced it.
 */
export function maxDrawdown(history: PricePoint[] | null | undefined): DrawdownStat | null {
  const series = cleanSeries(history);
  if (series.length < 2) return null;

  let peak = series[0];
  let worst: DrawdownStat | null = null;
  let peakIndex = 0;
  let troughIndex = 0;

  for (let index = 1; index < series.length; index += 1) {
    const point = series[index];
    if (point.close > peak.close) {
      peak = point;
      peakIndex = index;
      continue;
    }
    const decline = ((point.close - peak.close) / peak.close) * 100;
    // `decline < 0` matters as much as the comparison against `worst`. A series
    // that never falls below its running peak (flat, or monotonically rising)
    // otherwise records a 0% "drawdown" complete with peak and trough dates,
    // which the UI renders as a real statistic. Requiring an actual decline
    // makes both no-decline shapes return null alike, rather than a flat series
    // reporting a drawdown while a rising one reports none.
    if (decline < 0 && (worst === null || decline < worst.percent)) {
      troughIndex = index;
      worst = {
        percent: decline,
        peakDate: peak.date,
        peakPrice: peak.close,
        troughDate: point.date,
        troughPrice: point.close,
        days: index - peakIndex,
        recovered: false,
      };
    }
  }

  if (worst === null) return null;

  // Recovered only if price regained the old peak *after* the trough.
  worst.recovered = series.slice(troughIndex + 1).some((point) => point.close >= worst!.peakPrice);
  return worst;
}

/**
 * Annualised volatility: the standard deviation of daily log returns, scaled
 * by √252. Returned as a percentage.
 *
 * Log returns rather than simple percentage changes so that a rise and an
 * equal-sized fall cancel symmetrically — the property that makes the
 * √time scaling valid in the first place.
 */
export function annualisedVolatility(history: PricePoint[] | null | undefined): number | null {
  const series = cleanSeries(history);
  if (series.length < 3) return null;

  const returns: number[] = [];
  for (let index = 1; index < series.length; index += 1) {
    returns.push(Math.log(series[index].close / series[index - 1].close));
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  // Sample variance (n-1): these returns are a sample of the return-generating
  // process, not the entire population.
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const result = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  return Number.isFinite(result) ? result : null;
}

/**
 * Compound annual growth rate over the series, as a percentage.
 *
 * Uses elapsed calendar time, not the number of rows: holidays and missing
 * days would otherwise make the period look shorter and overstate the CAGR.
 * Returns null for spans under a month, where annualising noise produces
 * absurd figures.
 */
export function priceCagr(history: PricePoint[] | null | undefined): number | null {
  const series = cleanSeries(history);
  if (series.length < 2) return null;

  const first = series[0];
  const last = series[series.length - 1];
  const years = (last.time - first.time) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1 / 12) return null;

  const result = (Math.pow(last.close / first.close, 1 / years) - 1) * 100;
  return Number.isFinite(result) ? result : null;
}

export type RangePosition = {
  /** 0 = at the 52-week low, 100 = at the high. */
  percent: number;
  fromLowPercent: number;
  fromHighPercent: number;
};

/**
 * Where the current price sits within its 52-week range.
 *
 * Clamped to 0-100 because a live quote can legitimately sit outside a
 * 52-week band sourced at a different moment; an unclamped value would push a
 * progress bar past its track.
 */
export function rangePosition(
  current: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined
): RangePosition | null {
  const cmp = Number(current);
  const lo = Number(low);
  const hi = Number(high);
  if (![cmp, lo, hi].every((value) => Number.isFinite(value) && value > 0)) return null;
  if (hi <= lo) return null;

  const raw = ((cmp - lo) / (hi - lo)) * 100;
  return {
    percent: Math.min(100, Math.max(0, raw)),
    fromLowPercent: ((cmp - lo) / lo) * 100,
    fromHighPercent: ((cmp - hi) / hi) * 100,
  };
}

export type ReturnDistribution = {
  positiveDays: number;
  negativeDays: number;
  totalDays: number;
  positiveShare: number;
  bestDayPercent: number;
  worstDayPercent: number;
  /** Longest consecutive run of up days. */
  longestWinStreak: number;
  longestLossStreak: number;
};

/** Day-to-day behaviour: how often it rises, and its sharpest single moves. */
export function returnDistribution(
  history: PricePoint[] | null | undefined
): ReturnDistribution | null {
  const series = cleanSeries(history);
  if (series.length < 2) return null;

  let positiveDays = 0;
  let negativeDays = 0;
  let bestDayPercent = -Infinity;
  let worstDayPercent = Infinity;
  let winStreak = 0;
  let lossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;

  for (let index = 1; index < series.length; index += 1) {
    const change = ((series[index].close - series[index - 1].close) / series[index - 1].close) * 100;
    if (change > bestDayPercent) bestDayPercent = change;
    if (change < worstDayPercent) worstDayPercent = change;

    if (change > 0) {
      positiveDays += 1;
      winStreak += 1;
      lossStreak = 0;
      if (winStreak > longestWinStreak) longestWinStreak = winStreak;
    } else if (change < 0) {
      negativeDays += 1;
      lossStreak += 1;
      winStreak = 0;
      if (lossStreak > longestLossStreak) longestLossStreak = lossStreak;
    } else {
      // Flat days break both streaks without counting toward either.
      winStreak = 0;
      lossStreak = 0;
    }
  }

  const totalDays = series.length - 1;
  return {
    positiveDays,
    negativeDays,
    totalDays,
    positiveShare: totalDays > 0 ? (positiveDays / totalDays) * 100 : 0,
    bestDayPercent: Number.isFinite(bestDayPercent) ? bestDayPercent : 0,
    worstDayPercent: Number.isFinite(worstDayPercent) ? worstDayPercent : 0,
    longestWinStreak,
    longestLossStreak,
  };
}
