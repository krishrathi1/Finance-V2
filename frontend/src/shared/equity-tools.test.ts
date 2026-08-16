import { describe, expect, it } from "vitest";

import {
  averageDown,
  breakEvenAfterLoss,
  dividendIncomePlanner,
  requiredReturn,
  stopLossTargets,
  weightedAverageBuy,
} from "@/shared/equity-tools";

describe("averageDown", () => {
  it("blends a top-up into an existing holding", () => {
    // 10 @ ₹100 plus 10 @ ₹80 is ₹1,800 across 20 shares — ₹90 average.
    const result = averageDown({
      existingQuantity: 10,
      existingAvgPrice: 100,
      newQuantity: 10,
      newPrice: 80,
    })!;
    expect(result.totalQuantity).toBe(20);
    expect(result.totalInvested).toBe(1800);
    expect(result.newAveragePrice).toBe(90);
    expect(result.avgPriceChange).toBe(-10);
    expect(result.avgPriceChangePercent).toBe(-10);
  });

  it("averages UP without complaint — the new price may be higher", () => {
    const result = averageDown({
      existingQuantity: 100,
      existingAvgPrice: 50,
      newQuantity: 100,
      newPrice: 150,
    })!;
    expect(result.newAveragePrice).toBe(100);
    expect(result.avgPriceChange).toBe(50);
    expect(result.avgPriceChangePercent).toBe(100);
  });

  it("weights by rupees committed, not by lot count", () => {
    // 1 share at ₹1,000 against 1,000 shares at ₹1: the midpoint guess of
    // ₹500.50 is nowhere near the true ₹2.00 average.
    const result = averageDown({
      existingQuantity: 1,
      existingAvgPrice: 1000,
      newQuantity: 1000,
      newPrice: 1,
    })!;
    expect(result.totalQuantity).toBe(1001);
    expect(result.totalInvested).toBe(2000);
    expect(result.newAveragePrice).toBe(2);
    expect(result.avgPriceChange).toBe(-998);
    expect(result.avgPriceChangePercent).toBe(-99.8);
  });

  it("keeps the change reconcilable with the rounded average on screen", () => {
    // ₹280 over 3 shares is ₹93.333…; the displayed ₹93.33 minus ₹100 must be
    // exactly the displayed −₹6.67, or a user checking by hand sees a bug.
    const result = averageDown({
      existingQuantity: 1,
      existingAvgPrice: 100,
      newQuantity: 2,
      newPrice: 90,
    })!;
    expect(result.newAveragePrice).toBe(93.33);
    expect(result.avgPriceChange).toBe(-6.67);
    expect(result.avgPriceChangePercent).toBe(-6.67);
    expect(Math.round((result.newAveragePrice - 100) * 100) / 100).toBe(result.avgPriceChange);
  });

  it("reports no change when the top-up is at the existing average", () => {
    const result = averageDown({
      existingQuantity: 25,
      existingAvgPrice: 250,
      newQuantity: 75,
      newPrice: 250,
    })!;
    expect(result.newAveragePrice).toBe(250);
    expect(result.avgPriceChange).toBe(0);
    expect(result.avgPriceChangePercent).toBe(0);
    expect(result.totalInvested).toBe(25_000);
  });

  it("keeps fractional quantities free of float noise", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE754; a share count with sixteen
    // decimals discredits every figure printed next to it.
    const result = averageDown({
      existingQuantity: 0.1,
      existingAvgPrice: 100,
      newQuantity: 0.2,
      newPrice: 100,
    })!;
    expect(result.totalQuantity).toBe(0.3);
    expect(result.totalInvested).toBe(30);
    expect(result.newAveragePrice).toBe(100);
  });

  it("rounds money and percentages to two decimals", () => {
    const result = averageDown({
      existingQuantity: 3,
      existingAvgPrice: 1234.5678,
      newQuantity: 7,
      newPrice: 987.6543,
    })!;
    expect(result.newAveragePrice).toBe(Math.round(result.newAveragePrice * 100) / 100);
    expect(result.totalInvested).toBe(Math.round(result.totalInvested * 100) / 100);
    expect(result.avgPriceChange).toBe(Math.round(result.avgPriceChange * 100) / 100);
    expect(result.avgPriceChangePercent).toBe(
      Math.round(result.avgPriceChangePercent * 100) / 100
    );
    // ₹3,703.7034 + ₹6,913.5801 over 10 shares.
    expect(result.totalInvested).toBe(10_617.28);
    expect(result.newAveragePrice).toBe(1061.73);
  });

  it("keeps the new average strictly between the two prices", () => {
    for (const newPrice of [1, 45.5, 99.99, 100.01, 500, 12_345.67]) {
      const result = averageDown({
        existingQuantity: 12,
        existingAvgPrice: 100,
        newQuantity: 7,
        newPrice,
      })!;
      const low = Math.min(100, newPrice);
      const high = Math.max(100, newPrice);
      expect(result.newAveragePrice).toBeGreaterThanOrEqual(low);
      expect(result.newAveragePrice).toBeLessThanOrEqual(high);
    }
  });

  it("rejects zero and negative quantities and prices", () => {
    const base = {
      existingQuantity: 10,
      existingAvgPrice: 100,
      newQuantity: 10,
      newPrice: 80,
    };
    expect(averageDown({ ...base, existingQuantity: 0 })).toBeNull();
    expect(averageDown({ ...base, existingQuantity: -10 })).toBeNull();
    expect(averageDown({ ...base, existingAvgPrice: 0 })).toBeNull();
    expect(averageDown({ ...base, existingAvgPrice: -100 })).toBeNull();
    expect(averageDown({ ...base, newQuantity: 0 })).toBeNull();
    expect(averageDown({ ...base, newQuantity: -1 })).toBeNull();
    expect(averageDown({ ...base, newPrice: 0 })).toBeNull();
    expect(averageDown({ ...base, newPrice: -80 })).toBeNull();
  });

  it("rejects non-finite inputs and a missing input object", () => {
    const base = {
      existingQuantity: 10,
      existingAvgPrice: 100,
      newQuantity: 10,
      newPrice: 80,
    };
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(averageDown({ ...base, existingQuantity: bad })).toBeNull();
      expect(averageDown({ ...base, existingAvgPrice: bad })).toBeNull();
      expect(averageDown({ ...base, newQuantity: bad })).toBeNull();
      expect(averageDown({ ...base, newPrice: bad })).toBeNull();
    }
    expect(averageDown(null as never)).toBeNull();
    expect(averageDown(undefined as never)).toBeNull();
  });

  it("survives huge but representable positions instead of emitting Infinity", () => {
    const result = averageDown({
      existingQuantity: 1e154,
      existingAvgPrice: 1e154,
      newQuantity: 1,
      newPrice: 1,
    })!;
    expect(result).not.toBeNull();
    expect(Number.isFinite(result.totalInvested)).toBe(true);
    expect(result.totalInvested).toBe(1e308);
    expect(Number.isFinite(result.newAveragePrice)).toBe(true);

    // A quantity too large to scale for rounding still comes back finite.
    const massive = averageDown({
      existingQuantity: 1e307,
      existingAvgPrice: 1,
      newQuantity: 1,
      newPrice: 1,
    })!;
    expect(Number.isFinite(massive.totalQuantity)).toBe(true);
    expect(massive.totalQuantity).toBe(1e307);
    expect(massive.newAveragePrice).toBe(1);
  });

  it("returns null when the invested total or the percent move overflows", () => {
    expect(
      averageDown({
        existingQuantity: 1e300,
        existingAvgPrice: 1e300,
        newQuantity: 1,
        newPrice: 1,
      })
    ).toBeNull();

    // A subnormal cost basis makes the percentage move unrepresentable.
    expect(
      averageDown({
        existingQuantity: 1,
        existingAvgPrice: Number.MIN_VALUE,
        newQuantity: 1,
        newPrice: 1e300,
      })
    ).toBeNull();
  });
});

