/**
 * Technical indicators computed from the daily price history already in the
 * dashboard payload. No extra provider calls, no API keys.
 *
 * Every function returns `null` rather than a partial or padded result when
 * the series is too short for the requested period. An RSI computed from four
 * days of data is not a weak signal — it is a meaningless one, and rendering
 * it next to real indicators would imply a confidence that doesn't exist.
 *
 * Pure and dependency-free so each formula is directly testable.
 */

import type { PricePoint } from "@/shared/price-stats";

export type Candle = { date: string; close: number; high: number; low: number; volume: number };

/**
 * Normalise and order the series. Providers disagree on ordering, and a
 * reversed series silently inverts every trend signal here — a death cross
 * would read as a golden cross.
 */
export function toCandles(history: PricePoint[] | null | undefined): Candle[] {
  if (!Array.isArray(history)) return [];
  const candles: Candle[] = [];
  for (const point of history) {
    const close = Number(point?.close);
    const time = Date.parse(`${point?.date}T00:00:00Z`);
    if (!Number.isFinite(close) || close <= 0 || Number.isNaN(time)) continue;
    const high = Number(point?.high);
    const low = Number(point?.low);
    const volume = Number(point?.volume);
    candles.push({
      date: point.date,
      close,
      // Fall back to close so a provider that omits OHLC still yields usable
      // (if degenerate) ranges rather than NaN propagating through everything.
      high: Number.isFinite(high) && high > 0 ? high : close,
      low: Number.isFinite(low) && low > 0 ? low : close,
      volume: Number.isFinite(volume) && volume >= 0 ? volume : 0,
    });
  }
  return candles.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

const closesOf = (candles: Candle[]) => candles.map((candle) => candle.close);

// ---------------------------------------------------------------------------
// Moving averages
// ---------------------------------------------------------------------------

/** Simple moving average of the last `period` closes. */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values.
 * Seeding this way (rather than with the first value alone) is the standard
 * convention and stops the earliest point from dominating the whole series.
 */
export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length ? series[series.length - 1] : null;
}

/** Full EMA series, aligned to the end of `values`. */
export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const multiplier = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const out = [seed];
  for (let index = period; index < values.length; index += 1) {
    out.push((values[index] - out[out.length - 1]) * multiplier + out[out.length - 1]);
  }
  return out;
}

export type MovingAverageView = {
  sma50: number | null;
  sma200: number | null;
  priceVsSma50Percent: number | null;
  priceVsSma200Percent: number | null;
  /** Golden cross = 50DMA above 200DMA; death cross = below. */
  trend: "golden-cross" | "death-cross" | null;
};

export function movingAverages(history: PricePoint[] | null | undefined): MovingAverageView | null {
  const candles = toCandles(history);
  if (!candles.length) return null;
  const closes = closesOf(candles);
  const price = closes[closes.length - 1];

  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  if (sma50 === null && sma200 === null) return null;

  return {
    sma50,
    sma200,
    priceVsSma50Percent: sma50 === null ? null : ((price - sma50) / sma50) * 100,
    priceVsSma200Percent: sma200 === null ? null : ((price - sma200) / sma200) * 100,
    trend:
      sma50 === null || sma200 === null ? null : sma50 >= sma200 ? "golden-cross" : "death-cross",
  };
}

// ---------------------------------------------------------------------------
// Momentum
// ---------------------------------------------------------------------------

export type RsiReading = {
  value: number;
  zone: "oversold" | "neutral" | "overbought";
};

/**
 * Wilder's RSI. Uses his smoothing (not a plain average of the last n changes),
 * which is what every charting package plots — a simple mean would produce
 * visibly different numbers from the ones users see elsewhere.
 */
export function rsi(history: PricePoint[] | null | undefined, period = 14): RsiReading | null {
  const closes = closesOf(toCandles(history));
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  // No down-moves at all: RSI is 100 by definition, and guarding here avoids
  // a divide-by-zero producing NaN.
  const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  if (!Number.isFinite(value)) return null;

  return {
    value,
    zone: value >= 70 ? "overbought" : value <= 30 ? "oversold" : "neutral",
  };
}

