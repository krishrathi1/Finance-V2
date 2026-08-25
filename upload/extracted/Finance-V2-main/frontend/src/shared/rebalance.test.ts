import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_WEIGHT_PERCENT, rebalancePlan } from "@/shared/rebalance";

const holding = (symbol: string, quantity: number, price: number) => ({ symbol, quantity, price });

describe("rebalancePlan — cap strategy", () => {
  // 60% / 20% / 20%. Only the first breaches a 20% cap.
  const lopsided = [
    holding("BIG", 600, 100),
    holding("MID", 200, 100),
    holding("SMALL", 200, 100),
  ];

  it("trims only the position that breaches the cap", () => {
    const plan = rebalancePlan(lopsided, { strategy: "cap", maxWeightPercent: 33.4 })!;
    expect(plan.trades).toHaveLength(1);
    expect(plan.trades[0].symbol).toBe("BIG");
    expect(plan.trades[0].action).toBe("sell");
    // 60% of 100,000 is 60,000; the cap allows 33,400, so ~266 shares go.
    expect(plan.trades[0].quantity).toBe(266);
  });

  it("leaves compliant positions alone rather than churning the whole book", () => {
    const plan = rebalancePlan(lopsided, { strategy: "cap", maxWeightPercent: 33.4 })!;
    expect(plan.untouched).toBe(2);
    expect(plan.trades.some((trade) => trade.symbol === "MID")).toBe(false);
  });

  it("reports the concentration it actually achieves, not the target", () => {
    const plan = rebalancePlan(lopsided, { strategy: "cap", maxWeightPercent: 33.4 })!;
    expect(plan.topWeightBefore).toBeCloseTo(60, 6);
    // Whole-share rounding leaves it a shade off the cap; the figure must
    // reflect the trades, not the intention.
    expect(plan.topWeightAfter).toBeLessThan(plan.topWeightBefore);
    expect(plan.topWeightAfter).toBeGreaterThan(30);
  });

  it("plans nothing when every position is already inside the cap", () => {
    const balanced = [holding("A", 100, 100), holding("B", 100, 100), holding("C", 100, 100)];
    const plan = rebalancePlan(balanced, { strategy: "cap", maxWeightPercent: 40 })!;
    expect(plan.trades).toEqual([]);
    expect(plan.turnover).toBe(0);
  });

  it("never lets the cap fall below an equal share", () => {
    // A 5% cap across three holdings is unsatisfiable — taken literally it
    // would sell almost everything. The cap is raised to the equal weight.
    const plan = rebalancePlan(
      [holding("A", 100, 100), holding("B", 100, 100), holding("C", 100, 100)],
      { strategy: "cap", maxWeightPercent: 5 }
    )!;
    expect(plan.trades).toEqual([]);
  });
});

