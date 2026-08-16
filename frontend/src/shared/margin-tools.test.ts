import { describe, expect, it } from "vitest";
import {
  intradayMargin,
  leverageRiskOfRuin,
  liquidationPrice,
  marginCallAmount,
  maxQuantityForMargin,
  type IntradayMarginInput,
  type LeverageRiskOfRuinInput,
  type LiquidationPriceInput,
  type MarginCallInput,
  type MaxQuantityForMarginInput,
} from "@/shared/margin-tools";

/**
 * The stress values every numeric field gets swept against. `Number` fields
 * that are structurally invalid at these values (negative quantities, NaN
 * percentages, an infinite price) are expected to fall back to `null` rather
 * than propagate a non-finite number into a result the UI would render.
 */
const EXTREME_VALUES = [
  0, -0, 1, -1, 0.1, 100, 1e-320, 1e308, -1e308, NaN, Infinity, -Infinity,
] as const;

/** Asserts every numeric field on a result object is finite (result may be null). */
function expectFiniteFieldsOrNull(result: Record<string, unknown> | null): void {
  if (result === null) return;
  for (const value of Object.values(result)) {
    if (typeof value === "number") {
      expect(Number.isFinite(value)).toBe(true);
    }
  }
}

/** Sweeps one numeric field of a base input across EXTREME_VALUES and checks no throw + finite-or-null. */
function sweepField<T extends Record<string, unknown>>(
  fn: (input: T) => Record<string, unknown> | number | null,
  base: T,
  field: keyof T
): void {
  for (const extreme of EXTREME_VALUES) {
    const input = { ...base, [field]: extreme } as T;
    let result: Record<string, unknown> | number | null;
    expect(() => {
      result = fn(input);
    }).not.toThrow();
    result = fn(input);
    if (typeof result === "number") {
      expect(Number.isFinite(result)).toBe(true);
    } else {
      expectFiniteFieldsOrNull(result);
    }
  }
}

describe("intradayMargin", () => {
  const base: IntradayMarginInput = { quantity: 100, price: 500, marginPercent: 20 };

  it("computes position value, margin, leverage and borrowed amount for 5x (20%) leverage", () => {
    const result = intradayMargin(base);
    expect(result).toEqual({
      positionValue: 50000,
      marginRequired: 10000,
      leverage: 5,
      borrowedAmount: 40000,
    });
  });

  it("treats marginPercent=100 as no leverage — full cash, nothing borrowed", () => {
    const result = intradayMargin({ ...base, marginPercent: 100 });
    expect(result).toEqual({
      positionValue: 50000,
      marginRequired: 50000,
      leverage: 1,
      borrowedAmount: 0,
    });
  });

  it("rejects marginPercent above 100 — not a leverage schedule any broker quotes", () => {
    expect(intradayMargin({ ...base, marginPercent: 100.01 })).toBeNull();
  });

  it("rejects non-positive quantity, price or marginPercent", () => {
    expect(intradayMargin({ ...base, quantity: 0 })).toBeNull();
    expect(intradayMargin({ ...base, quantity: -10 })).toBeNull();
    expect(intradayMargin({ ...base, price: 0 })).toBeNull();
    expect(intradayMargin({ ...base, price: -1 })).toBeNull();
    expect(intradayMargin({ ...base, marginPercent: 0 })).toBeNull();
    expect(intradayMargin({ ...base, marginPercent: -5 })).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(intradayMargin(null as unknown as IntradayMarginInput)).toBeNull();
    expect(intradayMargin(undefined as unknown as IntradayMarginInput)).toBeNull();
  });

  it("stays finite across extreme values on every numeric field", () => {
    sweepField(intradayMargin, base, "quantity");
    sweepField(intradayMargin, base, "price");
    sweepField(intradayMargin, base, "marginPercent");
  });
});

describe("maxQuantityForMargin", () => {
  const base: MaxQuantityForMarginInput = {
    availableMargin: 50000,
    price: 500,
    marginPercent: 20,
  };

  it("inverts intradayMargin exactly when the budget divides evenly", () => {
    const result = maxQuantityForMargin(base);
    expect(result).toEqual({
      maxQuantity: 500,
      positionValue: 250000,
      marginUsed: 50000,
      marginRemaining: 0,
    });
  });

  it("floors a fractional share count rather than rounding, leaving the remainder unused", () => {
    const result = maxQuantityForMargin({ ...base, availableMargin: 50050 });
    // rawQuantity = 50050 / (500*0.2) = 500.5 -> floors to 500
    expect(result).toEqual({
      maxQuantity: 500,
      positionValue: 250000,
      marginUsed: 50000,
      marginRemaining: 50,
    });
  });

  it("rejects non-positive availableMargin, price or an invalid marginPercent", () => {
    expect(maxQuantityForMargin({ ...base, availableMargin: 0 })).toBeNull();
    expect(maxQuantityForMargin({ ...base, availableMargin: -100 })).toBeNull();
    expect(maxQuantityForMargin({ ...base, price: 0 })).toBeNull();
    expect(maxQuantityForMargin({ ...base, marginPercent: 0 })).toBeNull();
    expect(maxQuantityForMargin({ ...base, marginPercent: 150 })).toBeNull();
  });

  it("stays finite across extreme values on every numeric field", () => {
    sweepField(maxQuantityForMargin, base, "availableMargin");
    sweepField(maxQuantityForMargin, base, "price");
    sweepField(maxQuantityForMargin, base, "marginPercent");
  });
});

