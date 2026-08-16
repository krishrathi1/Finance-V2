import { describe, expect, it } from "vitest";

import {
  emiCalculator,
  inflationAdjustedValue,
  realReturn,
  retirementCorpus,
  ruleOf72,
  sipVsLumpsum,
  stepUpSip,
} from "@/shared/wealth-tools";

/**
 * The textbook annuity-due future value, written out independently of the
 * module so the month loop is checked against the formula rather than itself.
 */
const annuityDueFutureValue = (instalment: number, months: number, monthlyRate: number): number =>
  instalment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);

/**
 * A step-up SIP decomposed the other way: each year is its own 12-month
 * annuity, compounded forward to the end. Different decomposition, same answer
 * — which is the point of checking against it.
 */
const stepUpByYearlyBlocks = (
  instalment: number,
  years: number,
  annualReturnPercent: number,
  stepPercent: number
): number => {
  const i = annualReturnPercent / 12 / 100;
  const yearBlock = ((Math.pow(1 + i, 12) - 1) / i) * (1 + i);
  let total = 0;
  for (let year = 0; year < years; year += 1) {
    total +=
      instalment *
      Math.pow(1 + stepPercent / 100, year) *
      yearBlock *
      Math.pow(1 + i, 12 * (years - 1 - year));
  }
  return total;
};

const NASTY_NUMBERS = [
  0,
  -0,
  -1,
  -100,
  -1200,
  -1e308,
  1e-320,
  1e308,
  Number.NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER,
];

const isFiniteOrNull = (result: unknown): boolean => {
  if (result === null) return true;
  if (typeof result === "number") return Number.isFinite(result);
  if (typeof result === "object") {
    return Object.values(result as Record<string, unknown>).every(
      (value) => typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
    );
  }
  return false;
};

