import { describe, expect, it } from "vitest";

import { TRADING_DAYS_PER_YEAR } from "@/shared/price-stats";
import { consistencyVerdict, rollingReturns } from "@/shared/rolling-returns";

/** Daily series from 2015-01-01, one calendar day per close. */
function series(closes: number[]) {
  let day = Date.UTC(2015, 0, 1);
  return closes.map((close) => {
    const date = new Date(day).toISOString().slice(0, 10);
    day += 86_400_000;
    return { date, close };
  });
}

/** `count` closes compounding at `daily` per day from 100. */
function compounding(count: number, daily: number) {
  return series(Array.from({ length: count }, (_, index) => 100 * Math.pow(1 + daily, index)));
}

describe("rollingReturns", () => {
  it("omits windows the history cannot cover rather than truncating them", () => {
    // Two years of data can support 1Y windows but not 3Y or 5Y. Reporting a
    // 2-year result under a "5Y" label is the overstatement to avoid.
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 2, 0.0004));
    expect(stats.map((stat) => stat.label)).toEqual(["1Y"]);
  });

  it("reports every window a long history supports", () => {
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 6, 0.0004));
    expect(stats.map((stat) => stat.label)).toEqual(["1Y", "3Y", "5Y"]);
  });

  it("returns nothing for a series with too few windows to form a distribution", () => {
    // Just over a year of data leaves a handful of 1Y start dates — not enough
    // to quote a "worst case" from.
    expect(rollingReturns(compounding(TRADING_DAYS_PER_YEAR + 5, 0.0004))).toEqual([]);
    expect(rollingReturns([])).toEqual([]);
    expect(rollingReturns(null)).toEqual([]);
  });

  it("measures a steady compounder as consistently positive", () => {
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 3, 0.0004));
    const oneYear = stats.find((stat) => stat.label === "1Y")!;
    expect(oneYear.positiveSharePercent).toBe(100);
    expect(oneYear.worstPercent).toBeGreaterThan(0);
    // 0.04%/day over 252 days ≈ 10.6%.
    expect(oneYear.medianPercent).toBeCloseTo(10.6, 0);
  });

  it("annualises windows longer than a year, but not the one-year window", () => {
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 6, 0.0004));
    expect(stats.find((stat) => stat.label === "1Y")!.annualised).toBe(false);
    expect(stats.find((stat) => stat.label === "3Y")!.annualised).toBe(true);
    // Annualised, a constant compounder returns the same rate over any span.
    const oneYear = stats.find((stat) => stat.label === "1Y")!;
    const threeYear = stats.find((stat) => stat.label === "3Y")!;
    expect(threeYear.medianPercent).toBeCloseTo(oneYear.medianPercent, 0);
  });

  it("exposes a bad entry point that a single trailing return would hide", () => {
    // Rallies for a year, then halves and stays there. The trailing return from
    // the start is positive; plenty of individual 1Y windows are not.
    const rally = Array.from({ length: 300 }, (_, index) => 100 + index * 0.5);
    const crash = Array.from({ length: 400 }, () => 120);
    const stats = rollingReturns(series([...rally, ...crash]));
    const oneYear = stats.find((stat) => stat.label === "1Y")!;
    expect(oneYear.worstPercent).toBeLessThan(0);
    expect(oneYear.positiveSharePercent).toBeLessThan(100);
    expect(oneYear.bestPercent).toBeGreaterThan(0);
  });

  it("counts windows that beat the benchmark, not merely positive ones", () => {
    // ~1.3% a year: positive throughout, but well under a 7% deposit rate.
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 3, 0.00005), 7);
    const oneYear = stats.find((stat) => stat.label === "1Y")!;
    expect(oneYear.positiveSharePercent).toBe(100);
    expect(oneYear.aboveBenchmarkPercent).toBe(0);
  });

  it("collapses duplicate dates so a window still spans its full period", () => {
    const base = compounding(TRADING_DAYS_PER_YEAR * 2, 0.0004);
    const withDuplicates = base.flatMap((point, index) =>
      index % 10 === 0 ? [point, { ...point }] : [point]
    );
    const clean = rollingReturns(base).find((stat) => stat.label === "1Y")!;
    const duped = rollingReturns(withDuplicates).find((stat) => stat.label === "1Y")!;
    expect(duped.windows).toBe(clean.windows);
    expect(duped.medianPercent).toBeCloseTo(clean.medianPercent, 6);
  });

  it("sorts an out-of-order series before measuring", () => {
    const ordered = compounding(TRADING_DAYS_PER_YEAR * 2, 0.0004);
    const shuffled = [...ordered].reverse();
    expect(rollingReturns(shuffled)).toEqual(rollingReturns(ordered));
  });

  it("skips unusable rows instead of producing NaN", () => {
    const base = compounding(TRADING_DAYS_PER_YEAR * 2, 0.0004);
    const dirty = [
      ...base,
      { date: "2020-01-01", close: 0 },
      { date: "2020-01-02", close: -5 },
      { date: "bad", close: 100 },
    ];
    const stats = rollingReturns(dirty).find((stat) => stat.label === "1Y")!;
    expect(Number.isFinite(stats.medianPercent)).toBe(true);
    expect(Number.isFinite(stats.worstPercent)).toBe(true);
  });
});

describe("consistencyVerdict", () => {
  it("calls a reliable compounder dependable", () => {
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 6, 0.0006));
    const verdict = consistencyVerdict(stats)!;
    expect(verdict.label).toBe("5Y");
    expect(verdict.verdict).toBe("dependable");
    expect(verdict.reliabilityPercent).toBe(100);
  });

  it("calls a laggard unreliable", () => {
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 6, 0.00005));
    expect(consistencyVerdict(stats)!.verdict).toBe("unreliable");
  });

  it("draws its verdict from the longest window available", () => {
    const stats = rollingReturns(compounding(TRADING_DAYS_PER_YEAR * 2, 0.0004));
    expect(consistencyVerdict(stats)!.label).toBe("1Y");
  });

  it("returns null when there is nothing to judge", () => {
    expect(consistencyVerdict([])).toBeNull();
  });
});