export type MacdReading = {
  macd: number;
  signal: number;
  histogram: number;
  crossover: "bullish" | "bearish";
};

/** MACD(12, 26, 9). */
export function macd(history: PricePoint[] | null | undefined): MacdReading | null {
  const closes = closesOf(toCandles(history));
  if (closes.length < 26 + 9) return null;

  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  if (!fast.length || !slow.length) return null;

  // The two EMA series start at different offsets; align them on their ends so
  // each MACD value pairs the same day's fast and slow averages.
  const offset = fast.length - slow.length;
  const macdLine = slow.map((slowValue, index) => fast[index + offset] - slowValue);

  const signalSeries = emaSeries(macdLine, 9);
  if (!signalSeries.length) return null;

  const macdValue = macdLine[macdLine.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  const histogram = macdValue - signal;

  return {
    macd: macdValue,
    signal,
    histogram,
    crossover: histogram >= 0 ? "bullish" : "bearish",
  };
}

// ---------------------------------------------------------------------------
// Volatility bands
// ---------------------------------------------------------------------------

export type BollingerReading = {
  upper: number;
  middle: number;
  lower: number;
  /** 0 = at the lower band, 100 = at the upper. Unclamped: outside is meaningful. */
  percentB: number;
  /** Band width as a share of the middle band — a squeeze indicator. */
  bandwidthPercent: number;
};

export function bollingerBands(
  history: PricePoint[] | null | undefined,
  period = 20,
  deviations = 2
): BollingerReading | null {
  const closes = closesOf(toCandles(history));
  if (closes.length < period) return null;

  const window = closes.slice(-period);
  const middle = window.reduce((sum, value) => sum + value, 0) / period;
  // Population standard deviation: the window *is* the population for the band.
  const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
  const deviation = Math.sqrt(variance);
  if (deviation === 0) return null;

  const upper = middle + deviations * deviation;
  const lower = middle - deviations * deviation;
  const price = closes[closes.length - 1];

  return {
    upper,
    middle,
    lower,
    percentB: ((price - lower) / (upper - lower)) * 100,
    bandwidthPercent: ((upper - lower) / middle) * 100,
  };
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export type VolumeView = {
  latest: number;
  average20: number;
  average50: number;
  /** Latest volume as a multiple of the 20-day average. */
  relativeVolume: number;
  /** A spike is conventionally 2x the recent average. */
  isSpike: boolean;
  trend: "rising" | "falling" | "steady";
};

export function volumeProfile(history: PricePoint[] | null | undefined): VolumeView | null {
  const candles = toCandles(history);
  if (candles.length < 50) return null;

  const volumes = candles.map((candle) => candle.volume);
  // Providers frequently return 0 volume for every row; averaging that yields
  // a relativeVolume of NaN or Infinity, so bail rather than render nonsense.
  if (volumes.every((volume) => volume === 0)) return null;

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const average20 = mean(volumes.slice(-20));
  const average50 = mean(volumes.slice(-50));
  if (average20 === 0 || average50 === 0) return null;

  const latest = volumes[volumes.length - 1];
  const relativeVolume = latest / average20;
  const ratio = average20 / average50;

  return {
    latest,
    average20,
    average50,
    relativeVolume,
    isSpike: relativeVolume >= 2,
    trend: ratio > 1.1 ? "rising" : ratio < 0.9 ? "falling" : "steady",
  };
}

// ---------------------------------------------------------------------------
// Support / resistance
// ---------------------------------------------------------------------------

export type PivotLevels = {
  pivot: number;
  resistance1: number;
  resistance2: number;
  support1: number;
  support2: number;
};

/** Classic floor-trader pivots from the most recent completed session. */
export function pivotLevels(history: PricePoint[] | null | undefined): PivotLevels | null {
  const candles = toCandles(history);
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  // A degenerate session (high === low, typical of a synthesised row) produces
  // pivots stacked on one price, which is noise dressed as levels.
  if (last.high <= last.low) return null;

  const pivot = (last.high + last.low + last.close) / 3;
  return {
    pivot,
    resistance1: 2 * pivot - last.low,
    resistance2: pivot + (last.high - last.low),
    support1: 2 * pivot - last.high,
    support2: pivot - (last.high - last.low),
  };
}