describe("stepUpSip", () => {
  it("collapses to the plain annuity-due formula when the step-up is zero", () => {
    // The month loop must agree with the closed form to the paisa, or the
    // step-up calculator and the plain SIP calculator would disagree at 0%.
    const plan = stepUpSip({
      monthly: 10_000,
      years: 10,
      annualReturnPercent: 12,
      annualStepUpPercent: 0,
    })!;
    const formula = annuityDueFutureValue(10_000, 120, 0.01);
    expect(formula).toBeCloseTo(2_323_390.76, 1);
    expect(plan.futureValue).toBeCloseTo(formula, 1);
    expect(plan.totalInvested).toBe(1_200_000);
    expect(plan.finalMonthlyAmount).toBe(10_000);
  });

  it("matches an independent year-block decomposition when stepping up", () => {
    const plan = stepUpSip({
      monthly: 10_000,
      years: 10,
      annualReturnPercent: 12,
      annualStepUpPercent: 10,
    })!;
    expect(plan.futureValue).toBeCloseTo(stepUpByYearlyBlocks(10_000, 10, 12, 10), 1);
    expect(plan.futureValue).toBeCloseTo(3_374_326.26, 1);
    expect(plan.totalInvested).toBeCloseTo(1_912_490.95, 1);
  });

  it("raises the instalment on the anniversary — nine rises in ten years, not ten", () => {
    // The first year is invested at the opening amount; the tenth year runs at
    // P × 1.1^9. Stepping ten times would overstate the final year by 10%.
    const plan = stepUpSip({
      monthly: 10_000,
      years: 10,
      annualReturnPercent: 12,
      annualStepUpPercent: 10,
    })!;
    expect(plan.finalMonthlyAmount).toBeCloseTo(10_000 * Math.pow(1.1, 9), 2);
    expect(plan.finalMonthlyAmount).toBeCloseTo(23_579.48, 2);
    expect(plan.finalMonthlyAmount).not.toBeCloseTo(10_000 * Math.pow(1.1, 10), 0);
  });

  it("holds the instalment flat through the first twelve months", () => {
    // A one-year plan never reaches an anniversary, so it is a plain SIP.
    const stepped = stepUpSip({
      monthly: 5000,
      years: 1,
      annualReturnPercent: 12,
      annualStepUpPercent: 25,
    })!;
    const flat = stepUpSip({
      monthly: 5000,
      years: 1,
      annualReturnPercent: 12,
      annualStepUpPercent: 0,
    })!;
    expect(stepped.futureValue).toBe(flat.futureValue);
    expect(stepped.totalInvested).toBe(60_000);
    expect(stepped.finalMonthlyAmount).toBe(5000);
  });

  it("reconciles: the three printed figures add up exactly as printed", () => {
    const plan = stepUpSip({
      monthly: 7777,
      years: 13,
      annualReturnPercent: 11.5,
      annualStepUpPercent: 7,
    })!;
    expect(plan.futureValue - plan.totalInvested).toBeCloseTo(plan.wealthGained, 2);
    expect(plan.wealthGained).toBeGreaterThan(0);
  });

  it("sums instalments exactly at a zero return, with no growth to hide errors", () => {
    // Two years at 10% step-up: 12 × ₹10,000 then 12 × ₹11,000.
    const plan = stepUpSip({
      monthly: 10_000,
      years: 2,
      annualReturnPercent: 0,
      annualStepUpPercent: 10,
    })!;
    expect(plan.totalInvested).toBe(252_000);
    expect(plan.futureValue).toBe(252_000);
    expect(plan.wealthGained).toBe(0);
    expect(plan.finalMonthlyAmount).toBe(11_000);
  });

  it("credits a single month one month of growth", () => {
    const plan = stepUpSip({
      monthly: 1000,
      years: 1 / 12,
      annualReturnPercent: 12,
      annualStepUpPercent: 15,
    })!;
    expect(plan.futureValue).toBe(1010);
    expect(plan.totalInvested).toBe(1000);
    expect(plan.wealthGained).toBe(10);
    expect(plan.finalMonthlyAmount).toBe(1000);
  });

  it("beats a flat SIP of the same opening instalment", () => {
    const stepped = stepUpSip({
      monthly: 10_000,
      years: 20,
      annualReturnPercent: 12,
      annualStepUpPercent: 10,
    })!;
    const flat = stepUpSip({
      monthly: 10_000,
      years: 20,
      annualReturnPercent: 12,
      annualStepUpPercent: 0,
    })!;
    expect(stepped.futureValue).toBeGreaterThan(flat.futureValue);
    expect(stepped.totalInvested).toBeGreaterThan(flat.totalInvested);
  });

  it("accepts a taper, and stops contributing at exactly -100%", () => {
    const taper = stepUpSip({
      monthly: 10_000,
      years: 2,
      annualReturnPercent: 0,
      annualStepUpPercent: -50,
    })!;
    expect(taper.totalInvested).toBe(180_000); // 12 × 10,000 + 12 × 5,000
    expect(taper.finalMonthlyAmount).toBe(5000);

    const stopped = stepUpSip({
      monthly: 10_000,
      years: 2,
      annualReturnPercent: 0,
      annualStepUpPercent: -100,
    })!;
    expect(stopped.totalInvested).toBe(120_000);
    expect(stopped.finalMonthlyAmount).toBe(0);
  });

  it("rejects a step-up below -100% — a negative instalment is a redemption", () => {
    expect(
      stepUpSip({
        monthly: 10_000,
        years: 5,
        annualReturnPercent: 12,
        annualStepUpPercent: -100.01,
      })
    ).toBeNull();
    expect(
      stepUpSip({ monthly: 10_000, years: 5, annualReturnPercent: 12, annualStepUpPercent: -500 })
    ).toBeNull();
  });

  it("bounds the horizon at a century, on the boundary", () => {
    expect(
      stepUpSip({ monthly: 1000, years: 100, annualReturnPercent: 12, annualStepUpPercent: 5 })
    ).not.toBeNull();
    expect(
      stepUpSip({ monthly: 1000, years: 100.01, annualReturnPercent: 12, annualStepUpPercent: 5 })
    ).toBeNull();
    expect(
      stepUpSip({ monthly: 1000, years: 1e6, annualReturnPercent: 12, annualStepUpPercent: 5 })
    ).toBeNull();
  });

  it("rejects a horizon that rounds to less than one instalment", () => {
    // 0.04 years is 0.48 months — no debit ever happens.
    expect(
      stepUpSip({ monthly: 1000, years: 0.04, annualReturnPercent: 12, annualStepUpPercent: 0 })
    ).toBeNull();
    // Half a month rounds up to one instalment.
    expect(
      stepUpSip({ monthly: 1000, years: 1 / 24, annualReturnPercent: 12, annualStepUpPercent: 0 })
    ).not.toBeNull();
  });

  it("rejects a monthly rate at or below total loss", () => {
    expect(
      stepUpSip({ monthly: 1000, years: 5, annualReturnPercent: -1200, annualStepUpPercent: 0 })
    ).toBeNull();
    expect(
      stepUpSip({ monthly: 1000, years: 5, annualReturnPercent: -5000, annualStepUpPercent: 0 })
    ).toBeNull();
    expect(
      stepUpSip({ monthly: 1000, years: 5, annualReturnPercent: -1199, annualStepUpPercent: 0 })
    ).not.toBeNull();
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    const base = { monthly: 1000, years: 5, annualReturnPercent: 12, annualStepUpPercent: 10 };
    expect(stepUpSip({ ...base, monthly: 0 })).toBeNull();
    expect(stepUpSip({ ...base, monthly: -1000 })).toBeNull();
    expect(stepUpSip({ ...base, years: 0 })).toBeNull();
    expect(stepUpSip({ ...base, years: -5 })).toBeNull();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(stepUpSip({ ...base, monthly: bad })).toBeNull();
      expect(stepUpSip({ ...base, years: bad })).toBeNull();
      expect(stepUpSip({ ...base, annualReturnPercent: bad })).toBeNull();
      expect(stepUpSip({ ...base, annualStepUpPercent: bad })).toBeNull();
    }
    expect(stepUpSip(null as never)).toBeNull();
    expect(stepUpSip(undefined as never)).toBeNull();
  });

  it("returns null rather than an Infinity plan on huge magnitudes", () => {
    expect(
      stepUpSip({ monthly: 1e308, years: 10, annualReturnPercent: 12, annualStepUpPercent: 0 })
    ).toBeNull();
    expect(
      stepUpSip({ monthly: 1e300, years: 100, annualReturnPercent: 100, annualStepUpPercent: 100 })
    ).toBeNull();
  });

  it("emits paise-rounded figures", () => {
    const plan = stepUpSip({
      monthly: 3333.333333,
      years: 7,
      annualReturnPercent: 13.37,
      annualStepUpPercent: 8.5,
    })!;
    for (const value of Object.values(plan)) {
      expect(Math.round(value * 100) / 100).toBe(value);
    }
  });
});

