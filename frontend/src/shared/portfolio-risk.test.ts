import { describe, expect, it } from "vitest";

import { concentrationRisk } from "@/shared/portfolio-risk";

const position = (symbol: string, value: number) => ({ symbol, value });

describe("concentrationRisk", () => {
  it("scores an evenly split portfolio as diversified", () => {
    // Ten equal holdings: HHI = 10 x 10^2 = 1000, effective holdings = 10.
    const result = concentrationRisk(
      Array.from({ length: 10 }, (_, index) => position(`S${index}`, 100))
    )!;
    expect(result.hhi).toBeCloseTo(1000, 6);
    expect(result.effectiveHoldings).toBeCloseTo(10, 6);
    expect(result.diversificationScore).toBe(100);
    expect(result.level).toBe("diversified");
    expect(result.flags).toEqual([]);
  });

  it("puts a single holding at the maximum index", () => {
    const result = concentrationRisk([position("TCS", 50_000)])!;
    expect(result.hhi).toBeCloseTo(10_000, 6);
    expect(result.effectiveHoldings).toBeCloseTo(1, 6);
    expect(result.level).toBe("concentrated");
    expect(result.flags.join(" ")).toContain("entire portfolio");
  });

  it("sees through a holding count inflated by one dominant position", () => {
    // Twelve names, but one is 80% of the money. Counting rows says
    // "diversified"; weighting says otherwise.
    const result = concentrationRisk([
      position("BIG", 800),
      ...Array.from({ length: 11 }, (_, index) => position(`S${index}`, 200 / 11)),
    ])!;
    expect(result.holdingCount).toBe(12);
    expect(result.effectiveHoldings).toBeLessThan(2);
    expect(result.level).toBe("concentrated");
    expect(result.flags[0]).toContain("BIG is 80%");
  });

  it("merges tranches of the same stock before weighting", () => {
    // Bought in three tranches, or imported twice — as separate rows this
    // scores as a three-name portfolio, which inverts the whole measure.
    const split = concentrationRisk([
      position("TCS", 100),
      position("tcs", 100),
      position("TCS", 100),
    ])!;
    expect(split.holdingCount).toBe(1);
    expect(split.effectiveHoldings).toBeCloseTo(1, 6);
    expect(split.level).toBe("concentrated");
  });

  it("ranks positions by weight, largest first", () => {
    const result = concentrationRisk([
      position("SMALL", 100),
      position("LARGE", 700),
      position("MID", 200),
    ])!;
    expect(result.positions.map((entry) => entry.symbol)).toEqual(["LARGE", "MID", "SMALL"]);
    expect(result.topWeightPercent).toBeCloseTo(70, 6);
    expect(result.topThreePercent).toBeCloseTo(100, 6);
  });

  it("caps the top-N figures at the number of positions held", () => {
    const result = concentrationRisk([position("A", 60), position("B", 40)])!;
    expect(result.topThreePercent).toBeCloseTo(100, 6);
    expect(result.topFivePercent).toBeCloseTo(100, 6);
  });

  it("ignores unpriced and nonsensical positions rather than weighting them at zero", () => {
    const result = concentrationRisk([
      position("A", 100),
      position("B", 100),
      position("UNPRICED", Number.NaN),
      position("NEGATIVE", -50),
      position("ZERO", 0),
      { symbol: "  ", value: 100 },
    ])!;
    expect(result.holdingCount).toBe(2);
    expect(result.totalValue).toBe(200);
  });

  it("returns null when nothing is measurable", () => {
    expect(concentrationRisk([])).toBeNull();
    expect(concentrationRisk(null)).toBeNull();
    expect(concentrationRisk([position("A", Number.NaN)])).toBeNull();
    expect(concentrationRisk([position("A", 0)])).toBeNull();
  });

  it("flags a top-heavy portfolio even when no single name breaches the limit", () => {
    // Four names at 20% each plus a long tail: no position trips the 25% rule,
    // but the top three still hold most of the money.
    const result = concentrationRisk([
      position("A", 240),
      position("B", 240),
      position("C", 230),
      position("D", 145),
      position("E", 145),
    ])!;
    expect(result.topWeightPercent).toBeLessThan(25);
    expect(result.topThreePercent).toBeGreaterThan(70);
    expect(result.flags.join(" ")).toContain("top 3");
  });
});
