import { describe, expect, it } from "vitest";

import {
  bonusIssue,
  buybackTender,
  rightsIssue,
  stockSplit,
} from "@/shared/corporate-action-tools";

describe("bonusIssue", () => {
  const base = { quantity: 100, buyPrice: 500, bonusNew: 1, bonusHeld: 1 };

  it("doubles the count and halves the cost on a 1:1", () => {
    const result = bonusIssue(base)!;
    expect(result.sharesReceived).toBe(100);
    expect(result.newQuantity).toBe(200);
    expect(result.newAveragePrice).toBe(250);
    expect(result.adjustmentFactor).toBe(0.5);
  });

  it("leaves the total invested untouched — the whole point", () => {
    // A bonus creates no value. If this ever moves, the card is lying to
    // someone watching their holding's price halve overnight.
    for (const [bonusNew, bonusHeld] of [
      [1, 1],
      [1, 2],
      [3, 1],
      [2, 5],
    ]) {
      const result = bonusIssue({ ...base, bonusNew, bonusHeld })!;
      expect(result.totalInvested).toBe(50_000);
    }
  });

  it("handles a ratio that is not 1:1", () => {
    const result = bonusIssue({ ...base, bonusNew: 1, bonusHeld: 2 })!;
    expect(result.sharesReceived).toBe(50);
    expect(result.newQuantity).toBe(150);
    expect(result.newAveragePrice).toBeCloseTo(333.3333, 4);
  });

  it("floors a fractional entitlement rather than granting part of a share", () => {
    // 5 shares in a 1:2 bonus earns 2.5 — exchanges settle 2 and pay cash for
    // the rest, so granting 2.5 would describe something that never happens.
    const result = bonusIssue({ ...base, quantity: 5, bonusNew: 1, bonusHeld: 2 })!;
    expect(result.sharesReceived).toBe(2);
    expect(result.newQuantity).toBe(7);
  });

  it("refuses inputs that cannot describe a bonus", () => {
    expect(bonusIssue({ ...base, quantity: 0 })).toBeNull();
    expect(bonusIssue({ ...base, buyPrice: -1 })).toBeNull();
    expect(bonusIssue({ ...base, bonusHeld: 0 })).toBeNull();
    expect(bonusIssue({ ...base, bonusNew: Number.NaN })).toBeNull();
    expect(bonusIssue(null as never)).toBeNull();
  });
});

describe("stockSplit", () => {
  const base = { quantity: 100, buyPrice: 500, oldFaceValue: 10, newFaceValue: 1 };

  it("multiplies the count by the face-value ratio", () => {
    const result = stockSplit(base)!;
    expect(result.newQuantity).toBe(1_000);
    expect(result.newAveragePrice).toBe(50);
    expect(result.totalInvested).toBe(50_000);
    expect(result.adjustmentFactor).toBe(0.1);
  });

  it("reports no shares received, because none are", () => {
    // A split subdivides existing shares rather than granting new ones. The
    // distinction matters to anyone reconciling a contract note.
    expect(stockSplit(base)!.sharesReceived).toBe(0);
  });

  it("refuses a face value that rises, which is a reverse split", () => {
    expect(stockSplit({ ...base, oldFaceValue: 1, newFaceValue: 10 })).toBeNull();
    expect(stockSplit({ ...base, oldFaceValue: 10, newFaceValue: 10 })).toBeNull();
  });

  it("refuses inputs that cannot describe a split", () => {
    expect(stockSplit({ ...base, quantity: 0 })).toBeNull();
    expect(stockSplit({ ...base, newFaceValue: 0 })).toBeNull();
    expect(stockSplit({ ...base, buyPrice: Number.NaN })).toBeNull();
    expect(stockSplit(null as never)).toBeNull();
  });
});