describe("liquidationPrice", () => {
  const baseLong: LiquidationPriceInput = {
    entryPrice: 100,
    marginPercent: 20,
    maintenanceMarginPercent: 10,
    direction: "long",
  };

  // Hand-worked example (long): entryPrice=100, marginPercent=20 (5x), maintenance=10%.
  // borrowedPerShare = 100 * (1 - 0.20) = 80.
  // liquidation price = borrowedPerShare / (1 - 0.10) = 80 / 0.9 = 88.888...  -> 88.89
  // Check: equity at 88.89 = 88.89 - 80 = 8.89; 8.89 / 88.89 ≈ 0.10001 ≈ maintenance. ✓
  it("matches the hand-worked long liquidation price", () => {
    expect(liquidationPrice(baseLong)).toBe(88.89);
  });

  // Hand-worked example (short): same numbers, mirrored.
  // equity per share = entryPrice*(1+m) - P = 100*1.20 - P = 120 - P.
  // liquidation: (120 - P)/P = 0.10 -> 120 = 1.10P -> P = 109.0909... -> 109.09
  it("matches the hand-worked short liquidation price, which sits above entry", () => {
    const result = liquidationPrice({ ...baseLong, direction: "short" });
    expect(result).toBe(109.09);
    expect(result as number).toBeGreaterThan(baseLong.entryPrice);
  });

  it("returns null for a fully cash-collateralised long (marginPercent=100) — nothing to liquidate", () => {
    expect(liquidationPrice({ ...baseLong, marginPercent: 100 })).toBeNull();
  });

  it("rejects an unsatisfiable maintenance requirement (>=100) or a non-positive one", () => {
    expect(liquidationPrice({ ...baseLong, maintenanceMarginPercent: 100 })).toBeNull();
    expect(liquidationPrice({ ...baseLong, maintenanceMarginPercent: 150 })).toBeNull();
    expect(liquidationPrice({ ...baseLong, maintenanceMarginPercent: 0 })).toBeNull();
    expect(liquidationPrice({ ...baseLong, maintenanceMarginPercent: -5 })).toBeNull();
  });

  it("rejects an invalid marginPercent or entryPrice", () => {
    expect(liquidationPrice({ ...baseLong, marginPercent: 0 })).toBeNull();
    expect(liquidationPrice({ ...baseLong, marginPercent: 150 })).toBeNull();
    expect(liquidationPrice({ ...baseLong, entryPrice: 0 })).toBeNull();
    expect(liquidationPrice({ ...baseLong, entryPrice: -10 })).toBeNull();
  });

  it("defaults direction to long", () => {
    const { direction: _direction, ...withoutDirection } = baseLong;
    expect(liquidationPrice(withoutDirection as LiquidationPriceInput)).toBe(
      liquidationPrice(baseLong)
    );
  });

  it("rejects an unrecognised direction", () => {
    expect(
      liquidationPrice({ ...baseLong, direction: "sideways" as unknown as "long" })
    ).toBeNull();
  });

  it("stays finite (or null) across extreme values on every numeric field, both directions", () => {
    sweepField(liquidationPrice, baseLong, "entryPrice");
    sweepField(liquidationPrice, baseLong, "marginPercent");
    sweepField(liquidationPrice, baseLong, "maintenanceMarginPercent");
    const baseShort: LiquidationPriceInput = { ...baseLong, direction: "short" };
    sweepField(liquidationPrice, baseShort, "entryPrice");
    sweepField(liquidationPrice, baseShort, "marginPercent");
    sweepField(liquidationPrice, baseShort, "maintenanceMarginPercent");
  });
});

