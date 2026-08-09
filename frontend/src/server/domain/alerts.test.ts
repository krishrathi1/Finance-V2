import { describe, expect, it } from "vitest";

import {
  conditionMet,
  decideAlert,
  evaluateAlerts,
  initialArmedState,
  normalizeSymbol,
} from "./alerts";

describe("conditionMet", () => {
  it("treats the target itself as met, in both directions", () => {
    // "Above 100" firing exactly at 100 is what a user expects from a target
    // price; an exclusive comparison would silently skip a clean touch.
    expect(conditionMet("above", 100, 100)).toBe(true);
    expect(conditionMet("below", 100, 100)).toBe(true);
  });

  it("distinguishes the two directions", () => {
    expect(conditionMet("above", 100, 101)).toBe(true);
    expect(conditionMet("above", 100, 99)).toBe(false);
    expect(conditionMet("below", 100, 99)).toBe(true);
    expect(conditionMet("below", 100, 101)).toBe(false);
  });
});

describe("decideAlert", () => {
  const armedAbove = { condition: "above" as const, targetPrice: 100, armed: true };

  it("triggers an armed alert whose condition is met", () => {
    expect(decideAlert(armedAbove, 120)).toEqual({ kind: "trigger", price: 120 });
  });

  it("leaves an armed alert alone below its target", () => {
    expect(decideAlert(armedAbove, 90)).toEqual({ kind: "none" });
  });

  it("never triggers a disarmed alert, even when the condition is met", () => {
    // The whole point of arming: an alert created while price was already past
    // the target must not fire on the very next sweep.
    expect(decideAlert({ ...armedAbove, armed: false }, 120)).toEqual({ kind: "none" });
  });

  it("arms a disarmed alert once price clears the target", () => {
    expect(decideAlert({ ...armedAbove, armed: false }, 90)).toEqual({ kind: "arm" });
  });

  it("arms then triggers across two passes", () => {
    const disarmed = { ...armedAbove, armed: false };
    expect(decideAlert(disarmed, 90)).toEqual({ kind: "arm" });
    expect(decideAlert({ ...disarmed, armed: true }, 120)).toEqual({ kind: "trigger", price: 120 });
  });

  describe("unusable prices", () => {
    // A provider outage must not be able to fire or silence an alert.
    it.each([
      ["missing", undefined],
      ["null", null],
      ["NaN", Number.NaN],
      ["infinite", Number.POSITIVE_INFINITY],
      ["zero", 0],
      ["negative", -5],
    ])("makes no decision for a %s price", (_label, price) => {
      expect(decideAlert(armedAbove, price as number)).toEqual({ kind: "none" });
      expect(decideAlert({ ...armedAbove, armed: false }, price as number)).toEqual({ kind: "none" });
    });
  });

  it("makes no decision when the target itself is unusable", () => {
    expect(decideAlert({ condition: "above", targetPrice: 0, armed: true }, 100)).toEqual({
      kind: "none",
    });
    expect(decideAlert({ condition: "above", targetPrice: Number.NaN, armed: true }, 100)).toEqual({
      kind: "none",
    });
  });
});

describe("evaluateAlerts", () => {
  it("partitions a batch into triggers and arms", () => {
    const result = evaluateAlerts(
      [
        { id: 1, symbol: "TCS", targetPrice: 100, condition: "above", armed: true },
        { id: 2, symbol: "INFY", targetPrice: 100, condition: "above", armed: false },
        { id: 3, symbol: "WIPRO", targetPrice: 100, condition: "below", armed: true },
      ],
      { TCS: 150, INFY: 80, WIPRO: 150 }
    );

    expect(result.triggered).toEqual([{ id: 1, price: 150 }]);
    expect(result.armed).toEqual([2]);
  });

  it("matches symbols case-insensitively on both sides", () => {
    const result = evaluateAlerts(
      [{ id: 1, symbol: " tcs ", targetPrice: 100, condition: "above", armed: true }],
      { TcS: 150 }
    );
    expect(result.triggered).toEqual([{ id: 1, price: 150 }]);
  });

  it("skips alerts with no quote rather than assuming a price", () => {
    const result = evaluateAlerts(
      [{ id: 1, symbol: "DELISTED", targetPrice: 100, condition: "above", armed: true }],
      { TCS: 150 }
    );
    expect(result).toEqual({ triggered: [], armed: [] });
  });

  it("handles an empty batch", () => {
    expect(evaluateAlerts([], { TCS: 150 })).toEqual({ triggered: [], armed: [] });
  });

  it("supports string ids", () => {
    const result = evaluateAlerts(
      [{ id: "abc", symbol: "TCS", targetPrice: 100, condition: "above", armed: true }],
      { TCS: 150 }
    );
    expect(result.triggered).toEqual([{ id: "abc", price: 150 }]);
  });
});

describe("initialArmedState", () => {
  it("disarms an alert whose condition is already satisfied", () => {
    // The alert dialog pre-fills the target with the current price, so this is
    // the default path when a user clicks Set Alert without editing.
    expect(initialArmedState("above", 100, 100)).toBe(false);
    expect(initialArmedState("above", 100, 120)).toBe(false);
    expect(initialArmedState("below", 100, 80)).toBe(false);
  });

  it("arms an alert that still has room to move", () => {
    expect(initialArmedState("above", 100, 80)).toBe(true);
    expect(initialArmedState("below", 100, 120)).toBe(true);
  });

  it("arms when the price is unknown or unusable", () => {
    // An alert that never fires is a worse failure than one that fires early.
    expect(initialArmedState("above", 100, undefined)).toBe(true);
    expect(initialArmedState("above", 100, null)).toBe(true);
    expect(initialArmedState("above", 100, 0)).toBe(true);
    expect(initialArmedState("above", 100, Number.NaN)).toBe(true);
  });
});

describe("normalizeSymbol", () => {
  it("trims and upper-cases", () => {
    expect(normalizeSymbol("  tcs ")).toBe("TCS");
  });

  it("survives nullish input", () => {
    expect(normalizeSymbol(undefined as unknown as string)).toBe("");
    expect(normalizeSymbol(null as unknown as string)).toBe("");
  });
});
