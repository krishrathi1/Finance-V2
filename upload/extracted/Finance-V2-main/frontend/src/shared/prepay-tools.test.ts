import { describe, expect, it } from "vitest";

import { emiFor, prepayVsInvest } from "@/shared/prepay-tools";

describe("emiFor", () => {
  it("matches the EMI an Indian lender would quote", () => {
    // 50 lakh at 8.5% over 20 years is about 43,391 a month — a figure any
    // bank's own calculator will agree with.
    expect(emiFor(5_000_000, 8.5, 240)!).toBeCloseTo(43_391, 0);
  });

  it("divides the annual rate by twelve rather than taking its twelfth root", () => {
    // Indian lenders charge rate/12 monthly. A true annual-equivalent
    // conversion would give a smaller monthly rate and understate every EMI.
    const quoted = emiFor(5_000_000, 8.5, 240)!;
    const wrongConvention =
      (5_000_000 *
        (Math.pow(1.085, 1 / 12) - 1) *
        Math.pow(Math.pow(1.085, 1 / 12), 240)) /
      (Math.pow(Math.pow(1.085, 1 / 12), 240) - 1);
    expect(quoted).toBeGreaterThan(wrongConvention);
  });

  it("splits the principal evenly at a zero rate", () => {
    expect(emiFor(120_000, 0, 12)!).toBe(10_000);
  });

  it("refuses inputs that cannot describe a loan", () => {
    expect(emiFor(0, 8.5, 240)).toBeNull();
    expect(emiFor(5_000_000, 8.5, 0)).toBeNull();
    expect(emiFor(5_000_000, Number.NaN, 240)).toBeNull();
  });
});

describe("prepayVsInvest", () => {
  const base = {
    outstandingPrincipal: 5_000_000,
    annualRatePercent: 8.5,
    remainingMonths: 240,
    surplus: 500_000,
    expectedReturnPercent: 12,
    taxPercent: 12.5,
  };

  it("shows a small prepayment cutting years off the loan", () => {
    // 5 lakh against a 50 lakh loan clears roughly 52 months — over four
    // years — because every rupee comes off the principal that the whole
    // remaining interest is computed on.
    const result = prepayVsInvest(base)!;
    expect(result.emi).toBeCloseTo(43_391, 0);
    expect(result.monthsSaved).toBeGreaterThan(50);
    expect(result.monthsSaved).toBeLessThan(54);
  });

  it("saves far more interest than the sum prepaid", () => {
    // About 17.6 lakh of interest saved for 5 lakh paid — the number that
    // makes prepayment look unanswerable before the other side is costed.
    const result = prepayVsInvest(base)!;
    expect(result.interestSaved).toBeGreaterThan(1_700_000);
    expect(result.interestSaved).toBeLessThan(1_800_000);
    expect(result.originalInterest).toBeGreaterThan(5_000_000);
  });

  it("reconciles interest saved against the two interest figures", () => {
    const result = prepayVsInvest(base)!;
    expect(result.interestSaved).toBeCloseTo(
      result.originalInterest - result.interestAfterPrepay,
      2
    );
  });

  it("reports the pre-tax return needed to match a tax-free saving", () => {
    // An 8.5% saving taxed at nothing is matched only by 8.5/(1-0.125) =
    // 9.71% before tax. This is the correction the naive comparison misses.
    const result = prepayVsInvest(base)!;
    expect(result.taxAdjustedLoanRatePercent).toBeCloseTo(9.71, 2);
    expect(result.taxAdjustedLoanRatePercent).toBeGreaterThan(base.annualRatePercent);
  });

  it("runs both choices to the same finishing line", () => {
    // The comparison only works because both branches spend the same cash and
    // end on the same date, so both must produce a real terminal figure.
    const result = prepayVsInvest(base)!;
    expect(result.wealthIfPrepaid).toBeGreaterThan(0);
    expect(result.wealthIfInvested).toBeGreaterThan(0);
    expect(result.advantageOfInvesting).toBeCloseTo(
      result.wealthIfInvested - result.wealthIfPrepaid,
      2
    );
    expect(result.investingWins).toBe(result.advantageOfInvesting > 0);
  });

  it("favours prepaying when the expected return is poor", () => {
    const result = prepayVsInvest({ ...base, expectedReturnPercent: 5 })!;
    expect(result.investingWins).toBe(false);
  });

  it("favours investing when the expected return is strong", () => {
    const result = prepayVsInvest({ ...base, expectedReturnPercent: 20 })!;
    expect(result.investingWins).toBe(true);
  });

  it("puts the break-even return between those two answers", () => {
    // The crossing must actually separate the cases either side of it,
    // otherwise the number is decorative.
    const result = prepayVsInvest(base)!;
    const breakEven = result.breakEvenReturnPercent!;
    expect(breakEven).toBeGreaterThan(0);
    expect(breakEven).toBeLessThan(50);

    const justBelow = prepayVsInvest({ ...base, expectedReturnPercent: breakEven - 1 })!;
    const justAbove = prepayVsInvest({ ...base, expectedReturnPercent: breakEven + 1 })!;
    expect(justBelow.investingWins).toBe(false);
    expect(justAbove.investingWins).toBe(true);
  });

  it("raises the bar as the tax on gains rises", () => {
    // A higher tax on the investment side makes the tax-free loan saving
    // harder to beat, so the break-even return must rise.
    const lowTax = prepayVsInvest({ ...base, taxPercent: 0 })!;
    const highTax = prepayVsInvest({ ...base, taxPercent: 30 })!;
    expect(highTax.breakEvenReturnPercent!).toBeGreaterThan(lowTax.breakEvenReturnPercent!);
    expect(highTax.taxAdjustedLoanRatePercent).toBeGreaterThan(
      lowTax.taxAdjustedLoanRatePercent
    );
  });

  it("treats a surplus covering the whole loan as a closure, not a comparison", () => {
    expect(prepayVsInvest({ ...base, surplus: 5_000_000 })).toBeNull();
    expect(prepayVsInvest({ ...base, surplus: 6_000_000 })).toBeNull();
  });

  it("refuses inputs that cannot describe the choice", () => {
    expect(prepayVsInvest({ ...base, outstandingPrincipal: 0 })).toBeNull();
    expect(prepayVsInvest({ ...base, remainingMonths: 0 })).toBeNull();
    expect(prepayVsInvest({ ...base, remainingMonths: 481 })).toBeNull();
    expect(prepayVsInvest({ ...base, surplus: 0 })).toBeNull();
    expect(prepayVsInvest({ ...base, annualRatePercent: Number.NaN })).toBeNull();
    expect(prepayVsInvest(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across a swept grid", () => {
    const found: string[] = [];
    for (const annualRatePercent of [6, 8.5, 18]) {
      for (const expectedReturnPercent of [-20, 0, 12, 40]) {
        for (const remainingMonths of [6, 120, 360]) {
          const result = prepayVsInvest({
            ...base,
            annualRatePercent,
            expectedReturnPercent,
            remainingMonths,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${annualRatePercent}/${expectedReturnPercent}/${remainingMonths}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
