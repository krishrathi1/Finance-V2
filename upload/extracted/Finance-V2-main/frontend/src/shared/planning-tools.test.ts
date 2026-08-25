import { describe, expect, it } from "vitest";

import {
  cagr,
  lumpsumFutureValue,
  positionSize,
  sipForGoal,
  sipFutureValue,
} from "@/shared/planning-tools";

describe("positionSize", () => {
  it("sizes a long from the risk budget, not the capital", () => {
    // 1% of 10L is ₹10,000 of risk; ₹5 at stake per share buys 2,000 shares —
    // a ₹2L position, even though the account could afford five times that.
    const plan = positionSize({ capital: 1_000_000, riskPercent: 1, entry: 100, stopLoss: 95 })!;
    expect(plan.direction).toBe("long");
    expect(plan.riskAmount).toBe(10_000);
    expect(plan.riskPerShare).toBe(5);
    expect(plan.quantity).toBe(2000);
    expect(plan.positionValue).toBe(200_000);
    expect(plan.capitalSharePercent).toBe(20);
    expect(plan.exceedsCapital).toBe(false);
  });

  it("infers a short from a stop above entry and measures reward downward", () => {
    const plan = positionSize({
      capital: 500_000,
      riskPercent: 2,
      entry: 100,
      stopLoss: 105,
      target: 90,
    })!;
    expect(plan.direction).toBe("short");
    expect(plan.riskPerShare).toBe(5);
    expect(plan.quantity).toBe(2000);
    expect(plan.rewardPerShare).toBe(10);
    expect(plan.rewardRiskRatio).toBe(2);
  });

  it("computes reward:risk when the target is on the profitable side", () => {
    const plan = positionSize({
      capital: 1_000_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 95,
      target: 115,
    })!;
    expect(plan.rewardPerShare).toBe(15);
    expect(plan.rewardRiskRatio).toBe(3);
  });

  it("refuses a ratio for a target on the losing side of entry", () => {
    // A "target" below a long entry is a second stop, not a reward.
    const longPlan = positionSize({
      capital: 1_000_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 95,
      target: 90,
    })!;
    expect(longPlan.rewardPerShare).toBeNull();
    expect(longPlan.rewardRiskRatio).toBeNull();

    const shortPlan = positionSize({
      capital: 1_000_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 105,
      target: 120,
    })!;
    expect(shortPlan.rewardRiskRatio).toBeNull();

    // A target exactly at entry offers no reward either.
    const flatTarget = positionSize({
      capital: 1_000_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 95,
      target: 100,
    })!;
    expect(flatTarget.rewardRiskRatio).toBeNull();
  });

  it("treats a missing or garbled target as no target, not as bad input", () => {
    const base = { capital: 1_000_000, riskPercent: 1, entry: 100, stopLoss: 95 };
    for (const target of [undefined, null, Number.NaN, 0, -50, Infinity]) {
      const plan = positionSize({ ...base, target })!;
      expect(plan).not.toBeNull();
      expect(plan.quantity).toBe(2000);
      expect(plan.rewardPerShare).toBeNull();
      expect(plan.rewardRiskRatio).toBeNull();
    }
  });

  it("floors quantity rather than overshooting the risk budget", () => {
    // ₹10,000 / ₹3 = 3333.33 shares; rounding up would risk more than asked.
    const plan = positionSize({ capital: 1_000_000, riskPercent: 1, entry: 100, stopLoss: 97 })!;
    expect(plan.quantity).toBe(3333);
  });

  it("returns quantity 0, not null, when the budget cannot afford one share", () => {
    // ₹10 of risk against ₹50 per share: the plan exists, the answer is "none".
    const plan = positionSize({ capital: 1000, riskPercent: 1, entry: 100, stopLoss: 50 })!;
    expect(plan.quantity).toBe(0);
    expect(plan.positionValue).toBe(0);
    expect(plan.capitalSharePercent).toBe(0);
    expect(plan.exceedsCapital).toBe(false);
    // The per-share numbers survive so the caller can explain the shortfall.
    expect(plan.riskAmount).toBe(10);
    expect(plan.riskPerShare).toBe(50);
  });

  it("flags a tight stop that sizes past the account instead of capping it", () => {
    // 2% of 1L is ₹2,000; a ₹1 stop buys 2,000 shares at ₹500 — a ₹10L
    // position on ₹1L of capital.
    const plan = positionSize({ capital: 100_000, riskPercent: 2, entry: 500, stopLoss: 499 })!;
    expect(plan.quantity).toBe(2000);
    expect(plan.positionValue).toBe(1_000_000);
    expect(plan.exceedsCapital).toBe(true);
    expect(plan.capitalSharePercent).toBe(1000);
  });

  it("rejects a stop equal to entry — no defined risk per share", () => {
    expect(positionSize({ capital: 100_000, riskPercent: 1, entry: 100, stopLoss: 100 })).toBeNull();
  });

  it("rejects risking the whole account or more", () => {
    expect(positionSize({ capital: 100_000, riskPercent: 100, entry: 100, stopLoss: 95 })).toBeNull();
    expect(positionSize({ capital: 100_000, riskPercent: 250, entry: 100, stopLoss: 95 })).toBeNull();
    expect(
      positionSize({ capital: 100_000, riskPercent: 99.9, entry: 100, stopLoss: 95 })
    ).not.toBeNull();
  });

  it("rejects zero or negative required inputs", () => {
    expect(positionSize({ capital: 0, riskPercent: 1, entry: 100, stopLoss: 95 })).toBeNull();
    expect(positionSize({ capital: -1, riskPercent: 1, entry: 100, stopLoss: 95 })).toBeNull();
    expect(positionSize({ capital: 100_000, riskPercent: 0, entry: 100, stopLoss: 95 })).toBeNull();
    expect(positionSize({ capital: 100_000, riskPercent: 1, entry: 0, stopLoss: 95 })).toBeNull();
    expect(positionSize({ capital: 100_000, riskPercent: 1, entry: -5, stopLoss: 95 })).toBeNull();
    expect(positionSize({ capital: 100_000, riskPercent: 1, entry: 100, stopLoss: 0 })).toBeNull();
    expect(positionSize({ capital: 100_000, riskPercent: 1, entry: 100, stopLoss: -5 })).toBeNull();
  });

  it("rejects non-finite required inputs", () => {
    const base = { capital: 100_000, riskPercent: 1, entry: 100, stopLoss: 95 };
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(positionSize({ ...base, capital: bad })).toBeNull();
      expect(positionSize({ ...base, riskPercent: bad })).toBeNull();
      expect(positionSize({ ...base, entry: bad })).toBeNull();
      expect(positionSize({ ...base, stopLoss: bad })).toBeNull();
    }
    expect(positionSize(null as never)).toBeNull();
  });

  it("returns null rather than an Infinity plan on degenerate magnitudes", () => {
    // Subnormal prices against a large budget push quantity past MAX_VALUE.
    expect(
      positionSize({ capital: 1e308, riskPercent: 50, entry: 1e-300, stopLoss: 0.5e-300 })
    ).toBeNull();
  });
});