describe("requiredReturn", () => {
  it("answers the 2x question", () => {
    const result = requiredReturn({ currentPrice: 100, targetPrice: 200 })!;
    expect(result.multiple).toBe(2);
    expect(result.totalReturnPercent).toBe(100);
    expect(result.annualisedPercent).toBeNull();
  });

  it("annualises geometrically, matching CAGR rather than dividing by years", () => {
    // A 3-year double is ~26% a year, not the arithmetic 33%.
    const result = requiredReturn({ currentPrice: 100, targetPrice: 200, years: 3 })!;
    expect(result.annualisedPercent).toBe(25.99);
    expect(result.annualisedPercent!).toBeLessThan(100 / 3);
  });

  it("treats a target below the current price as a real question", () => {
    const result = requiredReturn({ currentPrice: 200, targetPrice: 100, years: 2 })!;
    expect(result.multiple).toBe(0.5);
    expect(result.totalReturnPercent).toBe(-50);
    expect(result.annualisedPercent).toBe(-29.29);
  });

  it("reports a flat target as zero return, not as an error", () => {
    const result = requiredReturn({ currentPrice: 450, targetPrice: 450, years: 5 })!;
    expect(result.multiple).toBe(1);
    expect(result.totalReturnPercent).toBe(0);
    expect(result.annualisedPercent).toBe(0);
  });

  it("keeps four decimals on the multiple and two on the percentages", () => {
    const result = requiredReturn({ currentPrice: 3, targetPrice: 10 })!;
    expect(result.multiple).toBe(3.3333);
    expect(result.totalReturnPercent).toBe(233.33);
  });

  it("annualises horizons shorter than a year", () => {
    // +10% in half a year compounds to 21% annualised, not 20%.
    const result = requiredReturn({ currentPrice: 100, targetPrice: 110, years: 0.5 })!;
    expect(result.annualisedPercent).toBe(21);
  });

  it("nulls only the rate when the horizon is missing or garbled", () => {
    for (const years of [undefined, null, 0, -3, Number.NaN, Infinity, -Infinity]) {
      const result = requiredReturn({ currentPrice: 100, targetPrice: 250, years })!;
      expect(result).not.toBeNull();
      expect(result.totalReturnPercent).toBe(150);
      expect(result.multiple).toBe(2.5);
      expect(result.annualisedPercent).toBeNull();
    }
  });

  it("nulls the rate when the horizon demands an unrepresentable one", () => {
    // Doubling in 1e-10 years implies 2^1e10 — no rate exists to quote, but
    // "+100%" is still the true total return.
    const result = requiredReturn({ currentPrice: 100, targetPrice: 200, years: 1e-10 })!;
    expect(result.totalReturnPercent).toBe(100);
    expect(result.annualisedPercent).toBeNull();
  });

  it("collapses a very long horizon toward a zero rate", () => {
    const result = requiredReturn({ currentPrice: 100, targetPrice: 200, years: 1e6 })!;
    expect(result.annualisedPercent).toBe(0);
    expect(Number.isFinite(result.annualisedPercent!)).toBe(true);
  });

  it("rejects zero, negative, and non-finite prices", () => {
    expect(requiredReturn({ currentPrice: 0, targetPrice: 100 })).toBeNull();
    expect(requiredReturn({ currentPrice: -100, targetPrice: 100 })).toBeNull();
    expect(requiredReturn({ currentPrice: 100, targetPrice: 0 })).toBeNull();
    expect(requiredReturn({ currentPrice: 100, targetPrice: -50 })).toBeNull();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(requiredReturn({ currentPrice: bad, targetPrice: 100 })).toBeNull();
      expect(requiredReturn({ currentPrice: 100, targetPrice: bad })).toBeNull();
    }
    expect(requiredReturn(null as never)).toBeNull();
  });

  it("returns null rather than an Infinity multiple or return", () => {
    expect(requiredReturn({ currentPrice: 1e-300, targetPrice: 1e300 })).toBeNull();
    // The multiple survives but the ×100 return does not.
    expect(requiredReturn({ currentPrice: 1e-10, targetPrice: 1e297 })).toBeNull();
  });
});