describe("realReturn", () => {
  it("applies Fisher, not the naive subtraction", () => {
    // 12% nominal against 6% inflation is 5.66% real, not 6.00%.
    const real = realReturn({ nominalReturnPercent: 12, inflationPercent: 6 })!;
    expect(real).toBeCloseTo(5.660377, 5);
    expect(real).toBeLessThan(12 - 6);
  });

  it("widens its gap from the naive answer as rates rise", () => {
    // The whole reason the shortcut is dangerous in an Indian planning context:
    // the error grows exactly where the rates are.
    const lowGap = 6 - realReturn({ nominalReturnPercent: 12, inflationPercent: 6 })!;
    const highGap = 10 - realReturn({ nominalReturnPercent: 20, inflationPercent: 10 })!;
    expect(lowGap).toBeGreaterThan(0);
    expect(highGap).toBeGreaterThan(lowGap);
  });

  it("returns the nominal rate exactly at zero inflation", () => {
    // An identity the result must not lose to rounding.
    expect(realReturn({ nominalReturnPercent: 12.345678, inflationPercent: 0 })).toBe(12.345678);
    expect(realReturn({ nominalReturnPercent: 0, inflationPercent: 0 })).toBe(0);
  });

  it("keeps its precision when the return only just beats inflation", () => {
    // The sign of this answer is the entire question, and the ratio form loses
    // it to cancellation. 1 bp of real return must survive as 1 bp.
    const real = realReturn({ nominalReturnPercent: 6.0001, inflationPercent: 6 })!;
    expect(real).toBeGreaterThan(0);
    expect(real).toBeCloseTo(0.0001 / 1.06, 12);
  });

  it("goes negative when inflation outruns the return", () => {
    const real = realReturn({ nominalReturnPercent: 6, inflationPercent: 8 })!;
    expect(real).toBeCloseTo(-1.851852, 5);
    expect(real).toBeLessThan(0);
  });

  it("credits deflation with a real return above the nominal one", () => {
    const real = realReturn({ nominalReturnPercent: 5, inflationPercent: -2 })!;
    expect(real).toBeCloseTo(7.142857, 5);
    expect(real).toBeGreaterThan(5);
  });

  it("reports a zero return as pure erosion", () => {
    expect(realReturn({ nominalReturnPercent: 0, inflationPercent: 6 })).toBeCloseTo(-5.660377, 5);
  });

  it("rejects deflation of 100% or worse, but not just above it", () => {
    expect(realReturn({ nominalReturnPercent: 10, inflationPercent: -100 })).toBeNull();
    expect(realReturn({ nominalReturnPercent: 10, inflationPercent: -150 })).toBeNull();
    const extreme = realReturn({ nominalReturnPercent: 10, inflationPercent: -99.99 })!;
    expect(extreme).not.toBeNull();
    expect(Number.isFinite(extreme)).toBe(true);
    expect(extreme).toBeGreaterThan(1_000_000);
  });

  it("rejects non-finite inputs and never emits Infinity", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(realReturn({ nominalReturnPercent: bad, inflationPercent: 6 })).toBeNull();
      expect(realReturn({ nominalReturnPercent: 12, inflationPercent: bad })).toBeNull();
    }
    // The ratio itself overflows here; that must surface as null, not Infinity.
    expect(realReturn({ nominalReturnPercent: 1e308, inflationPercent: -99.999999 })).toBeNull();
    expect(realReturn(null as never)).toBeNull();
  });
});