describe("rightsIssue", () => {
  const base = {
    quantity: 100,
    buyPrice: 500,
    rightsNew: 1,
    rightsHeld: 2,
    rightsPrice: 400,
    marketPrice: 600,
  };

  it("sizes the entitlement from the ratio", () => {
    const result = rightsIssue(base)!;
    expect(result.entitlement).toBe(50);
    expect(result.costToSubscribe).toBe(20_000);
    expect(result.quantityIfSubscribed).toBe(150);
  });

  it("raises the total invested, because new money went in", () => {
    // The one action here that is not cost-neutral, and the reconciliation a
    // reader will do on screen: existing cost + subscription = new total.
    const result = rightsIssue(base)!;
    expect(result.totalInvestedIfSubscribed).toBe(70_000);
    expect(result.totalInvestedIfSubscribed).toBe(100 * 500 + result.costToSubscribe);
    expect(result.averagePriceIfSubscribed).toBeCloseTo(466.6667, 4);
  });

  it("blends old and new shares into the ex-rights price", () => {
    // (100 x 600 + 50 x 400) / 150 = 533.33 — below the market price, which
    // is exactly the dilution a non-subscriber absorbs for nothing.
    const result = rightsIssue(base)!;
    expect(result.theoreticalExRightsPrice).toBeCloseTo(533.3333, 4);
    expect(result.theoreticalExRightsPrice).toBeLessThan(base.marketPrice);
    expect(result.valuePerRight).toBeCloseTo(133.3333, 4);
  });

  it("calls out an offer priced above the market", () => {
    // Not an opportunity: the shares are cheaper on the exchange.
    const result = rightsIssue({ ...base, rightsPrice: 700 })!;
    expect(result.worthSubscribing).toBe(false);
    expect(result.valuePerRight).toBe(0);
  });

  it("floors a fractional entitlement", () => {
    const result = rightsIssue({ ...base, quantity: 5 })!;
    expect(result.entitlement).toBe(2);
  });

  it("refuses inputs that cannot describe a rights issue", () => {
    expect(rightsIssue({ ...base, quantity: 0 })).toBeNull();
    expect(rightsIssue({ ...base, rightsHeld: 0 })).toBeNull();
    expect(rightsIssue({ ...base, rightsPrice: 0 })).toBeNull();
    expect(rightsIssue({ ...base, marketPrice: Number.NaN })).toBeNull();
    expect(rightsIssue(null as never)).toBeNull();
  });
});

describe("buybackTender", () => {
  const base = {
    sharesHeld: 100,
    buyPrice: 400,
    buybackPrice: 600,
    marketPrice: 500,
    acceptanceRatioPercent: 15,
  };

  it("applies the premium to the accepted shares only", () => {
    // The thing people miss: a 20% premium on a 15% acceptance ratio is not a
    // 20% gain on the position.
    const result = buybackTender(base)!;
    expect(result.sharesAccepted).toBe(15);
    expect(result.sharesReturned).toBe(85);
    expect(result.premiumPercent).toBe(20);
    expect(result.gainOnAccepted).toBe(3_000);
  });

  it("reports proceeds and the edge over selling on the exchange", () => {
    const result = buybackTender(base)!;
    expect(result.proceedsFromBuyback).toBe(9_000);
    expect(result.advantageOverSelling).toBe(1_500);
  });

  it("accounts for every share held", () => {
    for (const acceptanceRatioPercent of [0, 15, 33.3, 99, 100]) {
      const result = buybackTender({ ...base, acceptanceRatioPercent })!;
      expect(result.sharesAccepted + result.sharesReturned).toBe(base.sharesHeld);
    }
  });

  it("shows a buyback below the market as a disadvantage", () => {
    const result = buybackTender({ ...base, buybackPrice: 450 })!;
    expect(result.premiumPercent).toBe(-10);
    expect(result.advantageOverSelling).toBeLessThan(0);
  });

  it("refuses an acceptance ratio outside 0-100", () => {
    expect(buybackTender({ ...base, acceptanceRatioPercent: -1 })).toBeNull();
    expect(buybackTender({ ...base, acceptanceRatioPercent: 101 })).toBeNull();
    expect(buybackTender({ ...base, acceptanceRatioPercent: Number.NaN })).toBeNull();
  });

  it("refuses inputs that cannot describe a tender", () => {
    expect(buybackTender({ ...base, sharesHeld: 0 })).toBeNull();
    expect(buybackTender({ ...base, marketPrice: 0 })).toBeNull();
    expect(buybackTender(null as never)).toBeNull();
  });
});

describe("corporate actions never emit a non-finite figure", () => {
  const collectNonFinite = (result: unknown, path: string, found: string[]): void => {
    if (result === null || typeof result !== "object") return;
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        found.push(`${path}.${key}`);
      }
    }
  };

  it("survives extreme but legal inputs", () => {
    const found: string[] = [];
    for (const quantity of [1, 1e6, 1e9]) {
      for (const price of [0.05, 1e5]) {
        collectNonFinite(
          bonusIssue({ quantity, buyPrice: price, bonusNew: 7, bonusHeld: 3 }),
          `bonus(${quantity},${price})`,
          found
        );
        collectNonFinite(
          stockSplit({ quantity, buyPrice: price, oldFaceValue: 100, newFaceValue: 0.01 }),
          `split(${quantity},${price})`,
          found
        );
        collectNonFinite(
          rightsIssue({
            quantity,
            buyPrice: price,
            rightsNew: 3,
            rightsHeld: 7,
            rightsPrice: price / 2,
            marketPrice: price,
          }),
          `rights(${quantity},${price})`,
          found
        );
        collectNonFinite(
          buybackTender({
            sharesHeld: quantity,
            buyPrice: price,
            buybackPrice: price * 1.2,
            marketPrice: price,
            acceptanceRatioPercent: 33.3,
          }),
          `buyback(${quantity},${price})`,
          found
        );
      }
    }
    expect(found).toEqual([]);
  });
});