describe("breakEvenAfterLoss", () => {
  it("prices the asymmetry a holder underestimates", () => {
    expect(breakEvenAfterLoss({ lossPercent: 50 })).toBe(100);
    expect(breakEvenAfterLoss({ lossPercent: 80 })).toBe(400);
    expect(breakEvenAfterLoss({ lossPercent: 90 })).toBe(900);
    expect(breakEvenAfterLoss({ lossPercent: 99 })).toBe(9900);
  });

  it("handles the everyday small losses", () => {
    expect(breakEvenAfterLoss({ lossPercent: 10 })).toBe(11.11);
    expect(breakEvenAfterLoss({ lossPercent: 20 })).toBe(25);
    expect(breakEvenAfterLoss({ lossPercent: 25 })).toBe(33.33);
    expect(breakEvenAfterLoss({ lossPercent: 33.33 })).toBe(49.99);
  });

  it("always demands more than the loss itself", () => {
    for (const loss of [5, 15, 40, 60, 75, 95]) {
      expect(breakEvenAfterLoss({ lossPercent: loss })!).toBeGreaterThan(loss);
    }
    // Below a percent the excess is thinner than the paise the answer is
    // quoted to, so the rounded gain meets the loss — it never falls short.
    expect(breakEvenAfterLoss({ lossPercent: 0.5 })).toBe(0.5);
  });

  it("rises monotonically with the loss", () => {
    const losses = [1, 10, 25, 50, 75, 90, 99];
    const gains = losses.map((lossPercent) => breakEvenAfterLoss({ lossPercent })!);
    for (let i = 1; i < gains.length; i += 1) {
      expect(gains[i]).toBeGreaterThan(gains[i - 1]);
    }
  });

  it("restores the surviving capital to its starting value", () => {
    for (const loss of [1, 12.5, 37, 50, 66.6, 88]) {
      const gain = breakEvenAfterLoss({ lossPercent: loss })!;
      const survived = 100 - loss;
      // Within a rupee in a hundred: the residual is the two-decimal rounding
      // of the quoted percentage, not an error in the formula.
      expect(survived * (1 + gain / 100)).toBeCloseTo(100, 1);
    }
  });

  it("refuses a total loss — no gain multiplies zero back", () => {
    expect(breakEvenAfterLoss({ lossPercent: 100 })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: 100.01 })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: 150 })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: 1e9 })).toBeNull();
    // Just inside the boundary is still answerable, however brutal.
    expect(breakEvenAfterLoss({ lossPercent: 99.99 })!).toBeCloseTo(999_900, 0);
  });

  it("refuses a zero or negative loss — there is nothing to recover", () => {
    expect(breakEvenAfterLoss({ lossPercent: 0 })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: -0.01 })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: -50 })).toBeNull();
  });

  it("handles a vanishingly small loss without emitting zero-divide noise", () => {
    expect(breakEvenAfterLoss({ lossPercent: 0.01 })).toBe(0.01);
    const tiny = breakEvenAfterLoss({ lossPercent: 1e-10 })!;
    expect(Number.isFinite(tiny)).toBe(true);
    expect(tiny).toBe(0);
  });

  it("rejects non-finite input and a missing input object", () => {
    expect(breakEvenAfterLoss({ lossPercent: Number.NaN })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: Infinity })).toBeNull();
    expect(breakEvenAfterLoss({ lossPercent: -Infinity })).toBeNull();
    expect(breakEvenAfterLoss(null as never)).toBeNull();
    expect(breakEvenAfterLoss(undefined as never)).toBeNull();
  });
});

