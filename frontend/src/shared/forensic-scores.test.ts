import { describe, expect, it } from "vitest";

import { piotroskiFScore, type FinancialsInput } from "./forensic-scores";

/** A healthy, unlevered company — comfortably in the safe zone. */
const HEALTHY: FinancialsInput = {
  incomeStatement: [
    { period: "2026", revenue: 1000, ebit: 200, netIncome: 150 },
    { period: "2025", revenue: 800, ebit: 140, netIncome: 100 },
  ],
  balanceSheet: [
    {
      period: "2026",
      totalAssets: 1000,
      totalDebt: 100,
      totalLiabilities: 300,
      equity: 700,
      currentAssets: 500,
      currentLiabilities: 200,
      retainedEarnings: 400,
    },
    {
      period: "2025",
      totalAssets: 900,
      totalDebt: 200,
      totalLiabilities: 400,
      equity: 500,
      currentAssets: 400,
      currentLiabilities: 250,
      retainedEarnings: 300,
    },
  ],
  cashFlow: [
    { period: "2026", operatingCashFlow: 200, freeCashFlow: 150 },
    { period: "2025", operatingCashFlow: 120, freeCashFlow: 80 },
  ],
};

describe("piotroskiFScore", () => {
  it("scores a strong company on every testable signal", () => {
    const result = piotroskiFScore(HEALTHY);
    expect(result).not.toBeNull();
    // ROA positive, OCF positive, ROA improving (.15 vs .111), OCF > NI,
    // leverage falling (.1 vs .222), current ratio improving (2.5 vs 1.6),
    // asset turnover improving (1.0 vs .889) = 7 of 7 testable.
    expect(result!.testable).toBe(7);
    expect(result!.score).toBe(7);
    expect(result!.strength).toBe("strong");
  });

  it("never claims to have tested the two signals this data can't support", () => {
    // Silently passing them would inflate every company by two points.
    const result = piotroskiFScore(HEALTHY)!;
    const untestable = result.signals.filter((s) => s.passed === null).map((s) => s.key);
    expect(untestable.sort()).toEqual(["grossMarginImproving", "noDilution"]);
    expect(result.maxScore).toBe(9);
    expect(result.testable).toBeLessThan(result.maxScore);
  });

  it("flags profit that is not backed by cash", () => {
    const accrualHeavy = piotroskiFScore({
      ...HEALTHY,
      cashFlow: [
        { period: "2026", operatingCashFlow: 10 },
        { period: "2025", operatingCashFlow: 120 },
      ],
    })!;
    const signal = accrualHeavy.signals.find((s) => s.key === "accruals")!;
    expect(signal.passed).toBe(false);
    expect(signal.detail).toContain("Net profit exceeds operating cash flow");
  });

  it("scores a deteriorating company poorly", () => {
    const weak = piotroskiFScore({
      incomeStatement: [
        { period: "2026", revenue: 500, ebit: -20, netIncome: -50 },
        { period: "2025", revenue: 900, ebit: 100, netIncome: 80 },
      ],
      balanceSheet: [
        {
          period: "2026",
          totalAssets: 1000,
          totalDebt: 600,
          currentAssets: 100,
          currentLiabilities: 400,
        },
        {
          period: "2025",
          totalAssets: 900,
          totalDebt: 200,
          currentAssets: 400,
          currentLiabilities: 200,
        },
      ],
      cashFlow: [
        { period: "2026", operatingCashFlow: -30 },
        { period: "2025", operatingCashFlow: 100 },
      ],
    })!;
    // Exactly one signal passes, and it should: operating cash flow (-30)
    // exceeds net income (-50), so cash burn is smaller than the accounting
    // loss. Piotroski's accrual test is about earnings *quality* relative to
    // cash, not about profitability — it awards the point even when both
    // figures are negative, and the other six signals all fail.
    expect(weak.score).toBe(1);
    expect(weak.signals.find((s) => s.key === "accruals")!.passed).toBe(true);
    expect(weak.signals.filter((s) => s.passed === true)).toHaveLength(1);
    expect(weak.strength).toBe("weak");
  });

  it("grades on applicable signals, not the full nine", () => {
    // Without cash flow only 5 signals are testable; passing 4 is still strong.
    const partial = piotroskiFScore({ ...HEALTHY, cashFlow: [] })!;
    expect(partial.testable).toBe(5);
    expect(partial.score).toBe(5);
    expect(partial.strength).toBe("strong");
  });

  it("requires two years — the model is inherently year-over-year", () => {
    expect(
      piotroskiFScore({
        incomeStatement: [{ period: "2026", revenue: 1000, netIncome: 100 }],
        balanceSheet: [{ period: "2026", totalAssets: 1000 }],
      })
    ).toBeNull();
    expect(piotroskiFScore({})).toBeNull();
  });

  it("uses the newest two periods regardless of array order", () => {
    const reversed: FinancialsInput = {
      incomeStatement: [...HEALTHY.incomeStatement!].reverse(),
      balanceSheet: [...HEALTHY.balanceSheet!].reverse(),
      cashFlow: [...HEALTHY.cashFlow!].reverse(),
    };
    expect(piotroskiFScore(reversed)!.score).toBe(piotroskiFScore(HEALTHY)!.score);
  });
});
