import { describe, expect, it } from "vitest";

import {
  TRADING_DAYS_PER_YEAR,
  annualisedVolatility,
  maxDrawdown,
  priceCagr,
  rangePosition,
  returnDistribution,
  type PricePoint,
} from "./price-stats";

/** Build a daily series from closes, starting at a fixed date. */
function series(closes: number[], startDay = 1): PricePoint[] {
  return closes.map((close, index) => ({
    date: `2026-01-${String(startDay + index).padStart(2, "0")}`,
    close,
  }));
}

describe("maxDrawdown", () => {
  it("measures peak to trough, not first to last", () => {
    // Rises to 200, collapses to 50, recovers to 120.
    const result = maxDrawdown(series([100, 200, 50, 120]));
    expect(result).not.toBeNull();
    expect(result!.percent).toBeCloseTo(-75, 6);
    expect(result!.peakPrice).toBe(200);
    expect(result!.troughPrice).toBe(50);
  });

  it("ignores a low that precedes the peak", () => {
    // Rising the whole way: nobody holding ever sat on a loss.
    const result = maxDrawdown(series([50, 100, 150, 200]));
    expect(result).toBeNull();
  });

  it("reports recovery only when the old peak is regained afterwards", () => {
    expect(maxDrawdown(series([100, 50, 100]))!.recovered).toBe(true);
    expect(maxDrawdown(series([100, 50, 99]))!.recovered).toBe(false);
  });

  it("finds the deepest of several declines", () => {
    const result = maxDrawdown(series([100, 90, 100, 40, 100, 80]));
    expect(result!.percent).toBeCloseTo(-60, 6);
    expect(result!.troughPrice).toBe(40);
  });

  it("records the peak and trough dates and the span between them", () => {
    const result = maxDrawdown(series([100, 200, 150, 50]));
    expect(result!.peakDate).toBe("2026-01-02");
    expect(result!.troughDate).toBe("2026-01-04");
    expect(result!.days).toBe(2);
  });

  it("returns null for too little data", () => {
    expect(maxDrawdown([])).toBeNull();
    expect(maxDrawdown(series([100]))).toBeNull();
    expect(maxDrawdown(null)).toBeNull();
  });

  it("sorts an out-of-order series before measuring", () => {
    // Same data reversed must give the same answer, not an inverted one.
    const forward = maxDrawdown(series([100, 200, 50]));
    const reversed = maxDrawdown([...series([100, 200, 50])].reverse());
    expect(reversed!.percent).toBeCloseTo(forward!.percent, 6);
  });

  it("skips unusable rows instead of producing NaN", () => {
    const result = maxDrawdown([
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 0 },
      { date: "2026-01-03", close: null },
      { date: "bad-date", close: 500 },
      { date: "2026-01-04", close: 50 },
    ]);
    expect(result!.percent).toBeCloseTo(-50, 6);
  });
});

describe("annualisedVolatility", () => {
  it("is zero for a perfectly flat series", () => {
    expect(annualisedVolatility(series([100, 100, 100, 100]))!).toBeCloseTo(0, 9);
  });

  it("is zero for constant compounding — steady growth is not volatility", () => {
    // A fixed 1% daily gain has identical log returns, so no dispersion.
    const closes = [100];
    for (let i = 0; i < 30; i += 1) closes.push(closes[closes.length - 1] * 1.01);
    expect(annualisedVolatility(series(closes))!).toBeCloseTo(0, 6);
  });

  it("scales the daily standard deviation by root-252", () => {
    // Alternating +10%/-10% log returns: |r| is constant, so the sample
    // std dev is computable in closed form.
    const closes = [100, 110, 99, 108.9, 98.01];
    const logs: number[] = [];
    for (let i = 1; i < closes.length; i += 1) logs.push(Math.log(closes[i] / closes[i - 1]));
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    const variance = logs.reduce((a, b) => a + (b - mean) ** 2, 0) / (logs.length - 1);
    const expected = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
    expect(annualisedVolatility(series(closes))!).toBeCloseTo(expected, 6);
  });

  it("rises with dispersion", () => {
    const calm = annualisedVolatility(series([100, 101, 100, 101, 100]))!;
    const wild = annualisedVolatility(series([100, 150, 70, 160, 60]))!;
    expect(wild).toBeGreaterThan(calm);
  });

  it("returns null when there aren't enough points", () => {
    expect(annualisedVolatility(series([100, 110]))).toBeNull();
    expect(annualisedVolatility([])).toBeNull();
  });
});

