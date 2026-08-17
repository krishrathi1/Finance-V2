import { describe, expect, it } from "vitest";

import { dcfValue, earningsYieldGap, impliedGrowth } from "@/shared/valuation-tools";

describe("earningsYieldGap", () => {
  const base = { price: 1_000, eps: 50, bondYieldPercent: 7 };

  it("reports what a rupee of price buys in earnings", () => {
    const result = earningsYieldGap(base)!;
    expect(result.earningsYieldPercent).toBe(5);
    expect(result.peRatio).toBe(20);
  });

  it("measures the gap against the bond", () => {
    // 5% earnings yield against a 7% G-sec: the bond wins on today's
    // earnings, and the equity has to grow to justify itself.
    const result = earningsYieldGap(base)!;
    expect(result.gapPercent).toBe(-2);
    expect(result.beatsBond).toBe(false);
  });

  it("reconciles the gap against the two printed yields", () => {
    const result = earningsYieldGap(base)!;
    expect(result.gapPercent).toBeCloseTo(
      result.earningsYieldPercent - result.bondYieldPercent,
      2
    );
  });

  it("shows the multiple at which the two would be level", () => {
    // A 7% bond is matched by a P/E of 100/7 = 14.29 on today's earnings.
    const result = earningsYieldGap(base)!;
    expect(result.peAtBondParity).toBeCloseTo(14.29, 2);
    expect(result.peAtBondParity).toBeLessThan(result.peRatio);
  });

  it("flags a cheap multiple as beating the bond", () => {
    const result = earningsYieldGap({ ...base, price: 500 })!;
    expect(result.earningsYieldPercent).toBe(10);
    expect(result.beatsBond).toBe(true);
    expect(result.gapPercent).toBe(3);
  });

  it("refuses a loss-making company, which has no earnings yield", () => {
    expect(earningsYieldGap({ ...base, eps: -5 })).toBeNull();
    expect(earningsYieldGap({ ...base, eps: 0 })).toBeNull();
  });

  it("refuses inputs that cannot describe a comparison", () => {
    expect(earningsYieldGap({ ...base, price: 0 })).toBeNull();
    expect(earningsYieldGap({ ...base, bondYieldPercent: 0 })).toBeNull();
    expect(earningsYieldGap({ ...base, price: Number.NaN })).toBeNull();
    expect(earningsYieldGap(null as never)).toBeNull();
  });
});

describe("dcfValue", () => {
  const base = {
    cashflow: 100,
    growthPercent: 15,
    discountPercent: 12,
    terminalGrowthPercent: 4,
    years: 10,
  };

  it("values a two-stage forecast", () => {
    // Hand-checked: 1,159.8 from the explicit decade (100 x q x (q^10-1)/(q-1)
    // at q = 1.15/1.12) plus 1,693.35 from the terminal value, which is
    // 100 x 1.15^10 x 1.04 / 0.08 discounted back ten years at 12%.
    const value = dcfValue(base)!;
    expect(value).toBeCloseTo(2_853.15, 1);
  });

  it("rises with growth and falls with the discount rate", () => {
    const higherGrowth = dcfValue({ ...base, growthPercent: 20 })!;
    const higherDiscount = dcfValue({ ...base, discountPercent: 15 })!;
    expect(higherGrowth).toBeGreaterThan(dcfValue(base)!);
    expect(higherDiscount).toBeLessThan(dcfValue(base)!);
  });

  it("refuses a terminal rate at or above the discount rate", () => {
    // The perpetuity diverges; a business growing forever as fast as money is
    // discounted is worth infinity, which says more about the model.
    expect(dcfValue({ ...base, terminalGrowthPercent: 12 })).toBeNull();
    expect(dcfValue({ ...base, terminalGrowthPercent: 15 })).toBeNull();
  });

  it("refuses inputs that cannot describe a forecast", () => {
    expect(dcfValue({ ...base, cashflow: 0 })).toBeNull();
    expect(dcfValue({ ...base, years: 0 })).toBeNull();
    expect(dcfValue({ ...base, years: 51 })).toBeNull();
    expect(dcfValue({ ...base, discountPercent: 0 })).toBeNull();
    expect(dcfValue(null as never)).toBeNull();
  });
});

describe("impliedGrowth", () => {
  const forecast = {
    cashflow: 100,
    discountPercent: 12,
    terminalGrowthPercent: 4,
    years: 10,
  };

  it("round-trips against the forward DCF", () => {
    // The strongest check available: value a known growth rate, feed the
    // result back as the price, and the solver must recover the rate. This
    // holds regardless of whether my arithmetic above was right.
    for (const growthPercent of [-20, 0, 5, 15, 30, 60]) {
      const price = dcfValue({ ...forecast, growthPercent })!;
      const result = impliedGrowth({ ...forecast, price })!;
      expect(result.impliedGrowthPercent).toBeCloseTo(growthPercent, 1);
    }
  });

  it("demands more growth at a higher price", () => {
    const cheap = impliedGrowth({ ...forecast, price: 2_000 })!;
    const dear = impliedGrowth({ ...forecast, price: 4_000 })!;
    expect(dear.impliedGrowthPercent).toBeGreaterThan(cheap.impliedGrowthPercent);
  });

  it("splits the price into forecast and perpetuity", () => {
    const result = impliedGrowth({ ...forecast, price: 2_853.15 })!;
    expect(result.explicitValue + result.terminalValue).toBeCloseTo(2_853.15, 0);
    expect(result.terminalSharePercent).toBeGreaterThan(0);
    expect(result.terminalSharePercent).toBeLessThan(100);
  });

  it("shows most of the value sitting in the terminal assumption", () => {
    // The honest health warning on any DCF: with a ten-year forecast and a
    // perpetuity behind it, the majority of the number rests on the year-2050
    // assumption rather than on anything anyone can forecast.
    const result = impliedGrowth({ ...forecast, price: 2_853.15 })!;
    expect(result.terminalSharePercent).toBeGreaterThan(50);
  });

  it("refuses a price the model cannot reach", () => {
    // Beyond 300% growth, or below what near-total decline would be worth,
    // the answer is that the model does not describe this situation.
    expect(impliedGrowth({ ...forecast, price: 1e12 })).toBeNull();
    expect(impliedGrowth({ ...forecast, price: 0.0001 })).toBeNull();
  });

  it("refuses inputs that cannot describe a valuation", () => {
    expect(impliedGrowth({ ...forecast, price: 0 })).toBeNull();
    expect(impliedGrowth({ ...forecast, price: 2_000, cashflow: 0 })).toBeNull();
    expect(impliedGrowth({ ...forecast, terminalGrowthPercent: 12, price: 2_000 })).toBeNull();
    expect(impliedGrowth({ ...forecast, price: Number.NaN })).toBeNull();
    expect(impliedGrowth(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across a swept grid", () => {
    const found: string[] = [];
    for (const discountPercent of [8, 12, 20]) {
      for (const terminalGrowthPercent of [0, 4, 7]) {
        for (const price of [500, 2_000, 10_000]) {
          const result = impliedGrowth({
            cashflow: 100,
            discountPercent,
            terminalGrowthPercent,
            years: 10,
            price,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${discountPercent}/${terminalGrowthPercent}/${price}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
