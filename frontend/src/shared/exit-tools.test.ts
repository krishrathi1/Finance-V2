import { describe, expect, it } from "vitest";

import { partialExit, trailingStop } from "@/shared/exit-tools";

describe("partialExit", () => {
  const base = { quantity: 100, buyPrice: 1_000, sellQuantity: 50, sellPrice: 1_500 };

  it("lowers the cost of what is still held by the proceeds", () => {
    const result = partialExit(base)!;
    expect(result.remainingQuantity).toBe(50);
    expect(result.proceeds).toBe(75_000);
    expect(result.realisedGain).toBe(25_000);
    expect(result.originalCost).toBe(100_000);
    expect(result.netCostOfRemainder).toBe(25_000);
    expect(result.effectiveCostPerShare).toBe(500);
    expect(result.isFreePosition).toBe(false);
  });

  it("reconciles every printed figure against the others", () => {
    // Someone subtracting the numbers on screen must land on the number
    // printed beside them.
    const result = partialExit(base)!;
    expect(result.netCostOfRemainder).toBe(result.originalCost - result.proceeds);
    expect(result.effectiveCostPerShare * result.remainingQuantity).toBeCloseTo(
      result.netCostOfRemainder,
      2
    );
  });

  it("rounds the shares-to-sell UP, because the floor leaves cost unrecovered", () => {
    // 100000 / 1500 = 66.67. Selling 66 returns 99,000 and leaves 1,000
    // outstanding; 67 returns 100,500 and clears it.
    const result = partialExit(base)!;
    expect(result.sharesToSellForFree).toBe(67);
    expect(67 * base.sellPrice).toBeGreaterThanOrEqual(result.originalCost);
    expect(66 * base.sellPrice).toBeLessThan(result.originalCost);
  });

  it("goes negative once the sale returns more than the position cost", () => {
    const result = partialExit({ ...base, sellQuantity: 70 })!;
    expect(result.proceeds).toBe(105_000);
    expect(result.netCostOfRemainder).toBe(-5_000);
    expect(result.effectiveCostPerShare).toBeCloseTo(-166.67, 2);
    expect(result.isFreePosition).toBe(true);
  });

  it("reports no achievable free position when the price is too low", () => {
    // At a loss no quantity can recover the outlay, and saying so beats
    // printing a number larger than the holding.
    const result = partialExit({ ...base, sellPrice: 900 })!;
    expect(result.sharesToSellForFree).toBeNull();
    expect(result.realisedGain).toBeLessThan(0);
  });

  it("treats selling the whole position as out of scope", () => {
    // With no remainder there is no cost-of-remainder to report.
    expect(partialExit({ ...base, sellQuantity: 100 })).toBeNull();
    expect(partialExit({ ...base, sellQuantity: 150 })).toBeNull();
  });

  it("refuses inputs that cannot describe a sale", () => {
    expect(partialExit({ ...base, quantity: 0 })).toBeNull();
    expect(partialExit({ ...base, buyPrice: -1 })).toBeNull();
    expect(partialExit({ ...base, sellQuantity: 0 })).toBeNull();
    expect(partialExit({ ...base, sellPrice: Number.NaN })).toBeNull();
    expect(partialExit(null as never)).toBeNull();
  });
});

describe("trailingStop", () => {
  const base = { entryPrice: 1_000, trailPercent: 10, highestPrice: 1_400, currentPrice: 1_300 };

  it("places the stop below the peak, not below the current price", () => {
    const result = trailingStop(base)!;
    expect(result.stopPrice).toBe(1_260);
    expect(result.peakUsed).toBe(1_400);
    expect(result.distanceToStop).toBe(40);
    expect(result.giveBackFromPeak).toBe(140);
  });

  it("reports the profit the stop actually secures", () => {
    const result = trailingStop(base)!;
    expect(result.lockedInGain).toBe(260);
    expect(result.isProfitLocked).toBe(true);
  });

  it("needs a rise wider than the trail to reach breakeven", () => {
    // The output that surprises people: a 10% trail clears entry at
    // 1000/0.9 = 1111.11, an 11.1% rise, not a 10% one.
    const result = trailingStop(base)!;
    expect(result.breakEvenPeak).toBeCloseTo(1_111.11, 2);
    expect(result.breakEvenPeak).toBeGreaterThan(base.entryPrice * 1.1);
  });

  it("widens that gap as the trail widens", () => {
    // A 25% trail needs a 33.3% rise before the stop covers entry.
    const wide = trailingStop({ ...base, trailPercent: 25 })!;
    expect(wide.breakEvenPeak).toBeCloseTo(1_333.33, 2);
  });

  it("shows a stop still below entry as protecting nothing", () => {
    const result = trailingStop({ ...base, highestPrice: 1_050, currentPrice: 1_020 })!;
    expect(result.stopPrice).toBe(945);
    expect(result.isProfitLocked).toBe(false);
    expect(result.lockedInGain).toBe(-55);
  });

  it("clamps the peak to the entry price", () => {
    // A position that only ever fell has its high AT entry; taking a lower
    // figure would put the stop below where any real trailing order sits.
    const result = trailingStop({ ...base, highestPrice: 800, currentPrice: 800 })!;
    expect(result.peakUsed).toBe(1_000);
    expect(result.stopPrice).toBe(900);
    expect(result.alreadyTriggered).toBe(true);
  });

  it("flags a price already at or below the stop", () => {
    expect(trailingStop({ ...base, currentPrice: 1_200 })!.alreadyTriggered).toBe(true);
    expect(trailingStop({ ...base, currentPrice: 1_260 })!.alreadyTriggered).toBe(true);
    expect(trailingStop({ ...base, currentPrice: 1_261 })!.alreadyTriggered).toBe(false);
  });

  it("refuses inputs that cannot describe a trailing stop", () => {
    expect(trailingStop({ ...base, entryPrice: 0 })).toBeNull();
    expect(trailingStop({ ...base, trailPercent: 0 })).toBeNull();
    expect(trailingStop({ ...base, trailPercent: 100 })).toBeNull();
    expect(trailingStop({ ...base, currentPrice: Number.NaN })).toBeNull();
    expect(trailingStop(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across extreme inputs", () => {
    const found: string[] = [];
    for (const trailPercent of [0.01, 10, 99.9]) {
      for (const highestPrice of [0.05, 1_000, 1e7]) {
        for (const currentPrice of [0.05, 1_000, 1e7]) {
          const result = trailingStop({
            entryPrice: 1_000,
            trailPercent,
            highestPrice,
            currentPrice,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${trailPercent}/${highestPrice}/${currentPrice}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