describe("priceCagr", () => {
  it("annualises a doubling over one year to ~100%", () => {
    const result = priceCagr([
      { date: "2025-01-01", close: 100 },
      { date: "2026-01-01", close: 200 },
    ]);
    expect(result!).toBeCloseTo(100, 0);
  });

  it("annualises a multi-year run", () => {
    // 8x over 3 years = 2x per year.
    const result = priceCagr([
      { date: "2023-01-01", close: 100 },
      { date: "2026-01-01", close: 800 },
    ]);
    expect(result!).toBeCloseTo(100, 0);
  });

  it("is negative for a decline", () => {
    const result = priceCagr([
      { date: "2025-01-01", close: 200 },
      { date: "2026-01-01", close: 100 },
    ]);
    expect(result!).toBeCloseTo(-50, 0);
  });

  it("refuses to annualise a span under a month", () => {
    // A 10% move in three days annualises to an absurd number.
    expect(
      priceCagr([
        { date: "2026-01-01", close: 100 },
        { date: "2026-01-04", close: 110 },
      ])
    ).toBeNull();
  });

  it("uses elapsed time, not row count", () => {
    // Two rows a year apart is 100%, regardless of how few rows there are.
    const sparse = priceCagr([
      { date: "2025-01-01", close: 100 },
      { date: "2026-01-01", close: 200 },
    ]);
    expect(sparse!).toBeCloseTo(100, 0);
  });
});

describe("rangePosition", () => {
  it("places the price within its band", () => {
    const result = rangePosition(150, 100, 200);
    expect(result!.percent).toBeCloseTo(50, 6);
    expect(result!.fromLowPercent).toBeCloseTo(50, 6);
    expect(result!.fromHighPercent).toBeCloseTo(-25, 6);
  });

  it("pins the ends at 0 and 100", () => {
    expect(rangePosition(100, 100, 200)!.percent).toBe(0);
    expect(rangePosition(200, 100, 200)!.percent).toBe(100);
  });

  it("clamps a live quote that has escaped the band", () => {
    // A fresh quote can exceed a 52-week band sourced moments earlier; an
    // unclamped value would overflow a progress bar.
    expect(rangePosition(250, 100, 200)!.percent).toBe(100);
    expect(rangePosition(50, 100, 200)!.percent).toBe(0);
  });

  it("still reports the true distance beyond the band", () => {
    expect(rangePosition(250, 100, 200)!.fromHighPercent).toBeCloseTo(25, 6);
  });

  it("returns null for a degenerate or missing range", () => {
    expect(rangePosition(150, 200, 100)).toBeNull();
    expect(rangePosition(150, 100, 100)).toBeNull();
    expect(rangePosition(null, 100, 200)).toBeNull();
    expect(rangePosition(150, 0, 200)).toBeNull();
  });
});

describe("returnDistribution", () => {
  it("counts up, down and flat days", () => {
    const result = returnDistribution(series([100, 110, 105, 105, 120]));
    expect(result!.totalDays).toBe(4);
    expect(result!.positiveDays).toBe(2);
    expect(result!.negativeDays).toBe(1);
    expect(result!.positiveShare).toBeCloseTo(50, 6);
  });

  it("finds the sharpest single moves", () => {
    const result = returnDistribution(series([100, 150, 75]));
    expect(result!.bestDayPercent).toBeCloseTo(50, 6);
    expect(result!.worstDayPercent).toBeCloseTo(-50, 6);
  });

  it("measures the longest streaks", () => {
    const result = returnDistribution(series([100, 101, 102, 103, 90, 89, 95]));
    expect(result!.longestWinStreak).toBe(3);
    expect(result!.longestLossStreak).toBe(2);
  });

  it("treats a flat day as breaking a streak", () => {
    const result = returnDistribution(series([100, 101, 101, 102]));
    expect(result!.longestWinStreak).toBe(1);
  });

  it("returns null for too little data", () => {
    expect(returnDistribution(series([100]))).toBeNull();
    expect(returnDistribution(null)).toBeNull();
  });
});
