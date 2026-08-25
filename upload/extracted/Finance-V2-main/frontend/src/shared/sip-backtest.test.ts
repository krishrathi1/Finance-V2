import { describe, expect, it } from "vitest";

import { sipBacktest } from "@/shared/sip-backtest";

/** Daily series from `start`, one calendar day per close. */
function series(closes: number[], start = Date.UTC(2020, 0, 1)) {
  let day = start;
  return closes.map((close) => {
    const date = new Date(day).toISOString().slice(0, 10);
    day += 86_400_000;
    return { date, close };
  });
}

const FLAT_3Y = series(Array(1100).fill(100));

describe("sipBacktest", () => {
  it("buys once a month and accumulates units at each month's price", () => {
    const result = sipBacktest(FLAT_3Y, { monthlyAmount: 10_000, years: 3 })!;
    // ~36 monthly instalments over three years of daily rows.
    expect(result.installments).toBeGreaterThanOrEqual(35);
    expect(result.installments).toBeLessThanOrEqual(37);
    expect(result.totalInvested).toBe(result.installments * 10_000);
    expect(result.unitsAccumulated).toBeCloseTo(result.totalInvested / 100, 6);
  });

  it("returns no gain on a flat price, rather than a rounding artefact", () => {
    const result = sipBacktest(FLAT_3Y, { monthlyAmount: 5_000, years: 3 })!;
    expect(result.absoluteReturnPercent).toBeCloseTo(0, 6);
    expect(result.averageCostPerUnit).toBeCloseTo(100, 6);
    expect(result.currentValue).toBeCloseTo(result.totalInvested, 6);
  });

  it("does not invest on the same day twice", () => {
    const result = sipBacktest(FLAT_3Y, { monthlyAmount: 1_000, years: 3 })!;
    expect(result.firstInvestmentDate < result.lastInvestmentDate).toBe(true);
  });

  it("beats a lump sum when the price falls before recovering", () => {
    // A V: monthly buying through the trough accumulates cheap units that a
    // single purchase at the start never gets.
    const down = Array.from({ length: 550 }, (_, index) => 100 - index * 0.1);
    const up = Array.from({ length: 550 }, (_, index) => 45 + index * 0.1);
    const result = sipBacktest(series([...down, ...up]), { monthlyAmount: 10_000, years: 3 })!;
    expect(result.sipBeatLumpSum).toBe(true);
    expect(result.absoluteReturnPercent).toBeGreaterThan(result.lumpSumReturnPercent);
  });

  it("loses to a lump sum in a straight-line rally", () => {
    // Every later instalment buys dearer, so staggering costs money here. This
    // is the case a "5-year return" figure quietly assumes away.
    const rally = Array.from({ length: 1100 }, (_, index) => 100 + index * 0.2);
    const result = sipBacktest(series(rally), { monthlyAmount: 10_000, years: 3 })!;
    expect(result.sipBeatLumpSum).toBe(false);
    expect(result.lumpSumReturnPercent).toBeGreaterThan(result.absoluteReturnPercent);
  });

  it("reports a money-weighted rate that matches the asset's own growth rate", () => {
    // A SIP into an asset compounding at a constant rate earns exactly that
    // rate, whenever each instalment went in — which is precisely what a simple
    // "profit / invested" figure cannot show. Here 0.05%/day is 20.02% a year.
    const dailyRate = 1.0005;
    const rally = Array.from({ length: 1100 }, (_, index) => 100 * Math.pow(dailyRate, index));
    const result = sipBacktest(series(rally), { monthlyAmount: 10_000, years: 3 })!;
    const underlyingAnnualPercent = (Math.pow(dailyRate, 365) - 1) * 100;

    expect(result.xirrPercent).not.toBeNull();
    expect(result.xirrPercent as number).toBeCloseTo(underlyingAnnualPercent, 1);
    // The simple return differs, because the average rupee was invested for
    // about half the period rather than all of it.
    expect(result.absoluteReturnPercent).not.toBeCloseTo(underlyingAnnualPercent, 1);
  });

  it("never starts before the history does", () => {
    // Asking for 10 years against 3 years of data must not pile the missing
    // 84 instalments onto the earliest row and fabricate a lump sum.
    const result = sipBacktest(FLAT_3Y, { monthlyAmount: 10_000, years: 10 })!;
    expect(result.installments).toBeLessThanOrEqual(37);
    expect(result.firstInvestmentDate >= FLAT_3Y[0].date).toBe(true);
    // Each instalment bought on a distinct date, so none were stacked.
    expect(result.unitsAccumulated).toBeCloseTo(result.totalInvested / 100, 6);
  });

  it("skips forward to the next tradable day when the SIP date has no row", () => {
    // Only the 1st and 20th of each month exist; a SIP set for the 10th must
    // land on the 20th, not be dropped and not use the previous 1st.
    const sparse: Array<{ date: string; close: number }> = [];
    for (let month = 0; month < 30; month += 1) {
      const year = 2020 + Math.floor(month / 12);
      const label = String((month % 12) + 1).padStart(2, "0");
      sparse.push({ date: `${year}-${label}-01`, close: 100 });
      sparse.push({ date: `${year}-${label}-20`, close: 110 });
    }
    const result = sipBacktest(sparse, { monthlyAmount: 1_000, years: 2, dayOfMonth: 10 })!;
    expect(result.installments).toBeGreaterThan(20);
    // Every purchase landed on a 20th, at 110.
    expect(result.averageCostPerUnit).toBeCloseTo(110, 6);
  });

  it("clamps the SIP day so February always has one", () => {
    const late = sipBacktest(FLAT_3Y, { monthlyAmount: 1_000, years: 3, dayOfMonth: 31 })!;
    const clamped = sipBacktest(FLAT_3Y, { monthlyAmount: 1_000, years: 3, dayOfMonth: 28 })!;
    expect(late.installments).toBe(clamped.installments);
  });

  it("refuses inputs that cannot produce a meaningful result", () => {
    expect(sipBacktest(FLAT_3Y, { monthlyAmount: 0, years: 3 })).toBeNull();
    expect(sipBacktest(FLAT_3Y, { monthlyAmount: -100, years: 3 })).toBeNull();
    expect(sipBacktest(FLAT_3Y, { monthlyAmount: Number.NaN, years: 3 })).toBeNull();
    expect(sipBacktest(FLAT_3Y, { monthlyAmount: 1_000, years: 0 })).toBeNull();
    expect(sipBacktest([], { monthlyAmount: 1_000, years: 3 })).toBeNull();
    expect(sipBacktest(null, { monthlyAmount: 1_000, years: 3 })).toBeNull();
  });

  it("returns null rather than annualising a single instalment", () => {
    // Twenty days spans one SIP date. A "return" on one purchase is just that
    // day's price move, and annualising it produces the same nonsense figure
    // XIRR's minimum-span guard exists to suppress.
    const oneMonth = series(Array(20).fill(100));
    expect(sipBacktest(oneMonth, { monthlyAmount: 1_000, years: 3 })).toBeNull();
  });

  it("ignores unusable rows instead of dividing by a zero price", () => {
    const dirty = [
      ...FLAT_3Y,
      { date: "2024-06-01", close: 0 },
      { date: "2024-06-02", close: -10 },
      { date: "not-a-date", close: 100 },
    ];
    const result = sipBacktest(dirty, { monthlyAmount: 1_000, years: 3 })!;
    expect(Number.isFinite(result.unitsAccumulated)).toBe(true);
    expect(Number.isFinite(result.currentValue)).toBe(true);
  });
});
