import { describe, expect, it } from "vitest";

import { fdVsEquity } from "@/shared/fd-vs-equity";

const base = {
  amount: 1_000_000,
  years: 5,
  fdRatePercent: 7,
  equityReturnPercent: 12,
  slabPercent: 30,
};

describe("fdVsEquity — the fixed deposit", () => {
  it("compounds at the post-tax rate, not the headline rate", () => {
    // 7% at a 30% slab compounds at 4.9%, not 7%. Taxing once at maturity
    // instead — what most online calculators do — would let untaxed interest
    // compound on itself for five years and overstate the deposit.
    const result = fdVsEquity(base)!;
    const expected = 1_000_000 * Math.pow(1.049, 5);
    expect(result.fd.postTaxValue).toBeCloseTo(expected, 0);
    expect(result.fd.effectiveAnnualPercent).toBeCloseTo(4.9, 1);
  });

  it("pays no tax at a zero slab, and then matches the headline rate", () => {
    const result = fdVsEquity({ ...base, slabPercent: 0 })!;
    expect(result.fd.taxPaid).toBe(0);
    expect(result.fd.effectiveAnnualPercent).toBeCloseTo(7, 6);
    expect(result.fd.postTaxValue).toBeCloseTo(result.fd.maturityValue, 2);
  });

  it("reports the tax as the gap between gross and post-tax", () => {
    const result = fdVsEquity(base)!;
    expect(result.fd.maturityValue - result.fd.postTaxValue).toBeCloseTo(result.fd.taxPaid, 2);
  });
});

describe("fdVsEquity — the equity leg", () => {
  it("applies the long-term rate and exemption beyond a year", () => {
    const result = fdVsEquity(base)!;
    expect(result.longTerm).toBe(true);
    expect(result.appliedEquityRatePercent).toBe(12.5);
    expect(result.appliedExemption).toBe(125_000);

    // Gain = 10L * 1.12^5 - 10L = 762,342. Taxable after the 1.25L exemption
    // is 637,342, at 12.5% plus 4% cess.
    const gain = 1_000_000 * Math.pow(1.12, 5) - 1_000_000;
    const expectedTax = Math.max(0, gain - 125_000) * 0.125 * 1.04;
    expect(result.equity.taxPaid).toBeCloseTo(expectedTax, 0);
  });

  it("uses the short-term rate with no exemption under a year", () => {
    const result = fdVsEquity({ ...base, years: 0.5 })!;
    expect(result.longTerm).toBe(false);
    expect(result.appliedEquityRatePercent).toBe(20);
    expect(result.appliedExemption).toBe(0);
  });

  it("shelters a gain that fits inside the exemption", () => {
    // A small gain over a long-term horizon owes nothing.
    const result = fdVsEquity({
      amount: 500_000,
      years: 2,
      fdRatePercent: 7,
      equityReturnPercent: 5,
      slabPercent: 30,
    })!;
    expect(result.equity.grossGain).toBeLessThan(125_000);
    expect(result.equity.taxPaid).toBe(0);
  });

  it("does not tax a loss", () => {
    const result = fdVsEquity({ ...base, equityReturnPercent: -8 })!;
    expect(result.equity.grossGain).toBeLessThan(0);
    expect(result.equity.taxPaid).toBe(0);
    expect(result.equityWins).toBe(false);
  });
});

describe("fdVsEquity — the verdict", () => {
  it("favours equity on the usual assumptions", () => {
    const result = fdVsEquity(base)!;
    expect(result.equityWins).toBe(true);
    expect(result.difference).toBeGreaterThan(0);
    expect(result.difference).toBeCloseTo(
      result.equity.postTaxValue - result.fd.postTaxValue,
      2
    );
  });

  it("favours the deposit when equity underperforms it after tax", () => {
    const result = fdVsEquity({ ...base, equityReturnPercent: 4 })!;
    expect(result.equityWins).toBe(false);
    expect(result.difference).toBeLessThan(0);
  });

  it("shows the slab mattering — a low slab narrows the gap", () => {
    const highSlab = fdVsEquity({ ...base, slabPercent: 30 })!;
    const noSlab = fdVsEquity({ ...base, slabPercent: 0 })!;
    expect(noSlab.difference).toBeLessThan(highSlab.difference);
  });
});

describe("fdVsEquity — input handling", () => {
  it("refuses inputs that cannot describe a comparison", () => {
    expect(fdVsEquity({ ...base, amount: 0 })).toBeNull();
    expect(fdVsEquity({ ...base, years: 0 })).toBeNull();
    expect(fdVsEquity({ ...base, years: 101 })).toBeNull();
    expect(fdVsEquity({ ...base, fdRatePercent: -1 })).toBeNull();
    expect(fdVsEquity({ ...base, slabPercent: 100 })).toBeNull();
    expect(fdVsEquity({ ...base, equityReturnPercent: Number.NaN })).toBeNull();
    expect(fdVsEquity(null as never)).toBeNull();
  });

  it("never emits a non-finite figure", () => {
    for (const years of [1e-6, 1, 100]) {
      for (const equityReturnPercent of [-99, 0, 500]) {
        const result = fdVsEquity({ ...base, years, equityReturnPercent });
        if (!result) continue;
        for (const value of [
          result.fd.postTaxValue,
          result.fd.effectiveAnnualPercent,
          result.equity.postTaxValue,
          result.equity.effectiveAnnualPercent,
          result.difference,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });
});
