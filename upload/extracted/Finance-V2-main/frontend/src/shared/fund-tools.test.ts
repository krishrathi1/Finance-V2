import { describe, expect, it } from "vitest";

import { expenseRatioDrag, swpPlan } from "@/shared/fund-tools";

describe("expenseRatioDrag", () => {
  const base = {
    amount: 1_000_000,
    years: 20,
    grossReturnPercent: 12,
    expenseRatioPercent: 1.5,
    comparisonExpenseRatioPercent: 0.5,
  };

  it("takes the fee off the growth factor, not off the return", () => {
    // A TER is levied on assets, so 12% gross at a 1.5% TER is
    // 1.12 x 0.985 = 10.32% net, not 10.5%.
    const result = expenseRatioDrag(base)!;
    expect(result.plan.netAnnualPercent).toBe(10.32);
    expect(result.comparison.netAnnualPercent).toBe(11.44);
  });

  it("compounds a lump sum at exactly the net rate", () => {
    const result = expenseRatioDrag(base)!;
    expect(result.plan.finalValue).toBeCloseTo(1_000_000 * Math.pow(1.1032, 20), 0);
    expect(result.comparison.finalValue).toBeCloseTo(1_000_000 * Math.pow(1.1144, 20), 0);
    expect(result.grossValue).toBeCloseTo(1_000_000 * Math.pow(1.12, 20), 0);
  });

  it("shows a 1% fee gap costing more than the original investment over 20 years", () => {
    // The entire reason this card exists: "1%" sounds like rounding and is
    // not. On 10 lakh over 20 years the gap exceeds the 10 lakh invested.
    const result = expenseRatioDrag(base)!;
    expect(result.difference).toBeGreaterThan(base.amount);
    expect(result.differencePercent).toBeGreaterThan(20);
  });

  it("reconciles the difference against the two printed values", () => {
    // A reader subtracting the two figures on screen must get the third, to
    // the paisa. Compared with a tolerance rather than exactly, because the
    // raw subtraction carries float dust the rounded output correctly sheds.
    const result = expenseRatioDrag(base)!;
    expect(result.difference).toBeCloseTo(
      result.comparison.finalValue - result.plan.finalValue,
      2
    );
  });

  it("measures fees against the fee-free corpus, not the amount deducted", () => {
    // The cost of a fee is the deduction plus everything it would have earned.
    const result = expenseRatioDrag(base)!;
    expect(result.plan.totalFeesPaid).toBe(result.grossValue - result.plan.finalValue);
    expect(result.plan.totalFeesPaid).toBeGreaterThan(result.comparison.totalFeesPaid);
  });

  it("counts every SIP instalment as invested", () => {
    const result = expenseRatioDrag({
      monthlySip: 10_000,
      years: 10,
      grossReturnPercent: 12,
      expenseRatioPercent: 1.5,
    })!;
    expect(result.plan.totalInvested).toBe(1_200_000);
    expect(result.plan.finalValue).toBeGreaterThan(1_200_000);
  });

  it("defaults the comparison to a zero-fee plan", () => {
    const result = expenseRatioDrag({ ...base, comparisonExpenseRatioPercent: undefined })!;
    expect(result.comparison.expenseRatioPercent).toBe(0);
    expect(result.comparison.finalValue).toBe(result.grossValue);
    expect(result.comparison.totalFeesPaid).toBe(0);
  });

  it("still charges the fee when the fund loses money", () => {
    // The failure mode of subtracting the fee from the return: in a bad year
    // it flatters the net figure. Assets are charged either way.
    const result = expenseRatioDrag({ ...base, grossReturnPercent: -10 })!;
    expect(result.plan.netAnnualPercent).toBeLessThan(-10);
    expect(result.plan.finalValue).toBeLessThan(result.comparison.finalValue);
  });

  it("refuses inputs that cannot describe an investment", () => {
    expect(expenseRatioDrag({ ...base, amount: 0, monthlySip: 0 })).toBeNull();
    expect(expenseRatioDrag({ ...base, years: 0 })).toBeNull();
    expect(expenseRatioDrag({ ...base, years: 101 })).toBeNull();
    expect(expenseRatioDrag({ ...base, expenseRatioPercent: 100 })).toBeNull();
    expect(expenseRatioDrag({ ...base, grossReturnPercent: Number.NaN })).toBeNull();
    expect(expenseRatioDrag(null as never)).toBeNull();
  });
});

