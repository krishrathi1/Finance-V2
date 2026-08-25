import { describe, expect, it } from "vitest";

import { volatilityStructure } from "@/shared/volatility-tools";

const STRADDLE = {
  spot: 24_000,
  callStrike: 24_000,
  putStrike: 24_000,
  callPremium: 250,
  putPremium: 230,
  lotSize: 50,
};

const STRANGLE = {
  spot: 24_000,
  callStrike: 24_200,
  putStrike: 23_800,
  callPremium: 90,
  putPremium: 80,
  lotSize: 50,
};

describe("volatilityStructure — long", () => {
  it("prices a straddle and its two breakevens", () => {
    const result = volatilityStructure({ direction: "long", ...STRADDLE })!;
    expect(result.isStraddle).toBe(true);
    expect(result.netPremium).toBe(480);
    expect(result.totalPremium).toBe(24_000);
    expect(result.upperBreakEven).toBe(24_480);
    expect(result.lowerBreakEven).toBe(23_520);
  });

  it("states the move required, not just the premium", () => {
    // 480 on a 24,000 index is not "480 of risk" — it is a demand that the
    // index travel 2% before the position is worth anything.
    const result = volatilityStructure({ direction: "long", ...STRADDLE })!;
    expect(result.breakEvenMovePercent).toBe(2);
  });

  it("caps the loss at the premium and leaves the upside open", () => {
    const result = volatilityStructure({ direction: "long", ...STRADDLE })!;
    expect(result.maxLoss).toBe(24_000);
    expect(result.maxProfit).toBeNull();
  });

  it("bounds the downside profit, because price stops at zero", () => {
    // The asymmetry: unlimited up, but a fall can only ever reach zero.
    const result = volatilityStructure({ direction: "long", ...STRADDLE })!;
    expect(result.profitIfUnderlyingHitsZero).toBe((24_000 - 480) * 50);
  });

  it("makes a strangle cheaper but wrong across a whole range", () => {
    // The real trade-off, and the one a premium comparison alone hides: the
    // straddle suffers its worst case at a single point, the strangle across
    // the entire gap between its strikes.
    const straddle = volatilityStructure({ direction: "long", ...STRADDLE })!;
    const strangle = volatilityStructure({ direction: "long", ...STRANGLE })!;

    expect(strangle.isStraddle).toBe(false);
    expect(strangle.maxLoss!).toBeLessThan(straddle.maxLoss!);
    expect(straddle.maxLossZoneWidth).toBe(0);
    expect(strangle.maxLossZoneWidth).toBe(400);
  });

  it("places a strangle's breakevens off its own strikes", () => {
    const result = volatilityStructure({ direction: "long", ...STRANGLE })!;
    expect(result.netPremium).toBe(170);
    expect(result.upperBreakEven).toBe(24_370);
    expect(result.lowerBreakEven).toBe(23_630);
    expect(result.breakEvenMovePercent).toBeCloseTo(1.54, 2);
  });
});

describe("volatilityStructure — short", () => {
  it("mirrors the long structure exactly", () => {
    const long = volatilityStructure({ direction: "long", ...STRADDLE })!;
    const short = volatilityStructure({ direction: "short", ...STRADDLE })!;

    expect(short.maxProfit).toBe(long.maxLoss);
    expect(short.maxLoss).toBeNull();
    expect(short.upperBreakEven).toBe(long.upperBreakEven);
    expect(short.lowerBreakEven).toBe(long.lowerBreakEven);
    expect(short.profitIfUnderlyingHitsZero).toBe(-long.profitIfUnderlyingHitsZero);
  });

  it("leaves the loss unbounded rather than reporting a large number", () => {
    // Substituting a finite figure would make an unlimited risk look
    // surveyable, which is precisely the error a short straddle punishes.
    const result = volatilityStructure({ direction: "short", ...STRADDLE })!;
    expect(result.maxLoss).toBeNull();
    expect(result.maxProfit).toBe(24_000);
  });

  it("reads the same move figure as a cushion", () => {
    const result = volatilityStructure({ direction: "short", ...STRADDLE })!;
    expect(result.breakEvenMovePercent).toBe(2);
  });
});

describe("volatilityStructure — refusals and sweeps", () => {
  it("scales with lots without moving per-underlying figures", () => {
    const one = volatilityStructure({ direction: "long", ...STRADDLE })!;
    const four = volatilityStructure({ direction: "long", ...STRADDLE, lots: 4 })!;
    expect(four.maxLoss).toBe(one.maxLoss! * 4);
    expect(four.upperBreakEven).toBe(one.upperBreakEven);
    expect(four.breakEvenMovePercent).toBe(one.breakEvenMovePercent);
  });

  it("refuses a call struck below the put", () => {
    // Overlapping legs make a guts, which is a different structure.
    expect(
      volatilityStructure({ direction: "long", ...STRANGLE, callStrike: 23_000 })
    ).toBeNull();
  });

  it("refuses a stated but unusable lot count", () => {
    // An absent lots means one; a present zero is a stated intention that
    // cannot be honoured.
    expect(volatilityStructure({ direction: "long", ...STRADDLE, lots: 0 })).toBeNull();
    expect(volatilityStructure({ direction: "long", ...STRADDLE, lots: -2 })).toBeNull();
  });

  it("refuses inputs that cannot describe a structure", () => {
    expect(
      volatilityStructure({ direction: "sideways" as "long", ...STRADDLE })
    ).toBeNull();
    expect(volatilityStructure({ direction: "long", ...STRADDLE, spot: 0 })).toBeNull();
    expect(volatilityStructure({ direction: "long", ...STRADDLE, callPremium: 0 })).toBeNull();
    expect(volatilityStructure({ direction: "long", ...STRADDLE, lotSize: 0 })).toBeNull();
    expect(
      volatilityStructure({ direction: "long", ...STRADDLE, putPremium: Number.NaN })
    ).toBeNull();
    expect(volatilityStructure(null as never)).toBeNull();
  });

  it("never emits a non-finite figure across a swept grid", () => {
    const found: string[] = [];
    for (const direction of ["long", "short"] as const) {
      for (const spot of [0.5, 24_000, 1e6]) {
        for (const premium of [0.05, 200, 5_000]) {
          const result = volatilityStructure({
            direction,
            spot,
            callStrike: 24_200,
            putStrike: 23_800,
            callPremium: premium,
            putPremium: premium,
            lotSize: 50,
          });
          if (!result) continue;
          for (const [key, value] of Object.entries(result)) {
            if (typeof value === "number" && !Number.isFinite(value)) {
              found.push(`${key}@${direction}/${spot}/${premium}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