describe("inflationAdjustedValue", () => {
  it("prices both directions of ₹1L over 20 years at 6%", () => {
    const value = inflationAdjustedValue({ amount: 100_000, years: 20, inflationPercent: 6 })!;
    expect(value.futureNominalValue).toBeCloseTo(320_713.55, 2);
    expect(value.todaysPurchasingPower).toBeCloseTo(31_180.47, 2);
  });

  it("keeps the two directions reciprocal", () => {
    const value = inflationAdjustedValue({ amount: 50_000, years: 12, inflationPercent: 5.5 })!;
    // amount/today === future/amount, because both are the same growth factor.
    expect(value.futureNominalValue / 50_000).toBeCloseTo(50_000 / value.todaysPurchasingPower, 6);
  });

  it("returns the amount unchanged at a zero horizon", () => {
    // Zero years is a real slider position, not bad input.
    const value = inflationAdjustedValue({ amount: 100_000, years: 0, inflationPercent: 6 })!;
    expect(value.futureNominalValue).toBe(100_000);
    expect(value.todaysPurchasingPower).toBe(100_000);
  });

  it("returns the amount unchanged at zero inflation", () => {
    const value = inflationAdjustedValue({ amount: 100_000, years: 30, inflationPercent: 0 })!;
    expect(value.futureNominalValue).toBe(100_000);
    expect(value.todaysPurchasingPower).toBe(100_000);
  });

  it("inverts under deflation", () => {
    const value = inflationAdjustedValue({ amount: 100_000, years: 10, inflationPercent: -5 })!;
    expect(value.futureNominalValue).toBeLessThan(100_000);
    expect(value.todaysPurchasingPower).toBeGreaterThan(100_000);
  });

  it("compounds rather than scaling linearly", () => {
    // 6% for 20 years is 3.21x, not the 2.2x a linear reading suggests.
    const value = inflationAdjustedValue({ amount: 1, years: 20, inflationPercent: 6 })!;
    expect(value.futureNominalValue).toBeGreaterThan(1 + 0.06 * 20);
  });

  it("rejects deflation of 100% or worse", () => {
    expect(inflationAdjustedValue({ amount: 100, years: 5, inflationPercent: -100 })).toBeNull();
    expect(inflationAdjustedValue({ amount: 100, years: 5, inflationPercent: -120 })).toBeNull();
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    expect(inflationAdjustedValue({ amount: 0, years: 5, inflationPercent: 6 })).toBeNull();
    expect(inflationAdjustedValue({ amount: -100, years: 5, inflationPercent: 6 })).toBeNull();
    expect(inflationAdjustedValue({ amount: 100, years: -1, inflationPercent: 6 })).toBeNull();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(inflationAdjustedValue({ amount: bad, years: 5, inflationPercent: 6 })).toBeNull();
      expect(inflationAdjustedValue({ amount: 100, years: bad, inflationPercent: 6 })).toBeNull();
      expect(inflationAdjustedValue({ amount: 100, years: 5, inflationPercent: bad })).toBeNull();
    }
    expect(inflationAdjustedValue(null as never)).toBeNull();
  });

  it("returns null rather than Infinity when the factor overflows", () => {
    expect(inflationAdjustedValue({ amount: 1e300, years: 100, inflationPercent: 50 })).toBeNull();
    expect(inflationAdjustedValue({ amount: 1e300, years: 1e6, inflationPercent: 6 })).toBeNull();
  });

  it("bounds the horizon at a century, on the boundary", () => {
    expect(inflationAdjustedValue({ amount: 100, years: 100, inflationPercent: 6 })).not.toBeNull();
    expect(inflationAdjustedValue({ amount: 100, years: 100.01, inflationPercent: 6 })).toBeNull();
  });

  it("keeps a huge but representable amount finite instead of rounding it to Infinity", () => {
    // Scaling by 100 to round would overflow here; the figure is already
    // integral, so it must come back untouched rather than as Infinity.
    const value = inflationAdjustedValue({ amount: 1e308, years: 0, inflationPercent: 0 })!;
    expect(value).not.toBeNull();
    expect(Number.isFinite(value.futureNominalValue)).toBe(true);
    expect(value.futureNominalValue).toBe(1e308);
    expect(Number.isFinite(value.todaysPurchasingPower)).toBe(true);
  });

  it("emits paise-rounded figures", () => {
    const value = inflationAdjustedValue({ amount: 12_345.678, years: 9, inflationPercent: 6.4 })!;
    for (const amount of Object.values(value)) {
      expect(Math.round(amount * 100) / 100).toBe(amount);
    }
  });
});