describe("rebalancePlan — equal strategy", () => {
  it("moves every position toward an equal share", () => {
    const plan = rebalancePlan(
      [holding("BIG", 600, 100), holding("MID", 300, 100), holding("SMALL", 100, 100)],
      { strategy: "equal" }
    )!;
    const bySymbol = Object.fromEntries(plan.trades.map((trade) => [trade.symbol, trade]));
    // Equal weight on 100,000 across three is 33,333 each: BIG sheds 26,667,
    // SMALL adds 23,333, and MID tops up the 3,333 it is short.
    expect(bySymbol.BIG.action).toBe("sell");
    expect(bySymbol.BIG.quantity).toBe(266);
    expect(bySymbol.SMALL.action).toBe("buy");
    expect(bySymbol.SMALL.quantity).toBe(233);
    expect(bySymbol.MID.action).toBe("buy");
    expect(bySymbol.MID.quantity).toBe(33);
  });

  it("still skips a position whose drift is below the trade floor", () => {
    // MID is 3,333 short above; raising the floor past that leaves it alone.
    const plan = rebalancePlan(
      [holding("BIG", 600, 100), holding("MID", 300, 100), holding("SMALL", 100, 100)],
      { strategy: "equal", minTradeValue: 5_000 }
    )!;
    expect(plan.trades.some((trade) => trade.symbol === "MID")).toBe(false);
    expect(plan.trades.map((trade) => trade.symbol).sort()).toEqual(["BIG", "SMALL"]);
  });

  it("orders trades largest first so a partial follow-through still helps", () => {
    const plan = rebalancePlan(
      [holding("BIG", 800, 100), holding("MID", 150, 100), holding("SMALL", 50, 100)],
      { strategy: "equal" }
    )!;
    const values = plan.trades.map((trade) => trade.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});

describe("rebalancePlan — execution constraints", () => {
  it("quotes whole shares only", () => {
    const plan = rebalancePlan(
      [holding("A", 137, 733.5), holding("B", 11, 91.25), holding("C", 4, 2150)],
      { strategy: "equal" }
    )!;
    for (const trade of plan.trades) {
      expect(Number.isInteger(trade.quantity)).toBe(true);
      expect(trade.quantity).toBeGreaterThan(0);
    }
  });

  it("drops corrections too small to be worth the brokerage", () => {
    // A 0.5% drift on a small book is a few hundred rupees of trade.
    const plan = rebalancePlan(
      [holding("A", 101, 100), holding("B", 100, 100), holding("C", 99, 100)],
      { strategy: "equal", minTradeValue: 1_000 }
    )!;
    expect(plan.trades).toEqual([]);
    expect(plan.untouched).toBe(3);
  });

  it("makes those same corrections when the floor is removed", () => {
    const plan = rebalancePlan(
      [holding("A", 130, 100), holding("B", 100, 100), holding("C", 70, 100)],
      { strategy: "equal", minTradeValue: 0 }
    )!;
    expect(plan.trades.length).toBeGreaterThan(0);
  });

  it("never sells more units than are held", () => {
    const plan = rebalancePlan(
      [holding("TINY", 1, 100_000), holding("A", 100, 100), holding("B", 100, 100)],
      { strategy: "equal", minTradeValue: 0 }
    )!;
    const sell = plan.trades.find((trade) => trade.symbol === "TINY");
    if (sell) {
      expect(sell.action).toBe("sell");
      expect(sell.quantity).toBeLessThanOrEqual(1);
    }
  });

  it("never overshoots into the opposite imbalance", () => {
    // Rounding is toward the current position, so a sell can leave a holding
    // slightly overweight but never turns it underweight.
    const plan = rebalancePlan(
      [holding("BIG", 600, 100), holding("MID", 200, 100), holding("SMALL", 200, 100)],
      { strategy: "cap", maxWeightPercent: 33.4, minTradeValue: 0 }
    )!;
    expect(plan.topWeightAfter).toBeGreaterThanOrEqual(33.3);
  });

  it("reports turnover so the cost of the plan is visible", () => {
    const plan = rebalancePlan(
      [holding("BIG", 600, 100), holding("MID", 200, 100), holding("SMALL", 200, 100)],
      { strategy: "cap", maxWeightPercent: 33.4 }
    )!;
    expect(plan.turnover).toBeCloseTo(26_600, 0);
    expect(plan.turnoverPercent).toBeCloseTo(26.6, 1);
    // Nothing was bought, so the sale proceeds stay as cash.
    expect(plan.residualCash).toBeCloseTo(26_600, 0);
  });
});

describe("rebalancePlan — input handling", () => {
  it("merges tranches of the same stock before weighting", () => {
    // Three tranches of one stock is one 60% position, not three 20% ones.
    const plan = rebalancePlan(
      [
        holding("TCS", 200, 100),
        holding("tcs", 200, 100),
        holding("TCS", 200, 100),
        holding("A", 200, 100),
        holding("B", 200, 100),
      ],
      { strategy: "cap", maxWeightPercent: 33.4 }
    )!;
    const tcs = plan.trades.find((trade) => trade.symbol === "TCS")!;
    expect(tcs.currentWeightPercent).toBeCloseTo(60, 6);
    expect(tcs.action).toBe("sell");
  });

  it("ignores unpriced and nonsensical rows", () => {
    const plan = rebalancePlan(
      [
        holding("A", 100, 100),
        holding("B", 100, 100),
        holding("UNPRICED", 100, Number.NaN),
        holding("ZERO", 100, 0),
        holding("NEGATIVE", -5, 100),
        holding("", 100, 100),
      ],
      { strategy: "equal" }
    )!;
    expect(plan.totalValue).toBe(20_000);
  });

  it("returns null when there is nothing to allocate between", () => {
    expect(rebalancePlan([])).toBeNull();
    expect(rebalancePlan(null)).toBeNull();
    expect(rebalancePlan([holding("A", 100, 100)])).toBeNull();
    expect(rebalancePlan([holding("A", 100, Number.NaN), holding("B", 100, 0)])).toBeNull();
  });

  it("defaults to capping at 20%", () => {
    const plan = rebalancePlan([
      holding("BIG", 500, 100),
      holding("A", 125, 100),
      holding("B", 125, 100),
      holding("C", 125, 100),
      holding("D", 125, 100),
    ])!;
    expect(plan.strategy).toBe("cap");
    expect(plan.trades[0].symbol).toBe("BIG");
    expect(plan.trades[0].targetWeightPercent).toBe(DEFAULT_MAX_WEIGHT_PERCENT);
  });
});
