import { describe, expect, it } from "vitest";

import {
  bollingerBands,
  ema,
  macd,
  movingAverages,
  pivotLevels,
  rsi,
  sma,
  toCandles,
  volumeProfile,
} from "./technical-indicators";
import type { PricePoint } from "./price-stats";

function series(closes: number[]): PricePoint[] {
  // Spread across days so date parsing and ordering are exercised too.
  const start = Date.UTC(2020, 0, 1);
  return closes.map((close, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    close,
    high: close,
    low: close,
    volume: 1000,
  }));
}

/** A rising ramp of `n` closes. */
const ramp = (n: number, start = 100, step = 1) =>
  series(Array.from({ length: n }, (_, i) => start + i * step));

describe("toCandles", () => {
  it("orders chronologically regardless of input order", () => {
    const reversed = [...series([100, 110, 120])].reverse();
    expect(toCandles(reversed).map((c) => c.close)).toEqual([100, 110, 120]);
  });

  it("drops unusable rows", () => {
    const candles = toCandles([
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 0 },
      { date: "bad", close: 50 },
      { date: "2026-01-03", close: null },
      { date: "2026-01-04", close: 120 },
    ]);
    expect(candles.map((c) => c.close)).toEqual([100, 120]);
  });

  it("falls back to close when OHLC is absent, rather than emitting NaN", () => {
    const [candle] = toCandles([{ date: "2026-01-01", close: 100 }]);
    expect(candle.high).toBe(100);
    expect(candle.low).toBe(100);
    expect(candle.volume).toBe(0);
  });
});

describe("sma", () => {
  it("averages the last n values", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
  });

  it("returns null when the series is shorter than the period", () => {
    expect(sma([1, 2], 5)).toBeNull();
    expect(sma([], 1)).toBeNull();
    expect(sma([1, 2, 3], 0)).toBeNull();
  });
});

describe("ema", () => {
  it("equals the mean for a flat series", () => {
    expect(ema([5, 5, 5, 5, 5], 5)!).toBeCloseTo(5, 9);
  });

  it("tracks a rising series above its seed", () => {
    const value = ema([1, 2, 3, 4, 5, 6, 7, 8], 3)!;
    expect(value).toBeGreaterThan(3);
    expect(value).toBeLessThanOrEqual(8);
  });

  it("weights recent values more heavily than an SMA does", () => {
    // Needs more values than the period: at exactly `period` the EMA is still
    // its seed, which is the SMA, so the two are equal by construction.
    const values = [10, 10, 10, 10, 10, 10, 10, 20];
    expect(ema(values, 5)!).toBeGreaterThan(sma(values, 5)!);
  });

  it("equals the SMA when the series is exactly one period long", () => {
    const values = [10, 10, 10, 10, 20];
    expect(ema(values, 5)!).toBeCloseTo(sma(values, 5)!, 9);
  });

  it("returns null when too short", () => {
    expect(ema([1, 2], 5)).toBeNull();
  });
});

describe("movingAverages", () => {
  it("reports a golden cross when the 50DMA leads the 200DMA", () => {
    // A long ramp: recent prices exceed older ones, so 50DMA > 200DMA.
    const result = movingAverages(ramp(260))!;
    expect(result.trend).toBe("golden-cross");
    expect(result.sma50).toBeGreaterThan(result.sma200!);
    expect(result.priceVsSma200Percent).toBeGreaterThan(0);
  });

  it("reports a death cross on a sustained decline", () => {
    const result = movingAverages(ramp(260, 400, -1))!;
    expect(result.trend).toBe("death-cross");
    expect(result.priceVsSma200Percent).toBeLessThan(0);
  });

  it("omits the 200DMA when there isn't a year of data", () => {
    const result = movingAverages(ramp(60))!;
    expect(result.sma50).not.toBeNull();
    expect(result.sma200).toBeNull();
    // Without both averages a cross is undefined, not neutral.
    expect(result.trend).toBeNull();
  });

  it("returns null when even the 50DMA is unavailable", () => {
    expect(movingAverages(ramp(10))).toBeNull();
    expect(movingAverages([])).toBeNull();
  });
});

describe("rsi", () => {
  it("is 100 when every session is an up day", () => {
    // No losses at all — the divide-by-zero branch.
    expect(rsi(ramp(30))!.value).toBe(100);
    expect(rsi(ramp(30))!.zone).toBe("overbought");
  });

  it("is low on a sustained decline", () => {
    const reading = rsi(ramp(30, 400, -2))!;
    expect(reading.value).toBeLessThan(30);
    expect(reading.zone).toBe("oversold");
  });

  it("sits mid-range on an oscillating series", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const reading = rsi(series(closes))!;
    expect(reading.value).toBeGreaterThan(30);
    expect(reading.value).toBeLessThan(70);
    expect(reading.zone).toBe("neutral");
  });

  it("needs period+1 closes", () => {
    expect(rsi(ramp(14), 14)).toBeNull();
    expect(rsi(ramp(15), 14)).not.toBeNull();
  });
});