describe("emiCalculator", () => {
  it("matches the figure a sanction letter prints", () => {
    // ₹50L at 8.5% over 20 years — the standard home-loan illustration.
    const loan = emiCalculator({ principal: 5_000_000, annualRatePercent: 8.5, years: 20 })!;
    expect(loan.emi).toBeCloseTo(43_391.16, 2);
    expect(loan.totalPayment).toBeCloseTo(10_413_878.8, 2);
    expect(loan.totalInterest).toBeCloseTo(5_413_878.8, 2);
  });

  it("handles a zero rate exactly as principal over months", () => {
    const loan = emiCalculator({ principal: 120_000, annualRatePercent: 0, years: 1 })!;
    expect(loan.emi).toBe(10_000);
    expect(loan.totalPayment).toBe(120_000);
    expect(loan.totalInterest).toBe(0);
  });

  it("takes the zero-rate limit when the rate underflows to nothing", () => {
    // (1+r)^n is exactly 1 in double precision here; the limit is P/n, not a
    // division by zero.
    const loan = emiCalculator({ principal: 120_000, annualRatePercent: 1e-320, years: 1 })!;
    expect(loan.emi).toBe(10_000);
    expect(loan.totalInterest).toBe(0);
  });

  it("reconciles interest against the total, with only paise of schedule residue", () => {
    const loan = emiCalculator({ principal: 733_333, annualRatePercent: 9.37, years: 7 })!;
    // Interest is exactly what the total says it is...
    expect(loan.totalInterest).toBeCloseTo(loan.totalPayment - 733_333, 2);
    // ...while 84 debits of the ROUNDED EMI drift by well under a rupee, which
    // is the residue a lender settles in the final instalment.
    expect(Math.abs(loan.totalPayment - loan.emi * 84)).toBeLessThan(1);
  });

  it("trades a higher EMI for less total interest on a shorter tenure", () => {
    const short = emiCalculator({ principal: 5_000_000, annualRatePercent: 8.5, years: 10 })!;
    const long = emiCalculator({ principal: 5_000_000, annualRatePercent: 8.5, years: 30 })!;
    expect(short.emi).toBeGreaterThan(long.emi);
    expect(short.totalInterest).toBeLessThan(long.totalInterest);
  });

  it("charges exactly one month of interest on a one-month loan", () => {
    const loan = emiCalculator({ principal: 100_000, annualRatePercent: 12, years: 1 / 12 })!;
    expect(loan.emi).toBeCloseTo(101_000, 2);
    expect(loan.totalInterest).toBeCloseTo(1000, 2);
  });

  it("rejects a negative rate — no lender pays you to borrow", () => {
    expect(emiCalculator({ principal: 100_000, annualRatePercent: -1, years: 5 })).toBeNull();
    expect(emiCalculator({ principal: 100_000, annualRatePercent: -0.0001, years: 5 })).toBeNull();
    expect(emiCalculator({ principal: 100_000, annualRatePercent: 0, years: 5 })).not.toBeNull();
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    expect(emiCalculator({ principal: 0, annualRatePercent: 9, years: 5 })).toBeNull();
    expect(emiCalculator({ principal: -100_000, annualRatePercent: 9, years: 5 })).toBeNull();
    expect(emiCalculator({ principal: 100_000, annualRatePercent: 9, years: 0 })).toBeNull();
    expect(emiCalculator({ principal: 100_000, annualRatePercent: 9, years: -5 })).toBeNull();
    // A tenure shorter than half a month has no instalment to quote.
    expect(emiCalculator({ principal: 100_000, annualRatePercent: 9, years: 0.04 })).toBeNull();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(emiCalculator({ principal: bad, annualRatePercent: 9, years: 5 })).toBeNull();
      expect(emiCalculator({ principal: 100_000, annualRatePercent: bad, years: 5 })).toBeNull();
      expect(emiCalculator({ principal: 100_000, annualRatePercent: 9, years: bad })).toBeNull();
    }
    expect(emiCalculator(null as never)).toBeNull();
  });

  it("returns null rather than NaN when compounding overflows", () => {
    expect(emiCalculator({ principal: 1e6, annualRatePercent: 12, years: 1e6 })).toBeNull();
    expect(emiCalculator({ principal: 1e300, annualRatePercent: 1e308, years: 30 })).toBeNull();
    expect(emiCalculator({ principal: 1e6, annualRatePercent: 1e6, years: 100 })).toBeNull();
  });

  it("bounds the tenure at a century — a longer loan quotes absurd instalments", () => {
    // Left unbounded, a 9-quadrillion-year tenure returns a finite eight-paise
    // EMI and a negative total interest: nonsense that looks like an answer.
    const century = { principal: 5_000_000, annualRatePercent: 8.5 };
    expect(emiCalculator({ ...century, years: 100 })).not.toBeNull();
    expect(emiCalculator({ ...century, years: 100.01 })).toBeNull();
    expect(
      emiCalculator({
        principal: Number.MAX_SAFE_INTEGER,
        annualRatePercent: 0,
        years: Number.MAX_SAFE_INTEGER,
      })
    ).toBeNull();
  });

  it("never quotes a total interest below zero", () => {
    // ₹10L over 12 months at 0% is ₹83,333.3333 a month: no paise-denominated
    // instalment sums to the principal, and the total must not go under it.
    for (const years of [1 / 12, 0.5, 1, 5, 20, 100]) {
      for (const rate of [0, 0.01, 8.5, 36]) {
        const loan = emiCalculator({ principal: 1_000_000, annualRatePercent: rate, years })!;
        expect(loan).not.toBeNull();
        expect(loan.totalInterest).toBeGreaterThanOrEqual(0);
        expect(loan.totalPayment).toBeGreaterThanOrEqual(1_000_000);
      }
    }
    const awkward = emiCalculator({ principal: 1_000_000, annualRatePercent: 0, years: 1 })!;
    expect(awkward.emi).toBe(83_333.33);
    expect(awkward.totalPayment).toBe(1_000_000);
    expect(awkward.totalInterest).toBe(0);
  });

  it("emits paise-rounded figures", () => {
    const loan = emiCalculator({ principal: 1_234_567, annualRatePercent: 8.73, years: 11 })!;
    for (const amount of Object.values(loan)) {
      expect(Math.round(amount * 100) / 100).toBe(amount);
    }
  });
});