describe("dividendIncomePlanner", () => {
  it("sizes the capital a monthly dividend target demands", () => {
    // ₹50,000 a month is ₹6L a year; at a 3% yield that is ₹2 crore of stock.
    const plan = dividendIncomePlanner({ targetMonthlyIncome: 50_000, dividendYieldPercent: 3 })!;
    expect(plan.annualIncome).toBe(600_000);
    expect(plan.capitalRequired).toBe(20_000_000);
  });

  it("returns the annual figure so the caller can show the lumpiness", () => {
    const plan = dividendIncomePlanner({ targetMonthlyIncome: 10_000, dividendYieldPercent: 2.5 })!;
    expect(plan.annualIncome).toBe(120_000);
    expect(plan.capitalRequired).toBe(4_800_000);
  });

  it("rounds capital to paise", () => {
    const plan = dividendIncomePlanner({ targetMonthlyIncome: 12_345, dividendYieldPercent: 3.7 })!;
    expect(plan.annualIncome).toBe(148_140);
    expect(plan.capitalRequired).toBe(4_003_783.78);
  });

  it("halving the yield doubles the capital", () => {
    const at4 = dividendIncomePlanner({ targetMonthlyIncome: 25_000, dividendYieldPercent: 4 })!;
    const at2 = dividendIncomePlanner({ targetMonthlyIncome: 25_000, dividendYieldPercent: 2 })!;
    expect(at2.capitalRequired).toBe(at4.capitalRequired * 2);
    expect(at2.annualIncome).toBe(at4.annualIncome);
  });

  it("takes an implausible yield at face value rather than imposing a ceiling", () => {
    // A 100% yield means the capital equals one year of income — arithmetically
    // sound, economically absurd, and the user's call to make.
    const atPar = dividendIncomePlanner({
      targetMonthlyIncome: 10_000,
      dividendYieldPercent: 100,
    })!;
    expect(atPar.capitalRequired).toBe(120_000);
    const beyond = dividendIncomePlanner({
      targetMonthlyIncome: 10_000,
      dividendYieldPercent: 200,
    })!;
    expect(beyond.capitalRequired).toBe(60_000);
  });

  it("rejects zero and negative income or yield", () => {
    expect(
      dividendIncomePlanner({ targetMonthlyIncome: 0, dividendYieldPercent: 3 })
    ).toBeNull();
    expect(
      dividendIncomePlanner({ targetMonthlyIncome: -50_000, dividendYieldPercent: 3 })
    ).toBeNull();
    expect(
      dividendIncomePlanner({ targetMonthlyIncome: 50_000, dividendYieldPercent: 0 })
    ).toBeNull();
    expect(
      dividendIncomePlanner({ targetMonthlyIncome: 50_000, dividendYieldPercent: -3 })
    ).toBeNull();
  });

  it("rejects non-finite input and a missing input object", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(
        dividendIncomePlanner({ targetMonthlyIncome: bad, dividendYieldPercent: 3 })
      ).toBeNull();
      expect(
        dividendIncomePlanner({ targetMonthlyIncome: 50_000, dividendYieldPercent: bad })
      ).toBeNull();
    }
    expect(dividendIncomePlanner(null as never)).toBeNull();
  });

  it("returns null rather than an Infinity capital requirement", () => {
    // A subnormal yield needs more capital than a double can express.
    expect(
      dividendIncomePlanner({ targetMonthlyIncome: 1e6, dividendYieldPercent: 1e-310 })
    ).toBeNull();
    // So does an income target whose annualisation alone overflows.
    expect(
      dividendIncomePlanner({ targetMonthlyIncome: 1e307, dividendYieldPercent: 3 })
    ).toBeNull();
  });

  it("stays finite at large but representable targets", () => {
    const plan = dividendIncomePlanner({
      targetMonthlyIncome: 1e100,
      dividendYieldPercent: 0.01,
    })!;
    expect(Number.isFinite(plan.capitalRequired)).toBe(true);
    expect(Number.isFinite(plan.annualIncome)).toBe(true);
  });
});

