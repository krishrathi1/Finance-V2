import { describe, expect, it } from "vitest";

import { coastFire, timeToGoal } from "@/shared/goal-tools";
import { sipFutureValue } from "@/shared/planning-tools";

describe("timeToGoal", () => {
  it("agrees with sipFutureValue at the horizon it reports", () => {
    // The two modules must never disagree about the same plan: at the month
    // timeToGoal returns, a SIP of the same size must have reached the target.
    const result = timeToGoal({
      currentAmount: 0,
      monthlyInvestment: 25_000,
      targetAmount: 5_000_000,
      annualReturnPercent: 12,
    })!;
    const reached = sipFutureValue({
      monthly: 25_000,
      years: result.months / 12,
      annualReturnPercent: 12,
    })!;
    expect(reached).toBeGreaterThanOrEqual(5_000_000);
  });

  it("counts a head start", () => {
    const fromZero = timeToGoal({
      currentAmount: 0,
      monthlyInvestment: 20_000,
      targetAmount: 2_000_000,
      annualReturnPercent: 12,
    })!;
    const withStart = timeToGoal({
      currentAmount: 500_000,
      monthlyInvestment: 20_000,
      targetAmount: 2_000_000,
      annualReturnPercent: 12,
    })!;
    expect(withStart.months).toBeLessThan(fromZero.months);
  });

  it("reports zero months when the balance already clears the target", () => {
    const result = timeToGoal({
      currentAmount: 1_000_000,
      monthlyInvestment: 10_000,
      targetAmount: 500_000,
      annualReturnPercent: 12,
    })!;
    expect(result.alreadyThere).toBe(true);
    expect(result.months).toBe(0);
  });

  it("handles a zero return with no special-casing", () => {
    // 10,000 a month with no growth reaches 120,000 in exactly 12 months.
    const result = timeToGoal({
      currentAmount: 0,
      monthlyInvestment: 10_000,
      targetAmount: 120_000,
      annualReturnPercent: 0,
    })!;
    expect(result.months).toBe(12);
    expect(result.totalInvested).toBe(120_000);
    expect(result.growth).toBe(0);
  });

  it("still works with no monthly contribution, growing the balance alone", () => {
    const result = timeToGoal({
      currentAmount: 1_000_000,
      monthlyInvestment: 0,
      targetAmount: 2_000_000,
      annualReturnPercent: 12,
    })!;
    // Roughly six years at 12%, by the rule of 72.
    expect(result.years).toBeGreaterThan(5);
    expect(result.years).toBeLessThan(7);
    expect(result.totalInvested).toBe(0);
  });

  it("returns null for a goal the plan cannot reach", () => {
    // No contributions and no growth never gets anywhere.
    expect(
      timeToGoal({
        currentAmount: 1_000,
        monthlyInvestment: 0,
        targetAmount: 10_000_000,
        annualReturnPercent: 0,
      })
    ).toBeNull();
  });

  it("refuses inputs that cannot describe a plan", () => {
    const base = {
      currentAmount: 0,
      monthlyInvestment: 10_000,
      targetAmount: 100_000,
      annualReturnPercent: 12,
    };
    expect(timeToGoal({ ...base, targetAmount: 0 })).toBeNull();
    expect(timeToGoal({ ...base, currentAmount: -1 })).toBeNull();
    expect(timeToGoal({ ...base, monthlyInvestment: -1 })).toBeNull();
    expect(timeToGoal({ ...base, annualReturnPercent: Number.NaN })).toBeNull();
    expect(timeToGoal(null as never)).toBeNull();
  });

  it("never returns a non-finite figure", () => {
    const result = timeToGoal({
      currentAmount: 1e12,
      monthlyInvestment: 1e9,
      targetAmount: 1e15,
      annualReturnPercent: 50,
    });
    if (result) {
      for (const value of [result.months, result.years, result.totalInvested, result.growth]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});

describe("coastFire", () => {
  it("says on track once compounding alone reaches the target", () => {
    // 10L at 12% for 20 years is comfortably past 50L.
    const result = coastFire({
      currentAmount: 1_000_000,
      targetAmount: 5_000_000,
      years: 20,
      annualReturnPercent: 12,
    })!;
    expect(result.onTrack).toBe(true);
    expect(result.shortfall).toBe(0);
    expect(result.coveragePercent).toBeGreaterThan(100);
  });

  it("reports the shortfall when it does not", () => {
    const result = coastFire({
      currentAmount: 100_000,
      targetAmount: 10_000_000,
      years: 10,
      annualReturnPercent: 12,
    })!;
    expect(result.onTrack).toBe(false);
    expect(result.shortfall).toBeGreaterThan(0);
    expect(result.coveragePercent).toBeLessThan(100);
    // Shortfall and projection must reconcile against the target exactly.
    expect(result.projectedAmount + result.shortfall).toBeCloseTo(10_000_000, 2);
  });

  it("compounds the starting amount correctly", () => {
    // 1,00,000 at 10% for 10 years = 100000 * 1.1^10 = 259,374.25
    const result = coastFire({
      currentAmount: 100_000,
      targetAmount: 1_000_000,
      years: 10,
      annualReturnPercent: 10,
    })!;
    expect(result.projectedAmount).toBeCloseTo(259_374.25, 1);
  });

  it("lets coverage exceed 100 rather than clamping away the headroom", () => {
    const result = coastFire({
      currentAmount: 5_000_000,
      targetAmount: 1_000_000,
      years: 5,
      annualReturnPercent: 12,
    })!;
    expect(result.coveragePercent).toBeGreaterThan(500);
  });

  it("handles a zero starting balance as zero coverage", () => {
    const result = coastFire({
      currentAmount: 0,
      targetAmount: 1_000_000,
      years: 10,
      annualReturnPercent: 12,
    })!;
    expect(result.projectedAmount).toBe(0);
    expect(result.coveragePercent).toBe(0);
    expect(result.onTrack).toBe(false);
    expect(result.shortfall).toBe(1_000_000);
  });

  it("refuses horizons it cannot model", () => {
    const base = {
      currentAmount: 100_000,
      targetAmount: 1_000_000,
      years: 10,
      annualReturnPercent: 12,
    };
    expect(coastFire({ ...base, years: 0 })).toBeNull();
    expect(coastFire({ ...base, years: 101 })).toBeNull();
    expect(coastFire({ ...base, targetAmount: 0 })).toBeNull();
    expect(coastFire({ ...base, annualReturnPercent: -100 })).toBeNull();
    expect(coastFire(null as never)).toBeNull();
  });
});