describe("retirementCorpus", () => {
  it("inflates the expense first, then prices the annuity", () => {
    const plan = retirementCorpus({
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 20,
      inflationPercent: 6,
      postRetirementYears: 25,
      postRetirementReturnPercent: 7,
    })!;
    expect(plan.monthlyExpenseAtRetirement).toBeCloseTo(50_000 * Math.pow(1.06, 20), 2);
    expect(plan.monthlyExpenseAtRetirement).toBeCloseTo(160_356.77, 2);
    expect(plan.corpusRequired).toBeCloseTo(22_820_732.24, 1);
  });

  it("punishes skipping the inflation step, which is the classic error", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      postRetirementYears: 25,
      postRetirementReturnPercent: 7,
    };
    const inflated = retirementCorpus({ ...base, yearsToRetirement: 20, inflationPercent: 6 })!;
    const ignored = retirementCorpus({ ...base, yearsToRetirement: 20, inflationPercent: 0 })!;
    // Twenty years at 6% is a 3.2x expense, and the corpus scales with it.
    expect(inflated.corpusRequired / ignored.corpusRequired).toBeCloseTo(Math.pow(1.06, 20), 4);
  });

  it("prices withdrawals as an annuity-due, not an ordinary annuity", () => {
    // Drawing on day one costs one extra month of growth — lakhs, on this plan.
    const plan = retirementCorpus({
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 20,
      inflationPercent: 6,
      postRetirementYears: 25,
      postRetirementReturnPercent: 7,
    })!;
    const r = 7 / 12 / 100;
    // Built from the raw inflated expense, not the 2dp field, so the paisa of
    // display rounding is not amplified 142x by the annuity factor.
    const expenseAtRetirement = 50_000 * Math.pow(1.06, 20);
    const ordinary = expenseAtRetirement * ((1 - Math.pow(1 + r, -300)) / r);
    expect(plan.corpusRequired).toBeGreaterThan(ordinary);
    expect(plan.corpusRequired).toBeCloseTo(ordinary * (1 + r), 1);
    // The convention is worth lakhs, not a rounding footnote.
    expect(plan.corpusRequired - ordinary).toBeGreaterThan(100_000);
  });

  it("handles a zero post-retirement rate exactly as expense times months", () => {
    const plan = retirementCorpus({
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 0,
      inflationPercent: 0,
      postRetirementYears: 25,
      postRetirementReturnPercent: 0,
    })!;
    expect(plan.monthlyExpenseAtRetirement).toBe(50_000);
    expect(plan.corpusRequired).toBe(15_000_000);
  });

  it("takes the zero-rate limit when the rate underflows to nothing", () => {
    const plan = retirementCorpus({
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 0,
      inflationPercent: 0,
      postRetirementYears: 25,
      postRetirementReturnPercent: 1e-320,
    })!;
    expect(plan.corpusRequired).toBe(15_000_000);
  });

  it("allows retiring today", () => {
    const plan = retirementCorpus({
      monthlyExpenseToday: 80_000,
      yearsToRetirement: 0,
      inflationPercent: 6,
      postRetirementYears: 20,
      postRetirementReturnPercent: 6,
    })!;
    expect(plan.monthlyExpenseAtRetirement).toBe(80_000);
    expect(plan.corpusRequired).toBeGreaterThan(0);
  });

  it("demands more corpus as the return falls, and most of all when negative", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 10,
      inflationPercent: 6,
      postRetirementYears: 25,
    };
    const high = retirementCorpus({ ...base, postRetirementReturnPercent: 8 })!;
    const zero = retirementCorpus({ ...base, postRetirementReturnPercent: 0 })!;
    const negative = retirementCorpus({ ...base, postRetirementReturnPercent: -2 })!;
    expect(high.corpusRequired).toBeLessThan(zero.corpusRequired);
    expect(zero.corpusRequired).toBeLessThan(negative.corpusRequired);
  });

  it("grows the corpus with a longer retirement", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 15,
      inflationPercent: 6,
      postRetirementReturnPercent: 7,
    };
    const twenty = retirementCorpus({ ...base, postRetirementYears: 20 })!;
    const thirty = retirementCorpus({ ...base, postRetirementYears: 30 })!;
    expect(thirty.corpusRequired).toBeGreaterThan(twenty.corpusRequired);
  });

  it("rejects a retirement of no length, and a negative run-up", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 20,
      inflationPercent: 6,
      postRetirementReturnPercent: 7,
    };
    expect(retirementCorpus({ ...base, postRetirementYears: 0 })).toBeNull();
    expect(retirementCorpus({ ...base, postRetirementYears: -5 })).toBeNull();
    expect(retirementCorpus({ ...base, postRetirementYears: 0.04 })).toBeNull();
    expect(
      retirementCorpus({ ...base, yearsToRetirement: -1, postRetirementYears: 25 })
    ).toBeNull();
  });

  it("bounds both horizons at a century", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      inflationPercent: 6,
      postRetirementReturnPercent: 7,
    };
    expect(
      retirementCorpus({ ...base, yearsToRetirement: 100, postRetirementYears: 100 })
    ).not.toBeNull();
    expect(
      retirementCorpus({ ...base, yearsToRetirement: 101, postRetirementYears: 25 })
    ).toBeNull();
    expect(
      retirementCorpus({ ...base, yearsToRetirement: 20, postRetirementYears: 101 })
    ).toBeNull();
  });

  it("rejects impossible rates", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 20,
      postRetirementYears: 25,
    };
    expect(
      retirementCorpus({ ...base, inflationPercent: -100, postRetirementReturnPercent: 7 })
    ).toBeNull();
    expect(
      retirementCorpus({ ...base, inflationPercent: 6, postRetirementReturnPercent: -1200 })
    ).toBeNull();
    expect(
      retirementCorpus({ ...base, inflationPercent: 6, postRetirementReturnPercent: -5000 })
    ).toBeNull();
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    const base = {
      monthlyExpenseToday: 50_000,
      yearsToRetirement: 20,
      inflationPercent: 6,
      postRetirementYears: 25,
      postRetirementReturnPercent: 7,
    };
    expect(retirementCorpus({ ...base, monthlyExpenseToday: 0 })).toBeNull();
    expect(retirementCorpus({ ...base, monthlyExpenseToday: -50_000 })).toBeNull();
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(retirementCorpus({ ...base, monthlyExpenseToday: bad })).toBeNull();
      expect(retirementCorpus({ ...base, yearsToRetirement: bad })).toBeNull();
      expect(retirementCorpus({ ...base, inflationPercent: bad })).toBeNull();
      expect(retirementCorpus({ ...base, postRetirementYears: bad })).toBeNull();
      expect(retirementCorpus({ ...base, postRetirementReturnPercent: bad })).toBeNull();
    }
    expect(retirementCorpus(null as never)).toBeNull();
  });

  it("returns null rather than Infinity on huge magnitudes", () => {
    expect(
      retirementCorpus({
        monthlyExpenseToday: 1e300,
        yearsToRetirement: 100,
        inflationPercent: 100,
        postRetirementYears: 25,
        postRetirementReturnPercent: 7,
      })
    ).toBeNull();
    expect(
      retirementCorpus({
        monthlyExpenseToday: 1e308,
        yearsToRetirement: 1,
        inflationPercent: 6,
        postRetirementYears: 100,
        postRetirementReturnPercent: 0,
      })
    ).toBeNull();
  });

  it("emits paise-rounded figures", () => {
    const plan = retirementCorpus({
      monthlyExpenseToday: 43_211.11,
      yearsToRetirement: 17,
      inflationPercent: 5.7,
      postRetirementYears: 23,
      postRetirementReturnPercent: 6.3,
    })!;
    for (const amount of Object.values(plan)) {
      expect(Math.round(amount * 100) / 100).toBe(amount);
    }
  });
});