describe("sipFutureValue", () => {
  it("handles a zero rate exactly as contributions times months", () => {
    expect(sipFutureValue({ monthly: 1000, years: 2, annualReturnPercent: 0 })).toBe(24_000);
  });

  it("matches the figure mainstream SIP calculators publish", () => {
    // ₹10,000/month for 10 years at 12%: every AMC calculator quotes
    // ~₹23.23L, because they all use i = 12/12/100 = 1% per month.
    const fv = sipFutureValue({ monthly: 10_000, years: 10, annualReturnPercent: 12 })!;
    expect(fv).toBeCloseTo(2_323_391, -2);
  });

  it("credits a single contribution one month of growth", () => {
    // n = 1 collapses the formula to P × (1+i): month-start contribution,
    // valued at month end.
    const fv = sipFutureValue({ monthly: 1000, years: 1 / 12, annualReturnPercent: 12 })!;
    expect(fv).toBeCloseTo(1010, 8);
  });

  it("grows with the rate", () => {
    const at8 = sipFutureValue({ monthly: 5000, years: 15, annualReturnPercent: 8 })!;
    const at12 = sipFutureValue({ monthly: 5000, years: 15, annualReturnPercent: 12 })!;
    expect(at12).toBeGreaterThan(at8);
    expect(at8).toBeGreaterThan(5000 * 180);
  });

  it("erodes below the invested amount at a negative rate, but stays positive", () => {
    const fv = sipFutureValue({ monthly: 1000, years: 1, annualReturnPercent: -12 })!;
    expect(fv).toBeLessThan(12_000);
    expect(fv).toBeGreaterThan(0);
    expect(fv).toBeCloseTo(11_248, 0);
  });

  it("rejects a monthly rate at or below total loss", () => {
    expect(sipFutureValue({ monthly: 1000, years: 1, annualReturnPercent: -1200 })).toBeNull();
    expect(sipFutureValue({ monthly: 1000, years: 1, annualReturnPercent: -5000 })).toBeNull();
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    expect(sipFutureValue({ monthly: 0, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(sipFutureValue({ monthly: -500, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(sipFutureValue({ monthly: 1000, years: 0, annualReturnPercent: 12 })).toBeNull();
    expect(sipFutureValue({ monthly: 1000, years: -1, annualReturnPercent: 12 })).toBeNull();
    expect(sipFutureValue({ monthly: Number.NaN, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(sipFutureValue({ monthly: 1000, years: Infinity, annualReturnPercent: 12 })).toBeNull();
    expect(
      sipFutureValue({ monthly: 1000, years: 10, annualReturnPercent: Number.NaN })
    ).toBeNull();
    expect(sipFutureValue(null as never)).toBeNull();
  });

  it("returns null rather than Infinity when the horizon overflows", () => {
    expect(sipFutureValue({ monthly: 1e6, years: 1e5, annualReturnPercent: 12 })).toBeNull();
  });
});

describe("sipForGoal", () => {
  it("inverts the zero-rate case exactly", () => {
    expect(sipForGoal({ targetAmount: 24_000, years: 2, annualReturnPercent: 0 })).toBe(1000);
  });

  it("rounds up, never to nearest — a plan must not undershoot its own goal", () => {
    // ₹24,010 over 24 months needs ₹1,000.42/month; nearest-rupee rounding
    // would quote ₹1,000 and finish ₹10 short.
    expect(sipForGoal({ targetAmount: 24_010, years: 2, annualReturnPercent: 0 })).toBe(1001);
  });

  it("always returns a whole rupee", () => {
    const monthly = sipForGoal({ targetAmount: 1_000_000, years: 10, annualReturnPercent: 12 })!;
    expect(Number.isInteger(monthly)).toBe(true);
  });

  it("round-trips: the planned SIP reaches the goal, within 0.1% of it", () => {
    const cases = [
      { targetAmount: 24_000, years: 2, annualReturnPercent: 0 },
      { targetAmount: 500_000, years: 3, annualReturnPercent: 8 },
      { targetAmount: 1_000_000, years: 10, annualReturnPercent: 12 },
      { targetAmount: 25_000_000, years: 20, annualReturnPercent: 10 },
      { targetAmount: 12_345_678, years: 7, annualReturnPercent: 15 },
    ];
    for (const goal of cases) {
      const monthly = sipForGoal(goal)!;
      expect(monthly).not.toBeNull();
      const achieved = sipFutureValue({
        monthly,
        years: goal.years,
        annualReturnPercent: goal.annualReturnPercent,
      })!;
      // Rounding up must never leave the goal short...
      expect(achieved).toBeGreaterThanOrEqual(goal.targetAmount);
      // ...and one extra rupee a month must not blow materially past it.
      expect(achieved).toBeLessThanOrEqual(goal.targetAmount * 1.001);
    }
  });

  it("floors a trivially small goal at one rupee a month", () => {
    const monthly = sipForGoal({ targetAmount: 1, years: 10, annualReturnPercent: 12 })!;
    expect(monthly).toBe(1);
    const achieved = sipFutureValue({ monthly, years: 10, annualReturnPercent: 12 })!;
    expect(achieved).toBeGreaterThanOrEqual(1);
  });

  it("rejects zero, negative, non-finite, and total-loss inputs", () => {
    expect(sipForGoal({ targetAmount: 0, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(sipForGoal({ targetAmount: -1, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(sipForGoal({ targetAmount: 1_000_000, years: 0, annualReturnPercent: 12 })).toBeNull();
    expect(
      sipForGoal({ targetAmount: 1_000_000, years: 10, annualReturnPercent: -1200 })
    ).toBeNull();
    expect(
      sipForGoal({ targetAmount: Number.NaN, years: 10, annualReturnPercent: 12 })
    ).toBeNull();
    expect(sipForGoal({ targetAmount: Infinity, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(sipForGoal(null as never)).toBeNull();
  });

  it("returns null when the horizon overflows the growth factor", () => {
    expect(sipForGoal({ targetAmount: 1_000_000, years: 1e5, annualReturnPercent: 12 })).toBeNull();
  });
});

describe("lumpsumFutureValue", () => {
  it("compounds annually to the textbook figure", () => {
    // ₹1L at 12% for 10 years ≈ ₹3.11L — the number every fund factsheet's
    // "growth of ₹1 lakh" chart lands on.
    const fv = lumpsumFutureValue({ amount: 100_000, years: 10, annualReturnPercent: 12 })!;
    expect(fv).toBeCloseTo(310_584.82, 1);
  });

  it("returns the principal unchanged at a zero rate", () => {
    expect(lumpsumFutureValue({ amount: 100_000, years: 5, annualReturnPercent: 0 })).toBe(100_000);
  });

  it("supports fractional years", () => {
    const fv = lumpsumFutureValue({ amount: 100_000, years: 0.5, annualReturnPercent: 12 })!;
    expect(fv).toBeCloseTo(105_830.05, 1);
  });

  it("shrinks at a negative rate and compounds to zero at exactly -100%", () => {
    expect(lumpsumFutureValue({ amount: 100_000, years: 1, annualReturnPercent: -10 })).toBeCloseTo(
      90_000,
      8
    );
    // Losing everything is a legitimate outcome; losing more than everything
    // is not a rate.
    expect(lumpsumFutureValue({ amount: 100_000, years: 3, annualReturnPercent: -100 })).toBe(0);
    expect(lumpsumFutureValue({ amount: 100_000, years: 3, annualReturnPercent: -150 })).toBeNull();
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    expect(lumpsumFutureValue({ amount: 0, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(lumpsumFutureValue({ amount: -100, years: 10, annualReturnPercent: 12 })).toBeNull();
    expect(lumpsumFutureValue({ amount: 100_000, years: 0, annualReturnPercent: 12 })).toBeNull();
    expect(lumpsumFutureValue({ amount: 100_000, years: -2, annualReturnPercent: 12 })).toBeNull();
    expect(
      lumpsumFutureValue({ amount: Number.NaN, years: 10, annualReturnPercent: 12 })
    ).toBeNull();
    expect(
      lumpsumFutureValue({ amount: 100_000, years: Infinity, annualReturnPercent: 12 })
    ).toBeNull();
    expect(lumpsumFutureValue(null as never)).toBeNull();
  });

  it("returns null rather than Infinity when compounding overflows", () => {
    expect(lumpsumFutureValue({ amount: 1e300, years: 1000, annualReturnPercent: 12 })).toBeNull();
  });
});

describe("cagr", () => {
  it("reports a 3-year double as ~26%, not the arithmetic 33%", () => {
    const rate = cagr({ startValue: 100, endValue: 200, years: 3 })!;
    expect(rate).toBeCloseTo(25.99, 1);
    expect(rate).toBeLessThan(100 / 3);
  });

  it("collapses to the simple return over one year", () => {
    expect(cagr({ startValue: 100, endValue: 112, years: 1 })).toBeCloseTo(12, 8);
  });

  it("reports a decline as a negative rate, not an error", () => {
    const rate = cagr({ startValue: 200, endValue: 100, years: 3 })!;
    expect(rate).toBeCloseTo(-20.63, 1);
  });

  it("reports a flat journey as zero", () => {
    expect(cagr({ startValue: 500, endValue: 500, years: 5 })).toBeCloseTo(0, 8);
  });

  it("annualises spans shorter than a year", () => {
    // +10% in half a year compounds to 21% annualised, not 20%.
    expect(cagr({ startValue: 100, endValue: 110, years: 0.5 })).toBeCloseTo(21, 5);
  });

  it("handles large but representable growth", () => {
    expect(cagr({ startValue: 1, endValue: 1e10, years: 10 })).toBeCloseTo(900, 5);
  });

  it("rejects non-positive start, end, or span", () => {
    expect(cagr({ startValue: 0, endValue: 100, years: 3 })).toBeNull();
    expect(cagr({ startValue: -100, endValue: 100, years: 3 })).toBeNull();
    expect(cagr({ startValue: 100, endValue: 0, years: 3 })).toBeNull();
    expect(cagr({ startValue: 100, endValue: -50, years: 3 })).toBeNull();
    expect(cagr({ startValue: 100, endValue: 200, years: 0 })).toBeNull();
    expect(cagr({ startValue: 100, endValue: 200, years: -1 })).toBeNull();
  });

  it("rejects non-finite inputs and never emits Infinity", () => {
    expect(cagr({ startValue: Number.NaN, endValue: 100, years: 3 })).toBeNull();
    expect(cagr({ startValue: 100, endValue: Infinity, years: 3 })).toBeNull();
    expect(cagr({ startValue: 100, endValue: 200, years: Number.NaN })).toBeNull();
    // end/start itself overflows to Infinity here; that must surface as null.
    expect(cagr({ startValue: 1e-308, endValue: 1e308, years: 1 })).toBeNull();
    expect(cagr(null as never)).toBeNull();
  });
});