describe("macd", () => {
  /** Fall for `down` sessions, then rise for `up` — a genuine trend change. */
  function reversal(down: number, up: number, step = 2): PricePoint[] {
    const closes: number[] = [500];
    for (let i = 0; i < down; i += 1) closes.push(closes[closes.length - 1] - step);
    for (let i = 0; i < up; i += 1) closes.push(closes[closes.length - 1] + step);
    return series(closes);
  }

  it("turns bullish after a downtrend reverses upward", () => {
    const reading = macd(reversal(60, 60))!;
    expect(reading.crossover).toBe("bullish");
    expect(reading.histogram).toBeGreaterThan(0);
  });

  it("turns bearish after an uptrend rolls over", () => {
    const rising: number[] = [100];
    for (let i = 0; i < 60; i += 1) rising.push(rising[rising.length - 1] + 2);
    for (let i = 0; i < 60; i += 1) rising.push(rising[rising.length - 1] - 2);
    const reading = macd(series(rising))!;
    expect(reading.crossover).toBe("bearish");
    expect(reading.histogram).toBeLessThan(0);
  });

  it("produces a flat histogram on a perfectly linear trend", () => {
    // Degenerate by construction: with a constant slope the MACD line settles
    // at a constant, so its own EMA equals it and the histogram is zero. Worth
    // pinning down — it's why a straight ramp can't be used to test crossovers.
    const reading = macd(ramp(120))!;
    expect(reading.macd).toBeCloseTo(7, 6);
    expect(reading.histogram).toBeCloseTo(0, 6);
  });

  it("collapses to zero on a flat series", () => {
    const reading = macd(series(Array(120).fill(100)))!;
    expect(reading.macd).toBeCloseTo(0, 6);
    expect(reading.histogram).toBeCloseTo(0, 6);
  });

  it("needs enough data for the slow EMA plus the signal line", () => {
    expect(macd(ramp(30))).toBeNull();
    expect(macd(ramp(40))).not.toBeNull();
  });
});

describe("bollingerBands", () => {
  it("brackets the middle band symmetrically", () => {
    const closes = [10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 21];
    const bands = bollingerBands(series(closes), 20, 2)!;
    expect(bands.upper).toBeGreaterThan(bands.middle);
    expect(bands.lower).toBeLessThan(bands.middle);
    expect(bands.upper - bands.middle).toBeCloseTo(bands.middle - bands.lower, 9);
  });

  it("puts %B above 100 when price breaks the upper band", () => {
    const closes = [...Array(19).fill(100), 200];
    const bands = bollingerBands(series(closes), 20, 2)!;
    // Deliberately unclamped — a breakout is information, not an error.
    expect(bands.percentB).toBeGreaterThan(100);
  });

  it("returns null for a flat window, where the bands collapse", () => {
    expect(bollingerBands(series(Array(20).fill(100)), 20)).toBeNull();
  });

  it("returns null when shorter than the period", () => {
    expect(bollingerBands(ramp(10), 20)).toBeNull();
  });
});

describe("volumeProfile", () => {
  function withVolumes(volumes: number[]): PricePoint[] {
    const start = Date.UTC(2020, 0, 1);
    return volumes.map((volume, index) => ({
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      close: 100,
      volume,
    }));
  }

  it("flags a spike above twice the 20-day average", () => {
    const result = volumeProfile(withVolumes([...Array(59).fill(1000), 5000]))!;
    expect(result.relativeVolume).toBeGreaterThan(2);
    expect(result.isSpike).toBe(true);
  });

  it("does not flag ordinary activity", () => {
    const result = volumeProfile(withVolumes(Array(60).fill(1000)))!;
    expect(result.isSpike).toBe(false);
    expect(result.trend).toBe("steady");
  });

  it("detects a rising trend when recent volume outpaces the 50-day average", () => {
    const result = volumeProfile(withVolumes([...Array(40).fill(500), ...Array(20).fill(2000)]))!;
    expect(result.trend).toBe("rising");
  });

  it("returns null when the provider reports no volume at all", () => {
    // Averaging all-zero volume would make relativeVolume NaN.
    expect(volumeProfile(withVolumes(Array(60).fill(0)))).toBeNull();
  });

  it("returns null without at least 50 sessions", () => {
    expect(volumeProfile(withVolumes(Array(20).fill(1000)))).toBeNull();
  });
});

describe("pivotLevels", () => {
  it("orders supports below the pivot and resistances above", () => {
    const levels = pivotLevels([{ date: "2026-01-01", close: 105, high: 110, low: 100 }])!;
    expect(levels.pivot).toBeCloseTo(105, 9);
    expect(levels.support2).toBeLessThan(levels.support1);
    expect(levels.support1).toBeLessThan(levels.pivot);
    expect(levels.pivot).toBeLessThan(levels.resistance1);
    expect(levels.resistance1).toBeLessThan(levels.resistance2);
  });

  it("returns null for a degenerate session", () => {
    // high === low means no range; pivots would all stack on one price.
    expect(pivotLevels([{ date: "2026-01-01", close: 100 }])).toBeNull();
    expect(pivotLevels([])).toBeNull();
  });
});
