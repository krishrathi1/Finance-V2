import { describe, expect, it } from "vitest";

import { verticalSpread, type SpreadType } from "@/shared/spread-tools";

// One NIFTY chain, read the way a trader reads it: a price beside each strike.
const CALLS = { lowerStrike: 24_000, upperStrike: 24_200, lowerPremium: 150, upperPremium: 70 };
const PUTS = { lowerStrike: 24_000, upperStrike: 24_200, lowerPremium: 60, upperPremium: 160 };
const LOT = { lotSize: 50 };

describe("verticalSpread — debit structures", () => {
  it("costs a bull call the difference in premiums", () => {
    const result = verticalSpread({ type: "bull-call", ...CALLS, ...LOT })!;
    expect(result.netPremium).toBe(80);
    expect(result.isDebit).toBe(true);
    expect(result.breakEven).toBe(24_080);
    expect(result.maxProfit).toBe(6_000);
    expect(result.maxLoss).toBe(4_000);
    expect(result.riskRewardRatio).toBe(1.5);
  });

  it("mirrors that for a bear put", () => {
    const result = verticalSpread({ type: "bear-put", ...PUTS, ...LOT })!;
    expect(result.netPremium).toBe(100);
    expect(result.isDebit).toBe(true);
    expect(result.breakEven).toBe(24_100);
    expect(result.maxProfit).toBe(5_000);
    expect(result.maxLoss).toBe(5_000);
  });

  it("risks only the premium paid", () => {
    const result = verticalSpread({ type: "bull-call", ...CALLS, ...LOT })!;
    expect(result.capitalAtRisk).toBe(result.maxLoss);
    expect(result.maxLoss).toBe(result.netPremium * LOT.lotSize);
  });
});

describe("verticalSpread — credit structures", () => {
  it("reports a bear call's risk as the larger number, not the credit", () => {
    // The trap: 80 arrives up front and 120 is at risk. A card that leads
    // with the credit is describing the good half of the trade.
    const result = verticalSpread({ type: "bear-call", ...CALLS, ...LOT })!;
    expect(result.netPremium).toBe(-80);
    expect(result.isDebit).toBe(false);
    expect(result.maxProfit).toBe(4_000);
    expect(result.maxLoss).toBe(6_000);
    expect(result.riskRewardRatio).toBeCloseTo(0.67, 2);
  });

  it("puts a bull put's breakeven below the strike it sold", () => {
    const result = verticalSpread({ type: "bull-put", ...PUTS, ...LOT })!;
    expect(result.netPremium).toBe(-100);
    expect(result.isDebit).toBe(false);
    expect(result.breakEven).toBe(24_100);
    expect(result.maxProfit).toBe(5_000);
    expect(result.maxLoss).toBe(5_000);
  });

  it("blocks margin against the worst case, not the credit received", () => {
    const result = verticalSpread({ type: "bear-call", ...CALLS, ...LOT })!;
    expect(result.capitalAtRisk).toBe(6_000);
    expect(result.capitalAtRisk).toBeGreaterThan(result.maxProfit);
  });
});