describe("stopLossTargets", () => {
  it("defaults to a long: the stop sits below entry", () => {
    const levels = stopLossTargets({ entryPrice: 100, stopLossPercent: 5 })!;
    expect(levels.stopLossPrice).toBe(95);
    expect(levels.targetPrice).toBeNull();
    expect(levels.riskRewardRatio).toBeNull();

    const explicit = stopLossTargets({
      entryPrice: 100,
      stopLossPercent: 5,
      direction: "long",
    })!;
    expect(explicit).toEqual(levels);
  });

  it("prices both legs of a long and its reward:risk", () => {
    const levels = stopLossTargets({ entryPrice: 100, stopLossPercent: 5, targetPercent: 10 })!;
    expect(levels.stopLossPrice).toBe(95);
    expect(levels.targetPrice).toBe(110);
    expect(levels.riskRewardRatio).toBe(2);
  });

  it("inverts both legs for a short", () => {
    const levels = stopLossTargets({
      entryPrice: 100,
      stopLossPercent: 5,
      targetPercent: 10,
      direction: "short",
    })!;
    expect(levels.stopLossPrice).toBe(105);
    expect(levels.targetPrice).toBe(90);
    expect(levels.riskRewardRatio).toBe(2);
  });

  it("rounds prices to paise and keeps the ratio consistent with them", () => {
    const levels = stopLossTargets({
      entryPrice: 1234.56,
      stopLossPercent: 7.5,
      targetPercent: 15,
    })!;
    expect(levels.stopLossPrice).toBe(1141.97);
    expect(levels.targetPrice).toBe(1419.74);
    expect(levels.riskRewardRatio).toBe(2);
  });

  it("refuses a long stop of 100% or more — that price is zero", () => {
    expect(stopLossTargets({ entryPrice: 100, stopLossPercent: 100 })).toBeNull();
    expect(stopLossTargets({ entryPrice: 100, stopLossPercent: 150 })).toBeNull();
    // Just inside the boundary still prices.
    expect(stopLossTargets({ entryPrice: 1000, stopLossPercent: 99.99 })!.stopLossPrice).toBe(0.1);
  });

  it("honours a short stop beyond 100% — a short can lose more than the position", () => {
    const levels = stopLossTargets({
      entryPrice: 100,
      stopLossPercent: 150,
      targetPercent: 50,
      direction: "short",
    })!;
    expect(levels.stopLossPrice).toBe(250);
    expect(levels.targetPrice).toBe(50);
    expect(levels.riskRewardRatio).toBe(0.33);
  });

  it("returns null when the stop rounds below one paise", () => {
    // ₹100 with a 99.999% stop lands at ₹0.001 — no order rests there.
    expect(stopLossTargets({ entryPrice: 100, stopLossPercent: 99.999 })).toBeNull();
  });

  it("shows a sub-tick stop resting at entry, with no ratio to quote", () => {
    const levels = stopLossTargets({
      entryPrice: 100,
      stopLossPercent: 0.001,
      targetPercent: 10,
    })!;
    expect(levels.stopLossPrice).toBe(100);
    expect(levels.targetPrice).toBe(110);
    // Zero risk is a division by zero, not an infinitely good trade.
    expect(levels.riskRewardRatio).toBeNull();
  });

  it("drops a short target at or beyond zero but keeps the stop", () => {
    for (const targetPercent of [100, 150, 1000]) {
      const levels = stopLossTargets({
        entryPrice: 100,
        stopLossPercent: 5,
        targetPercent,
        direction: "short",
      })!;
      expect(levels.stopLossPrice).toBe(105);
      expect(levels.targetPrice).toBeNull();
      expect(levels.riskRewardRatio).toBeNull();
    }
  });

  it("treats a missing or garbled target as no target, not as bad input", () => {
    const base = { entryPrice: 100, stopLossPercent: 5 };
    for (const targetPercent of [undefined, null, Number.NaN, 0, -10, Infinity, -Infinity]) {
      const levels = stopLossTargets({ ...base, targetPercent })!;
      expect(levels).not.toBeNull();
      expect(levels.stopLossPrice).toBe(95);
      expect(levels.targetPrice).toBeNull();
      expect(levels.riskRewardRatio).toBeNull();
    }
  });

  it("prices a long target far above entry", () => {
    const levels = stopLossTargets({ entryPrice: 100, stopLossPercent: 5, targetPercent: 900 })!;
    expect(levels.targetPrice).toBe(1000);
    expect(levels.riskRewardRatio).toBe(180);
  });

  it("works on sub-₹10 prices", () => {
    const levels = stopLossTargets({ entryPrice: 1, stopLossPercent: 3, targetPercent: 6 })!;
    expect(levels.stopLossPrice).toBe(0.97);
    expect(levels.targetPrice).toBe(1.06);
    expect(levels.riskRewardRatio).toBe(2);
  });

  it("rejects an unknown direction smuggled past the types", () => {
    expect(
      stopLossTargets({
        entryPrice: 100,
        stopLossPercent: 5,
        direction: "sideways" as never,
      })
    ).toBeNull();
  });

  it("rejects zero, negative, and non-finite entry or stop", () => {
    expect(stopLossTargets({ entryPrice: 0, stopLossPercent: 5 })).toBeNull();
    expect(stopLossTargets({ entryPrice: -100, stopLossPercent: 5 })).toBeNull();
    expect(stopLossTargets({ entryPrice: 100, stopLossPercent: 0 })).toBeNull();
    expect(stopLossTargets({ entryPrice: 100, stopLossPercent: -5 })).toBeNull();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(stopLossTargets({ entryPrice: bad, stopLossPercent: 5 })).toBeNull();
      expect(stopLossTargets({ entryPrice: 100, stopLossPercent: bad })).toBeNull();
    }
    expect(stopLossTargets(null as never)).toBeNull();
  });

  it("returns null when a short stop overflows, and stays finite when it does not", () => {
    expect(
      stopLossTargets({ entryPrice: 1e308, stopLossPercent: 100, direction: "short" })
    ).toBeNull();

    const huge = stopLossTargets({ entryPrice: 1e308, stopLossPercent: 50 })!;
    expect(Number.isFinite(huge.stopLossPrice)).toBe(true);
    expect(huge.stopLossPrice).toBe(5e307);
  });
});