describe("marginCallAmount", () => {
  const baseLong: MarginCallInput = {
    quantity: 100,
    entryPrice: 100,
    currentPrice: 85,
    marginPercent: 20,
    maintenanceMarginPercent: 10,
    direction: "long",
  };

  // Hand-worked example (long): 100 shares, entry 100, price fell to 85,
  // marginPercent=20 (borrowed 80/share), maintenance=10%.
  // equityPerShare = 85 - 80 = 5  -> currentEquity = 500.
  // currentPositionValue = 8500; maintenanceRequirement = 850; requiredEquity (20%) = 1700.
  // 500 < 850 -> in margin call; top-up = 1700 - 500 = 1200.
  it("matches the hand-worked margin-call example", () => {
    const result = marginCallAmount(baseLong);
    expect(result).toEqual({
      currentEquity: 500,
      requiredEquity: 1700,
      marginCallAmount: 1200,
      inMarginCall: true,
    });
  });

  it("reports zero marginCallAmount and inMarginCall=false once above the maintenance floor", () => {
    // equityPerShare = 95 - 80 = 15 -> currentEquity = 1500; maintenanceRequirement = 9500*0.10 = 950.
    // 1500 >= 950, so not in a call, even though currentEquity (1500) is still below the
    // 20% initial-margin level (1900) — that gap is normal, not a call.
    const result = marginCallAmount({ ...baseLong, currentPrice: 95 });
    expect(result).toEqual({
      currentEquity: 1500,
      requiredEquity: 1900,
      marginCallAmount: 0,
      inMarginCall: false,
    });
  });

  it("handles a short position mirrored around entry", () => {
    // short: equityPerShare = entry*(1+m) - P = 100*1.20 - 112 = 8 -> currentEquity = 800.
    // currentPositionValue = 11200; maintenanceRequirement = 1120; requiredEquity = 2240.
    // 800 < 1120 -> in call; top-up = 2240 - 800 = 1440.
    const result = marginCallAmount({ ...baseLong, direction: "short", currentPrice: 112 });
    expect(result).toEqual({
      currentEquity: 800,
      requiredEquity: 2240,
      marginCallAmount: 1440,
      inMarginCall: true,
    });
  });

  it("rejects non-positive quantity, entryPrice or currentPrice", () => {
    expect(marginCallAmount({ ...baseLong, quantity: 0 })).toBeNull();
    expect(marginCallAmount({ ...baseLong, quantity: -1 })).toBeNull();
    expect(marginCallAmount({ ...baseLong, entryPrice: 0 })).toBeNull();
    expect(marginCallAmount({ ...baseLong, currentPrice: -5 })).toBeNull();
  });

  it("rejects an invalid marginPercent or maintenanceMarginPercent", () => {
    expect(marginCallAmount({ ...baseLong, marginPercent: 0 })).toBeNull();
    expect(marginCallAmount({ ...baseLong, marginPercent: 200 })).toBeNull();
    expect(marginCallAmount({ ...baseLong, maintenanceMarginPercent: 100 })).toBeNull();
    expect(marginCallAmount({ ...baseLong, maintenanceMarginPercent: 0 })).toBeNull();
  });

  it("stays finite (or null) across extreme values on every numeric field, both directions", () => {
    sweepField(marginCallAmount, baseLong, "quantity");
    sweepField(marginCallAmount, baseLong, "entryPrice");
    sweepField(marginCallAmount, baseLong, "currentPrice");
    sweepField(marginCallAmount, baseLong, "marginPercent");
    sweepField(marginCallAmount, baseLong, "maintenanceMarginPercent");
    const baseShort: MarginCallInput = { ...baseLong, direction: "short" };
    sweepField(marginCallAmount, baseShort, "quantity");
    sweepField(marginCallAmount, baseShort, "entryPrice");
    sweepField(marginCallAmount, baseShort, "currentPrice");
    sweepField(marginCallAmount, baseShort, "marginPercent");
    sweepField(marginCallAmount, baseShort, "maintenanceMarginPercent");
  });
});

describe("leverageRiskOfRuin", () => {
  const base: LeverageRiskOfRuinInput = { leverage: 5, adverseMovePercent: 10 };

  it("scales the adverse move by leverage", () => {
    expect(leverageRiskOfRuin(base)).toEqual({ equityLossPercent: 50, wipedOut: false });
  });

  it("reports being wiped out (and owing more) when the scaled loss exceeds 100%", () => {
    // 5x leverage against a 22% adverse move: 22 * 5 = 110% equity loss.
    const result = leverageRiskOfRuin({ leverage: 5, adverseMovePercent: 22 });
    expect(result).toEqual({ equityLossPercent: 110, wipedOut: true });
  });

  it("treats a zero adverse move as a valid, uneventful answer", () => {
    expect(leverageRiskOfRuin({ ...base, adverseMovePercent: 0 })).toEqual({
      equityLossPercent: 0,
      wipedOut: false,
    });
  });

  it("rejects a negative adverse move and non-positive leverage", () => {
    expect(leverageRiskOfRuin({ ...base, adverseMovePercent: -1 })).toBeNull();
    expect(leverageRiskOfRuin({ ...base, leverage: 0 })).toBeNull();
    expect(leverageRiskOfRuin({ ...base, leverage: -5 })).toBeNull();
  });

  it("stays finite across extreme values on every numeric field", () => {
    sweepField(leverageRiskOfRuin, base, "leverage");
    sweepField(leverageRiskOfRuin, base, "adverseMovePercent");
  });
});
