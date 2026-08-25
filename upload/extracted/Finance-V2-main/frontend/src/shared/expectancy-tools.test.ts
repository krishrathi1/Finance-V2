import { describe, expect, it } from "vitest";

import { kellyStake, tradingExpectancy } from "@/shared/expectancy-tools";

describe("tradingExpectancy", () => {
  it("computes the expected rupees per trade", () => {
    // 40% wins at 3,000, 60% losses at 1,000: 0.4*3000 - 0.6*1000 = 600.
    const result = tradingExpectancy({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    expect(result.perTrade).toBe(600);
    expect(result.profitable).toBe(true);
  });

  it("expresses the edge in units of risk", () => {
    const result = tradingExpectancy({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    // 600 expected against 1,000 risked is 0.6R.
    expect(result.perTradeR).toBeCloseTo(0.6, 6);
  });

  it("shows a high win rate can still lose money", () => {
    // The headline case: winning 70% of the time is not an edge on its own.
    // 0.7*500 - 0.3*2000 = -250.
    const result = tradingExpectancy({
      winRatePercent: 70,
      averageWin: 500,
      averageLoss: 2_000,
    })!;
    expect(result.perTrade).toBe(-250);
    expect(result.profitable).toBe(false);
    expect(result.edgePercentagePoints).toBeLessThan(0);
  });

  it("shows a low win rate can still make money", () => {
    // 30% wins at 5,000 against 70% losses at 1,000 = +800.
    const result = tradingExpectancy({
      winRatePercent: 30,
      averageWin: 5_000,
      averageLoss: 1_000,
    })!;
    expect(result.profitable).toBe(true);
    expect(result.edgePercentagePoints).toBeGreaterThan(0);
  });

  it("requires better than half the trades at 1:1", () => {
    // The number most worth reading: "I win more than I lose" is not evidence
    // of an edge until you know the payoff.
    const result = tradingExpectancy({
      winRatePercent: 50,
      averageWin: 1_000,
      averageLoss: 1_000,
    })!;
    expect(result.breakevenWinRatePercent).toBeCloseTo(50, 6);
    expect(result.perTrade).toBe(0);
    expect(result.profitable).toBe(false);
  });

  it("lowers the required win rate as the payoff improves", () => {
    const oneToOne = tradingExpectancy({
      winRatePercent: 50,
      averageWin: 1_000,
      averageLoss: 1_000,
    })!;
    const threeToOne = tradingExpectancy({
      winRatePercent: 50,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    expect(threeToOne.breakevenWinRatePercent).toBeLessThan(oneToOne.breakevenWinRatePercent);
    // 3:1 breaks even at 25%.
    expect(threeToOne.breakevenWinRatePercent).toBeCloseTo(25, 6);
  });

  it("reports a profit factor above 1 exactly when the system is profitable", () => {
    const winner = tradingExpectancy({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    const loser = tradingExpectancy({
      winRatePercent: 70,
      averageWin: 500,
      averageLoss: 2_000,
    })!;
    expect(winner.profitFactor).toBeGreaterThan(1);
    expect(loser.profitFactor).toBeLessThan(1);
  });

  it("projects the edge over a year when given a trade count", () => {
    const result = tradingExpectancy({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
      tradesPerYear: 200,
    })!;
    expect(result.annualExpectancy).toBe(120_000);
  });

  it("omits the annual figure when no trade count is given", () => {
    const result = tradingExpectancy({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    expect(result.annualExpectancy).toBeNull();
  });

  it("keeps the profit factor finite when nothing ever loses", () => {
    // Infinity would violate this module's own contract.
    const result = tradingExpectancy({
      winRatePercent: 100,
      averageWin: 1_000,
      averageLoss: 1_000,
    })!;
    expect(Number.isFinite(result.profitFactor)).toBe(true);
  });

  it("refuses inputs that cannot describe a system", () => {
    const base = { winRatePercent: 40, averageWin: 3_000, averageLoss: 1_000 };
    expect(tradingExpectancy({ ...base, winRatePercent: -1 })).toBeNull();
    expect(tradingExpectancy({ ...base, winRatePercent: 101 })).toBeNull();
    expect(tradingExpectancy({ ...base, averageWin: 0 })).toBeNull();
    expect(tradingExpectancy({ ...base, averageLoss: 0 })).toBeNull();
    expect(tradingExpectancy({ ...base, averageWin: Number.NaN })).toBeNull();
    expect(tradingExpectancy(null as never)).toBeNull();
  });
});

describe("kellyStake", () => {
  it("computes the growth-optimal fraction", () => {
    // W=0.4, R=3: f = 0.4 - 0.6/3 = 0.2, so 20%.
    const result = kellyStake({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    expect(result.fullKellyPercent).toBeCloseTo(20, 6);
  });

  it("halves it, because full Kelly is not survivable in practice", () => {
    const result = kellyStake({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    expect(result.halfKellyPercent).toBeCloseTo(10, 6);
  });

  it("stakes nothing on a losing system rather than a small amount", () => {
    // There is no bet size that makes a negative edge profitable, and
    // returning a fraction of one would imply there is.
    const result = kellyStake({
      winRatePercent: 70,
      averageWin: 500,
      averageLoss: 2_000,
    })!;
    expect(result.noEdge).toBe(true);
    expect(result.fullKellyPercent).toBe(0);
    expect(result.halfKellyPercent).toBe(0);
  });

  it("stakes nothing at exactly breakeven", () => {
    const result = kellyStake({
      winRatePercent: 50,
      averageWin: 1_000,
      averageLoss: 1_000,
    })!;
    expect(result.noEdge).toBe(true);
    expect(result.fullKellyPercent).toBe(0);
  });

  it("never stakes more than the capital", () => {
    const result = kellyStake({
      winRatePercent: 99,
      averageWin: 1_000_000,
      averageLoss: 1,
    })!;
    expect(result.fullKellyPercent).toBeLessThanOrEqual(100);
    expect(result.halfKellyPercent).toBeLessThanOrEqual(50);
  });

  it("converts the half-Kelly stake to rupees when given capital", () => {
    const result = kellyStake({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
      capital: 1_000_000,
    })!;
    expect(result.halfKellyAmount).toBeCloseTo(100_000, 2);
  });

  it("omits the rupee stake without capital", () => {
    const result = kellyStake({
      winRatePercent: 40,
      averageWin: 3_000,
      averageLoss: 1_000,
    })!;
    expect(result.halfKellyAmount).toBeNull();
  });

  it("agrees with expectancy about whether an edge exists", () => {
    // The two must never disagree: a system Kelly refuses to stake on is a
    // system expectancy calls unprofitable.
    for (const winRatePercent of [20, 35, 50, 65, 80]) {
      const edge = tradingExpectancy({ winRatePercent, averageWin: 2_000, averageLoss: 1_000 })!;
      const stake = kellyStake({ winRatePercent, averageWin: 2_000, averageLoss: 1_000 })!;
      expect(stake.noEdge).toBe(!edge.profitable);
    }
  });

  it("refuses inputs that cannot describe a system", () => {
    const base = { winRatePercent: 40, averageWin: 3_000, averageLoss: 1_000 };
    expect(kellyStake({ ...base, winRatePercent: 101 })).toBeNull();
    expect(kellyStake({ ...base, averageLoss: 0 })).toBeNull();
    expect(kellyStake(null as never)).toBeNull();
  });
});