describe("weightedAverageBuy", () => {
  it("averages across several tranches by rupee weight", () => {
    const result = weightedAverageBuy({
      lots: [
        { quantity: 10, price: 100 },
        { quantity: 10, price: 80 },
        { quantity: 20, price: 90 },
      ],
    })!;
    expect(result.totalQuantity).toBe(40);
    expect(result.totalInvested).toBe(3600);
    expect(result.averagePrice).toBe(90);
  });

  it("returns the lot's own price for a single tranche", () => {
    const result = weightedAverageBuy({ lots: [{ quantity: 7, price: 123.456 }] })!;
    expect(result.totalQuantity).toBe(7);
    expect(result.totalInvested).toBe(864.19);
    expect(result.averagePrice).toBe(123.46);
  });

  it("agrees with averageDown on the two-lot case", () => {
    const pair = { existingQuantity: 13, existingAvgPrice: 247.35, newQuantity: 29, newPrice: 191.4 };
    const viaAverageDown = averageDown(pair)!;
    const viaLots = weightedAverageBuy({
      lots: [
        { quantity: pair.existingQuantity, price: pair.existingAvgPrice },
        { quantity: pair.newQuantity, price: pair.newPrice },
      ],
    })!;
    expect(viaLots.averagePrice).toBe(viaAverageDown.newAveragePrice);
    expect(viaLots.totalQuantity).toBe(viaAverageDown.totalQuantity);
    expect(viaLots.totalInvested).toBe(viaAverageDown.totalInvested);
  });

  it("does not depend on the order of the lots", () => {
    const lots = [
      { quantity: 3, price: 1500.25 },
      { quantity: 11, price: 908.4 },
      { quantity: 47, price: 1201.05 },
    ];
    const forwards = weightedAverageBuy({ lots })!;
    const backwards = weightedAverageBuy({ lots: [...lots].reverse() })!;
    expect(backwards).toEqual(forwards);
  });

  it("skips unusable lots instead of failing the whole tradebook", () => {
    const result = weightedAverageBuy({
      lots: [
        { quantity: 0, price: 100 },
        { quantity: 10, price: -5 },
        { quantity: Number.NaN, price: 100 },
        { quantity: 5, price: Infinity },
        { quantity: -3, price: 100 },
        null as never,
        undefined as never,
        { quantity: 10, price: 100 },
      ],
    })!;
    expect(result.totalQuantity).toBe(10);
    expect(result.totalInvested).toBe(1000);
    expect(result.averagePrice).toBe(100);
  });

  it("skips a lot too large to price and averages the rest", () => {
    const result = weightedAverageBuy({
      lots: [
        { quantity: 1e308, price: 1e308 },
        { quantity: 10, price: 100 },
      ],
    })!;
    expect(result.averagePrice).toBe(100);
    expect(result.totalQuantity).toBe(10);
    expect(result.totalInvested).toBe(1000);
  });

  it("keeps fractional lot quantities free of float noise", () => {
    const result = weightedAverageBuy({
      lots: [
        { quantity: 0.1, price: 100 },
        { quantity: 0.2, price: 100 },
      ],
    })!;
    expect(result.totalQuantity).toBe(0.3);
    expect(result.averagePrice).toBe(100);
  });

  it("weights a small expensive lot against a large cheap one", () => {
    const result = weightedAverageBuy({
      lots: [
        { quantity: 1, price: 1000 },
        { quantity: 1000, price: 1 },
      ],
    })!;
    expect(result.totalQuantity).toBe(1001);
    expect(result.totalInvested).toBe(2000);
    expect(result.averagePrice).toBe(2);
  });

  it("returns null only when nothing usable remains", () => {
    expect(weightedAverageBuy({ lots: [] })).toBeNull();
    expect(
      weightedAverageBuy({
        lots: [
          { quantity: 0, price: 0 },
          { quantity: -1, price: -1 },
          { quantity: Number.NaN, price: Number.NaN },
          { quantity: Infinity, price: Infinity },
        ],
      })
    ).toBeNull();
    expect(weightedAverageBuy({ lots: null as never })).toBeNull();
    expect(weightedAverageBuy({ lots: "10@100" as never })).toBeNull();
    expect(weightedAverageBuy(null as never)).toBeNull();
  });

  it("returns null when the accumulated total overflows", () => {
    const lots = Array.from({ length: 100 }, () => ({ quantity: 1e300, price: 1e8 }));
    expect(weightedAverageBuy({ lots })).toBeNull();
  });

  it("stays finite on a quantity too large to scale for rounding", () => {
    const result = weightedAverageBuy({ lots: [{ quantity: 1e307, price: 1 }] })!;
    expect(Number.isFinite(result.totalQuantity)).toBe(true);
    expect(result.totalQuantity).toBe(1e307);
    expect(result.averagePrice).toBe(1);
  });

  it("holds the average between the cheapest and dearest lot", () => {
    const result = weightedAverageBuy({
      lots: [
        { quantity: 4, price: 50 },
        { quantity: 9, price: 275.5 },
        { quantity: 2, price: 1000 },
      ],
    })!;
    expect(result.averagePrice).toBeGreaterThan(50);
    expect(result.averagePrice).toBeLessThan(1000);
  });
});

