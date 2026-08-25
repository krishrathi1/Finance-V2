import { describe, expect, it } from "vitest";

import { pyramidPosition } from "@/shared/pyramid-tools";

describe("pyramidPosition", () => {
  const base = {
    quantity: 100,
    buyPrice: 1_000,
    addQuantity: 50,
    addPrice: 1_200,
    stopPrice: 1_100,
    riskLimit: 20_000,
  };

  it("blends the two entries", () => {
    const result = pyramidPosition(base)!;
    expect(result.newQuantity).toBe(150);
    expect(result.totalCost).toBe(160_000);
    expect(result.blendedAverage).toBeCloseTo(1_066.6667, 4);
  });

  it("leaves the rupee profit untouched", () => {
    // Nothing was sold, so nothing was gained or lost by adding at market.
    const result = pyramidPosition(base)!;
    expect(result.openProfitBefore).toBe(20_000);
    expect(result.openProfitAfter).toBeCloseTo(20_000, 2);
  });

  it("spends the cushion, which only the percentage shows", () => {
    // The trap the card exists for: 20% in front becomes 12.5% in front on
    // the same stock at the same price, because the same profit is now
    // measured against a bigger cost.
    const result = pyramidPosition(base)!;
    expect(result.openProfitPercentBefore).toBe(20);
    expect(result.openProfitPercentAfter).toBeCloseTo(12.5, 2);
    expect(result.openProfitPercentAfter).toBeLessThan(result.openProfitPercentBefore);
  });

  it("treats a stop above the blended average as locked profit", () => {
    // Existing shares: 100 x (1000-1100) = -10,000. New: 50 x (1200-1100) =
    // +5,000. Net -5,000, so being stopped out MAKES 5,000.
    const result = pyramidPosition(base)!;
    expect(result.riskAtStop).toBe(-5_000);
    expect(result.isProfitLocked).toBe(true);
  });

  it("agrees with the blended-average route it never takes", () => {
    // Q0(P0-S) + Qa(Pa-S) collapses to newQty x (blended - S), so the linear
    // form must land on the same figure as the long way round. Checked at
    // several stops, including ones either side of the blended average.
    for (const stopPrice of [700, 950, 1_066, 1_100, 1_190]) {
      const result = pyramidPosition({ ...base, stopPrice })!;
      const viaBlended = result.newQuantity * (result.blendedAverage - stopPrice);
      expect(result.riskAtStop).toBeCloseTo(viaBlended, 0);
    }
  });

  it("solves the largest addition that fits a risk limit", () => {
    // Headroom is 20,000 minus the existing -10,000 exposure = 30,000, and
    // each new share risks 100. So 300 shares, exactly.
    const result = pyramidPosition(base)!;
    expect(result.maxSharesToAdd).toBe(300);
  });

  it("holds that maximum inside the limit, and one more breaches it", () => {
    // A cap that is not tight at the boundary is not doing its job.
    const result = pyramidPosition(base)!;
    const atCap = pyramidPosition({ ...base, addQuantity: result.maxSharesToAdd! })!;
    const overCap = pyramidPosition({ ...base, addQuantity: result.maxSharesToAdd! + 1 })!;
    expect(atCap.riskAtStop).toBeLessThanOrEqual(base.riskLimit);
    expect(overCap.riskAtStop).toBeGreaterThan(base.riskLimit);
  });

  it("allows nothing when the existing position already breaches the limit", () => {
    // Stop well below cost, so the old shares alone risk more than the limit.
    const result = pyramidPosition({
      ...base,
      stopPrice: 700,
      riskLimit: 10_000,
    })!;
    expect(result.maxSharesToAdd).toBe(0);
    expect(result.riskAtStop).toBeGreaterThan(10_000);
    expect(result.isProfitLocked).toBe(false);
  });

  it("omits the maximum when no limit was given", () => {
    const result = pyramidPosition({ ...base, riskLimit: undefined })!;
    expect(result.maxSharesToAdd).toBeNull();
  });

  it("reports real risk when the stop sits below cost", () => {
    const result = pyramidPosition({ ...base, stopPrice: 950 })!;
    // 100 x 50 + 50 x 250 = 5,000 + 12,500 = 17,500 at risk.
    expect(result.riskAtStop).toBe(17_500);
    expect(result.isProfitLocked).toBe(false);
  });

  it("refuses a stop at or above the price being added at", () => {
    // The position would be stopped out on arrival.
    expect(pyramidPosition({ ...base, stopPrice: 1_200 })).toBeNull();
    expect(pyramidPosition({ ...base, stopPrice: 1_300 })).toBeNull();
  });

  it("refuses inputs that cannot describe an addition", () => {
    expect(pyramidPosition({ ...base, quantity: 0 })).toBeNull();
    expect(pyramidPosition({ ...base, addQuantity: 0 })).toBeNull();
    expect(pyramidPosition({ ...base, buyPrice: -1 })).toBeNull();
    expect(pyramidPosition({ ...base, addPrice: Number.NaN })).toBeNull();
    expect(pyramidPosition(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across a swept grid", () => {
    const found: string[] = [];
    for (const buyPrice of [0.05, 1_000, 1e6]) {
      for (const addPrice of [1_200, 1e6]) {
        for (const stopPrice of [0.01, 900, 1_199]) {
          const result = pyramidPosition({
            quantity: 100,
            buyPrice,
            addQuantity: 50,
            addPrice,
            stopPrice,
            riskLimit: 20_000,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${buyPrice}/${addPrice}/${stopPrice}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