describe("verticalSpread — structural invariants", () => {
  const ALL: ReadonlyArray<[SpreadType, typeof CALLS]> = [
    ["bull-call", CALLS],
    ["bear-call", CALLS],
    ["bear-put", PUTS],
    ["bull-put", PUTS],
  ];

  it("splits one fixed pie between profit and loss", () => {
    // For any vertical, max profit + max loss = strike width x quantity. The
    // two figures are two slices of the same fixed amount, which is why a
    // bigger credit always means a smaller cushion.
    for (const [type, chain] of ALL) {
      const result = verticalSpread({ type, ...chain, ...LOT })!;
      expect(result.maxProfit + result.maxLoss).toBe(result.strikeWidth * LOT.lotSize);
    }
  });

  it("makes each structure the exact reverse of its opposite", () => {
    // A bear call is a bull call sold. Same breakeven, profit and loss swapped.
    const bullCall = verticalSpread({ type: "bull-call", ...CALLS, ...LOT })!;
    const bearCall = verticalSpread({ type: "bear-call", ...CALLS, ...LOT })!;
    expect(bearCall.breakEven).toBe(bullCall.breakEven);
    expect(bearCall.maxProfit).toBe(bullCall.maxLoss);
    expect(bearCall.maxLoss).toBe(bullCall.maxProfit);
    expect(bearCall.netPremium).toBe(-bullCall.netPremium);

    const bearPut = verticalSpread({ type: "bear-put", ...PUTS, ...LOT })!;
    const bullPut = verticalSpread({ type: "bull-put", ...PUTS, ...LOT })!;
    expect(bullPut.breakEven).toBe(bearPut.breakEven);
    expect(bullPut.maxProfit).toBe(bearPut.maxLoss);
    expect(bullPut.netPremium).toBe(-bearPut.netPremium);
  });

  it("keeps every breakeven inside the two strikes", () => {
    for (const [type, chain] of ALL) {
      const result = verticalSpread({ type, ...chain, ...LOT })!;
      expect(result.breakEven).toBeGreaterThan(chain.lowerStrike);
      expect(result.breakEven).toBeLessThan(chain.upperStrike);
    }
  });

  it("scales linearly with lots", () => {
    const one = verticalSpread({ type: "bull-call", ...CALLS, ...LOT })!;
    const three = verticalSpread({ type: "bull-call", ...CALLS, ...LOT, lots: 3 })!;
    expect(three.maxProfit).toBe(one.maxProfit * 3);
    expect(three.maxLoss).toBe(one.maxLoss * 3);
    // Per-share and per-underlying figures must NOT scale.
    expect(three.breakEven).toBe(one.breakEven);
    expect(three.netPremium).toBe(one.netPremium);
    expect(three.riskRewardRatio).toBe(one.riskRewardRatio);
  });
});

describe("verticalSpread — refusals", () => {
  it("refuses a net premium outside the strike width", () => {
    // No-arbitrage bounds a vertical's premium strictly inside its width.
    // A debit of 300 on a 200-wide spread means the premiums were entered
    // against the wrong strikes.
    expect(
      verticalSpread({ type: "bull-call", ...CALLS, lowerPremium: 400, upperPremium: 100, ...LOT })
    ).toBeNull();
    // Equal premiums leave nothing to win and the whole width to lose.
    expect(
      verticalSpread({ type: "bull-call", ...CALLS, lowerPremium: 90, upperPremium: 90, ...LOT })
    ).toBeNull();
  });

  it("refuses strikes that are not ordered", () => {
    expect(
      verticalSpread({ type: "bull-call", ...CALLS, lowerStrike: 24_200, upperStrike: 24_000, ...LOT })
    ).toBeNull();
    expect(
      verticalSpread({ type: "bull-call", ...CALLS, upperStrike: 24_000, ...LOT })
    ).toBeNull();
  });

  it("refuses inputs that cannot describe a spread", () => {
    expect(verticalSpread({ type: "straddle" as SpreadType, ...CALLS, ...LOT })).toBeNull();
    expect(verticalSpread({ type: "bull-call", ...CALLS, lotSize: 0 })).toBeNull();
    expect(verticalSpread({ type: "bull-call", ...CALLS, ...LOT, lots: 0 })).toBeNull();
    expect(verticalSpread({ type: "bull-call", ...CALLS, lowerPremium: Number.NaN, ...LOT })).toBeNull();
    expect(verticalSpread(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across a swept chain", () => {
    const found: string[] = [];
    for (const type of ["bull-call", "bear-call", "bear-put", "bull-put"] as SpreadType[]) {
      for (const lowerPremium of [0.05, 40, 199]) {
        for (const upperPremium of [0.05, 40, 199]) {
          const result = verticalSpread({
            type,
            lowerStrike: 24_000,
            upperStrike: 24_200,
            lowerPremium,
            upperPremium,
            lotSize: 50,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${type}/${lowerPremium}/${upperPremium}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