describe("never emits NaN or Infinity", () => {
  const nasty = [0, -0, 1, -1, 0.1, 100, 1e-320, 1e308, -1e308, Number.NaN, Infinity, -Infinity];

  const expectFinite = (result: unknown): void => {
    if (result === null || result === undefined) return;
    if (typeof result === "number") {
      expect(Number.isFinite(result)).toBe(true);
      return;
    }
    if (typeof result === "object") {
      for (const value of Object.values(result as Record<string, unknown>)) expectFinite(value);
    }
  };

  it("across every averageDown and weightedAverageBuy combination", () => {
    for (const existingQuantity of nasty) {
      for (const existingAvgPrice of nasty) {
        for (const newQuantity of nasty) {
          for (const newPrice of nasty) {
            expectFinite(averageDown({ existingQuantity, existingAvgPrice, newQuantity, newPrice }));
            expectFinite(
              weightedAverageBuy({
                lots: [
                  { quantity: existingQuantity, price: existingAvgPrice },
                  { quantity: newQuantity, price: newPrice },
                ],
              })
            );
          }
        }
      }
    }
  });

  it("across every requiredReturn and stopLossTargets combination", () => {
    for (const a of nasty) {
      for (const b of nasty) {
        for (const c of nasty) {
          expectFinite(requiredReturn({ currentPrice: a, targetPrice: b, years: c }));
          expectFinite(stopLossTargets({ entryPrice: a, stopLossPercent: b, targetPercent: c }));
          expectFinite(
            stopLossTargets({
              entryPrice: a,
              stopLossPercent: b,
              targetPercent: c,
              direction: "short",
            })
          );
        }
      }
    }
  });

  it("across every breakEvenAfterLoss and dividendIncomePlanner combination", () => {
    for (const a of nasty) {
      expectFinite(breakEvenAfterLoss({ lossPercent: a }));
      for (const b of nasty) {
        expectFinite(dividendIncomePlanner({ targetMonthlyIncome: a, dividendYieldPercent: b }));
      }
    }
  });
});
