import { describe, expect, it } from "vitest";

import { goldVsEquity, propertyReturn } from "@/shared/asset-class-tools";

describe("goldVsEquity", () => {
  const base = {
    amount: 1_000_000,
    years: 5,
    goldReturnPercent: 10,
    equityReturnPercent: 12,
  };

  it("gives gold no exemption while equity gets 1.25L", () => {
    // The asymmetry that decides most of these: equity shelters the first
    // 1.25L of long-term gain, gold is taxed from the first rupee.
    const result = goldVsEquity(base)!;
    const goldGain = 1_000_000 * Math.pow(1.1, 5) - 1_000_000;
    expect(result.gold.taxPaid).toBeCloseTo(goldGain * 0.125 * 1.04, 0);

    const equityGain = 1_000_000 * Math.pow(1.12, 5) - 1_000_000;
    expect(result.equity.taxPaid).toBeCloseTo((equityGain - 125_000) * 0.125 * 1.04, 0);
  });

  it("can favour equity on tax alone at equal returns", () => {
    // Same return on both: the only difference is the exemption, so equity
    // must come out ahead.
    const result = goldVsEquity({ ...base, goldReturnPercent: 12 })!;
    expect(result.equityWins).toBe(true);
    expect(result.equity.taxPaid).toBeLessThan(result.gold.taxPaid);
  });

  it("uses short-term rates inside the holding thresholds", () => {
    const result = goldVsEquity({ ...base, years: 1 })!;
    expect(result.goldLongTerm).toBe(false);
    expect(result.equityLongTerm).toBe(false);
  });

  it("treats gold as long-term from two years", () => {
    expect(goldVsEquity({ ...base, years: 2 })!.goldLongTerm).toBe(true);
    expect(goldVsEquity({ ...base, years: 1.5 })!.goldLongTerm).toBe(false);
  });

  it("does not tax a loss on either side", () => {
    const result = goldVsEquity({
      ...base,
      goldReturnPercent: -5,
      equityReturnPercent: -5,
    })!;
    expect(result.gold.taxPaid).toBe(0);
    expect(result.equity.taxPaid).toBe(0);
  });

  it("reconciles the difference against the two post-tax figures", () => {
    const result = goldVsEquity(base)!;
    expect(result.difference).toBeCloseTo(
      result.equity.postTaxValue - result.gold.postTaxValue,
      2
    );
  });

  it("refuses inputs that cannot describe a comparison", () => {
    expect(goldVsEquity({ ...base, amount: 0 })).toBeNull();
    expect(goldVsEquity({ ...base, years: 0 })).toBeNull();
    expect(goldVsEquity({ ...base, years: 101 })).toBeNull();
    expect(goldVsEquity({ ...base, goldReturnPercent: Number.NaN })).toBeNull();
    expect(goldVsEquity(null as never)).toBeNull();
  });
});

describe("propertyReturn", () => {
  const base = {
    propertyPrice: 10_000_000,
    years: 10,
    appreciationPercent: 8,
    rentalYieldPercent: 3,
    stampDutyPercent: 6,
    maintenancePercent: 0.5,
    slabPercent: 30,
  };

  it("counts stamp duty as part of what was invested", () => {
    const result = propertyReturn(base)!;
    expect(result.totalInvested).toBe(10_600_000);
  });

  it("reports an effective rate below the headline appreciation", () => {
    // The whole point: stamp duty is a one-off drag and maintenance eats much
    // of a typical Indian rental yield, neither of which appears in
    // "property doubled in ten years".
    const result = propertyReturn(base)!;
    expect(result.headlineAnnualPercent).toBe(8);
    expect(result.effectiveAnnualPercent).toBeLessThan(8);
  });

  it("nets maintenance and slab tax off the rent", () => {
    const result = propertyReturn(base)!;
    // Gross rent 3% x 10y = 30L; after 30% slab = 21L; less 0.5% x 10y = 5L
    // maintenance, leaving 16L.
    expect(result.netRentalIncome).toBeCloseTo(1_600_000, 0);
  });

  it("can turn rental income negative when maintenance exceeds net rent", () => {
    // A 1% yield against 2% maintenance is a real and common situation for
    // an under-let flat, and it should show as a drag rather than as zero.
    const result = propertyReturn({
      ...base,
      rentalYieldPercent: 1,
      maintenancePercent: 2,
    })!;
    expect(result.netRentalIncome).toBeLessThan(0);
  });

  it("measures the capital gain against price plus stamp duty", () => {
    const result = propertyReturn({ ...base, rentalYieldPercent: 0, maintenancePercent: 0 })!;
    const sale = 10_000_000 * Math.pow(1.08, 10);
    const expectedTax = (sale - 10_600_000) * 0.125 * 1.04;
    expect(result.capitalGainsTax).toBeCloseTo(expectedTax, 0);
  });

  it("applies the short-term rate under two years", () => {
    const shortHold = propertyReturn({ ...base, years: 1 })!;
    const longHold = propertyReturn({ ...base, years: 3 })!;
    // Same appreciation, but a higher rate on the short hold means a lower
    // effective return per year.
    expect(shortHold.effectiveAnnualPercent).toBeLessThan(longHold.effectiveAnnualPercent);
  });

  it("does not tax a property sold at a loss", () => {
    const result = propertyReturn({ ...base, appreciationPercent: -3 })!;
    expect(result.capitalGainsTax).toBe(0);
  });

  it("falls back to sane defaults for omitted costs", () => {
    const result = propertyReturn({
      propertyPrice: 10_000_000,
      years: 10,
      appreciationPercent: 8,
    })!;
    // Default 6% stamp duty still applies even with no rent modelled.
    expect(result.totalInvested).toBe(10_600_000);
    expect(Number.isFinite(result.effectiveAnnualPercent)).toBe(true);
  });

  it("refuses inputs that cannot describe a purchase", () => {
    expect(propertyReturn({ ...base, propertyPrice: 0 })).toBeNull();
    expect(propertyReturn({ ...base, years: 0 })).toBeNull();
    expect(propertyReturn({ ...base, years: 101 })).toBeNull();
    expect(propertyReturn({ ...base, appreciationPercent: Number.NaN })).toBeNull();
    expect(propertyReturn(null as never)).toBeNull();
  });

  it("never emits a non-finite figure", () => {
    for (const appreciationPercent of [-99, 0, 100]) {
      for (const years of [1, 10, 100]) {
        const result = propertyReturn({ ...base, appreciationPercent, years });
        if (!result) continue;
        for (const value of [
          result.totalInvested,
          result.saleValue,
          result.netRentalIncome,
          result.capitalGainsTax,
          result.netProfit,
          result.effectiveAnnualPercent,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });
});