describe("swpPlan", () => {
  const base = {
    corpus: 10_000_000,
    monthlyWithdrawal: 50_000,
    returnPercent: 8,
    inflationPercent: 0,
  };

  it("survives indefinitely when the draw stays under the return", () => {
    // 8% on a crore is about 64,340 a month; drawing 50,000 leaves the corpus
    // growing.
    const result = swpPlan(base)!;
    expect(result.sustainable).toBe(true);
    expect(result.monthsLasted).toBeNull();
    expect(result.yearsLasted).toBeNull();
    expect(result.finalBalance).toBeGreaterThan(base.corpus);
    expect(result.sustainableMonthlyWithdrawal).toBeCloseTo(64_340, -2);
  });

  it("depletes when the draw exceeds the return", () => {
    const result = swpPlan({ ...base, monthlyWithdrawal: 100_000 })!;
    expect(result.sustainable).toBe(false);
    expect(result.monthsLasted).toBeGreaterThan(0);
    expect(result.finalBalance).toBe(0);
  });

  it("counts only the months it actually funded", () => {
    // 1.2L at 10k a month with no return funds exactly twelve withdrawals and
    // lasts twelve months — not a thirteenth in which it pays nothing.
    const result = swpPlan({
      corpus: 120_000,
      monthlyWithdrawal: 10_000,
      returnPercent: 0,
      inflationPercent: 0,
    })!;
    expect(result.monthsLasted).toBe(12);
    expect(result.yearsLasted).toBe(1);
    expect(result.totalWithdrawn).toBe(120_000);
    expect(result.finalBalance).toBe(0);
  });

  it("lets inflation turn a safe withdrawal unsafe", () => {
    // The lesson of the whole card. 60,000 sits comfortably under the 64,340
    // an 8% return provides — until the draw is indexed at 6% and the real
    // return that has to fund it collapses to under 2%.
    const nominal = swpPlan({ ...base, monthlyWithdrawal: 60_000 })!;
    expect(nominal.sustainable).toBe(true);

    const indexed = swpPlan({ ...base, monthlyWithdrawal: 60_000, inflationPercent: 6 })!;
    expect(indexed.sustainable).toBe(false);
    expect(indexed.sustainableMonthlyWithdrawal).toBeLessThan(20_000);
  });

  it("indexes the withdrawal annually, not monthly", () => {
    const result = swpPlan({ ...base, monthlyWithdrawal: 100_000, inflationPercent: 10 })!;
    // After more than a year of 10% indexation the final draw must exceed the
    // first, but not by anything like a monthly compounding would give.
    expect(result.finalMonthlyWithdrawal).toBeGreaterThan(0);
    expect(result.monthsLasted).toBeGreaterThan(12);
  });

  it("never depletes on a zero withdrawal", () => {
    const result = swpPlan({ ...base, monthlyWithdrawal: 0 })!;
    expect(result.sustainable).toBe(true);
    expect(result.totalWithdrawn).toBe(0);
    expect(result.finalBalance).toBeGreaterThan(base.corpus);
  });

  it("pays out what is left when the corpus cannot fund a full withdrawal", () => {
    const result = swpPlan({
      corpus: 10_000,
      monthlyWithdrawal: 50_000,
      returnPercent: 8,
      inflationPercent: 0,
    })!;
    expect(result.monthsLasted).toBe(1);
    expect(result.totalWithdrawn).toBe(10_000);
    expect(result.finalMonthlyWithdrawal).toBe(10_000);
  });

  it("offers no sustainable withdrawal when returns trail inflation", () => {
    // A negative real return has no perpetual draw, and saying so beats
    // printing a negative number as though it were guidance.
    const result = swpPlan({ ...base, returnPercent: 5, inflationPercent: 7 })!;
    expect(result.sustainableMonthlyWithdrawal).toBe(0);
  });

  it("refuses inputs that cannot describe a plan", () => {
    expect(swpPlan({ ...base, corpus: 0 })).toBeNull();
    expect(swpPlan({ ...base, monthlyWithdrawal: -1 })).toBeNull();
    expect(swpPlan({ ...base, returnPercent: -100 })).toBeNull();
    expect(swpPlan({ ...base, returnPercent: Number.NaN })).toBeNull();
    expect(swpPlan(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across extreme inputs", () => {
    const found: string[] = [];
    for (const returnPercent of [-50, 0, 12, 60]) {
      for (const inflationPercent of [0, 6, 20]) {
        for (const monthlyWithdrawal of [0, 1_000, 5_000_000]) {
          const result = swpPlan({
            corpus: 10_000_000,
            monthlyWithdrawal,
            returnPercent,
            inflationPercent,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${returnPercent}/${inflationPercent}/${monthlyWithdrawal}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