describe("ruleOf72", () => {
  it("gives the doubling times the rule is famous for", () => {
    expect(ruleOf72({ annualReturnPercent: 12 })).toBe(6);
    expect(ruleOf72({ annualReturnPercent: 8 })).toBe(9);
    expect(ruleOf72({ annualReturnPercent: 6 })).toBe(12);
    expect(ruleOf72({ annualReturnPercent: 7 })).toBe(10.29);
  });

  it("stays close to the exact logarithm it approximates", () => {
    // Exact doubling time at 12% is 6.12 years; the rule says 6.00. Close
    // enough to be useful, and the gap is the price of a mental shortcut.
    const exactAt12 = Math.log(2) / Math.log(1.12);
    expect(ruleOf72({ annualReturnPercent: 12 })!).toBeCloseTo(exactAt12, 0);
    expect(Math.abs(ruleOf72({ annualReturnPercent: 12 })! - exactAt12)).toBeLessThan(0.2);
    // It is tightest around the 8% band it was chosen for.
    const exactAt8 = Math.log(2) / Math.log(1.08);
    expect(Math.abs(ruleOf72({ annualReturnPercent: 8 })! - exactAt8)).toBeLessThan(0.01);
  });

  it("shortens monotonically as the return rises", () => {
    const rates = [1, 5, 10, 25, 100];
    const times = rates.map((rate) => ruleOf72({ annualReturnPercent: rate })!);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeLessThan(times[index - 1]);
    }
  });

  it("rejects a rate that never doubles anything", () => {
    expect(ruleOf72({ annualReturnPercent: 0 })).toBeNull();
    expect(ruleOf72({ annualReturnPercent: -0 })).toBeNull();
    expect(ruleOf72({ annualReturnPercent: -8 })).toBeNull();
    expect(ruleOf72({ annualReturnPercent: -100 })).toBeNull();
  });

  it("rejects non-finite input and never emits Infinity", () => {
    expect(ruleOf72({ annualReturnPercent: Number.NaN })).toBeNull();
    expect(ruleOf72({ annualReturnPercent: Infinity })).toBeNull();
    expect(ruleOf72({ annualReturnPercent: -Infinity })).toBeNull();
    // A subnormal rate would divide out past MAX_VALUE.
    expect(ruleOf72({ annualReturnPercent: 1e-320 })).toBeNull();
    expect(ruleOf72(null as never)).toBeNull();
  });

  it("collapses an absurd rate to an instant double rather than NaN", () => {
    const years = ruleOf72({ annualReturnPercent: 1e308 })!;
    expect(years).toBe(0);
    expect(Number.isFinite(years)).toBe(true);
  });
});

describe("sipVsLumpsum", () => {
  it("puts the lumpsum ahead whenever returns are positive", () => {
    // ₹12L in one go versus ₹1L a month for a year at 12%.
    const comparison = sipVsLumpsum({ totalAmount: 1_200_000, years: 1, annualReturnPercent: 12 })!;
    expect(comparison.lumpsumValue).toBeCloseTo(1_352_190.04, 2);
    expect(comparison.sipValue).toBeCloseTo(1_280_932.8, 2);
    expect(comparison.difference).toBeCloseTo(71_257.24, 2);
    expect(comparison.lumpsumWins).toBe(true);
  });

  it("compounds both legs on the identical monthly convention", () => {
    // Any convention gap between the legs would be misread as a timing effect.
    const comparison = sipVsLumpsum({
      totalAmount: 1_200_000,
      years: 10,
      annualReturnPercent: 12,
    })!;
    expect(comparison.lumpsumValue).toBeCloseTo(1_200_000 * Math.pow(1.01, 120), 2);
    expect(comparison.sipValue).toBeCloseTo(annuityDueFutureValue(10_000, 120, 0.01), 2);
  });

  it("widens the gap over a longer horizon", () => {
    const short = sipVsLumpsum({ totalAmount: 1_200_000, years: 1, annualReturnPercent: 12 })!;
    const long = sipVsLumpsum({ totalAmount: 1_200_000, years: 20, annualReturnPercent: 12 })!;
    expect(long.difference).toBeGreaterThan(short.difference);
    expect(long.lumpsumWins).toBe(true);
  });

  it("reports a zero rate as a tie, and a tie is not a win", () => {
    const comparison = sipVsLumpsum({ totalAmount: 1_200_000, years: 5, annualReturnPercent: 0 })!;
    expect(comparison.lumpsumValue).toBe(1_200_000);
    expect(comparison.sipValue).toBe(1_200_000);
    expect(comparison.difference).toBe(0);
    expect(comparison.lumpsumWins).toBe(false);
  });

  it("flips honestly at negative returns — staying out longer loses less", () => {
    const comparison = sipVsLumpsum({
      totalAmount: 1_200_000,
      years: 1,
      annualReturnPercent: -10,
    })!;
    expect(comparison.lumpsumValue).toBeCloseTo(1_085_350.05, 2);
    expect(comparison.sipValue).toBeCloseTo(1_136_945.35, 2);
    expect(comparison.difference).toBeLessThan(0);
    expect(comparison.lumpsumWins).toBe(false);
  });

  it("reconciles the difference against the two values it comes from", () => {
    const comparison = sipVsLumpsum({ totalAmount: 987_654, years: 7, annualReturnPercent: 13.5 })!;
    expect(comparison.lumpsumValue - comparison.sipValue).toBeCloseTo(comparison.difference, 2);
  });

  it("collapses to the amount itself over a single month", () => {
    const comparison = sipVsLumpsum({
      totalAmount: 100_000,
      years: 1 / 12,
      annualReturnPercent: 12,
    })!;
    // One month leaves no timing difference to measure.
    expect(comparison.lumpsumValue).toBe(101_000);
    expect(comparison.sipValue).toBe(101_000);
    expect(comparison.lumpsumWins).toBe(false);
  });

  it("rejects zero, negative, and non-finite inputs", () => {
    expect(sipVsLumpsum({ totalAmount: 0, years: 5, annualReturnPercent: 12 })).toBeNull();
    expect(sipVsLumpsum({ totalAmount: -1000, years: 5, annualReturnPercent: 12 })).toBeNull();
    expect(sipVsLumpsum({ totalAmount: 100_000, years: 0, annualReturnPercent: 12 })).toBeNull();
    expect(sipVsLumpsum({ totalAmount: 100_000, years: -5, annualReturnPercent: 12 })).toBeNull();
    expect(sipVsLumpsum({ totalAmount: 100_000, years: 0.04, annualReturnPercent: 12 })).toBeNull();
    expect(sipVsLumpsum({ totalAmount: 100_000, years: 5, annualReturnPercent: -1200 })).toBeNull();
    const base = { totalAmount: 100_000, years: 5, annualReturnPercent: 12 };
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(sipVsLumpsum({ ...base, totalAmount: bad })).toBeNull();
      expect(sipVsLumpsum({ ...base, years: bad })).toBeNull();
      expect(sipVsLumpsum({ ...base, annualReturnPercent: bad })).toBeNull();
    }
    expect(sipVsLumpsum(null as never)).toBeNull();
  });

  it("returns null rather than Infinity when compounding overflows", () => {
    expect(sipVsLumpsum({ totalAmount: 1e300, years: 1000, annualReturnPercent: 12 })).toBeNull();
    expect(sipVsLumpsum({ totalAmount: 1e6, years: 1e6, annualReturnPercent: 12 })).toBeNull();
    // Within the horizon cap, but the rate alone overflows the compounding.
    expect(sipVsLumpsum({ totalAmount: 1e6, years: 100, annualReturnPercent: 1e6 })).toBeNull();
  });

  it("bounds the horizon at a century, on the boundary", () => {
    const century = { totalAmount: 100_000, annualReturnPercent: 8 };
    expect(sipVsLumpsum({ ...century, years: 100 })).not.toBeNull();
    expect(sipVsLumpsum({ ...century, years: 100.01 })).toBeNull();
  });

  it("emits paise-rounded figures", () => {
    const comparison = sipVsLumpsum({
      totalAmount: 555_555,
      years: 9,
      annualReturnPercent: 11.11,
    })!;
    for (const value of [comparison.lumpsumValue, comparison.sipValue, comparison.difference]) {
      expect(Math.round(value * 100) / 100).toBe(value);
    }
  });
});

describe("wealth-tools contract", () => {
  it("never throws and never leaks NaN or Infinity across a matrix of hostile inputs", () => {
    for (const a of NASTY_NUMBERS) {
      for (const b of NASTY_NUMBERS) {
        expect(
          isFiniteOrNull(
            stepUpSip({ monthly: a, years: b, annualReturnPercent: a, annualStepUpPercent: b })
          )
        ).toBe(true);
        expect(isFiniteOrNull(realReturn({ nominalReturnPercent: a, inflationPercent: b }))).toBe(
          true
        );
        expect(
          isFiniteOrNull(inflationAdjustedValue({ amount: a, years: b, inflationPercent: a }))
        ).toBe(true);
        expect(
          isFiniteOrNull(emiCalculator({ principal: a, annualRatePercent: b, years: a }))
        ).toBe(true);
        expect(
          isFiniteOrNull(
            retirementCorpus({
              monthlyExpenseToday: a,
              yearsToRetirement: b,
              inflationPercent: a,
              postRetirementYears: b,
              postRetirementReturnPercent: a,
            })
          )
        ).toBe(true);
        expect(isFiniteOrNull(ruleOf72({ annualReturnPercent: a }))).toBe(true);
        expect(
          isFiniteOrNull(sipVsLumpsum({ totalAmount: a, years: b, annualReturnPercent: a }))
        ).toBe(true);
      }
    }
  });

  it("rejects non-object input on every entry point", () => {
    const inputs = [null, undefined, 0, "", NaN, [], true];
    for (const bad of inputs) {
      expect(stepUpSip(bad as never)).toBeNull();
      expect(realReturn(bad as never)).toBeNull();
      expect(inflationAdjustedValue(bad as never)).toBeNull();
      expect(emiCalculator(bad as never)).toBeNull();
      expect(retirementCorpus(bad as never)).toBeNull();
      expect(ruleOf72(bad as never)).toBeNull();
      expect(sipVsLumpsum(bad as never)).toBeNull();
    }
  });
});
