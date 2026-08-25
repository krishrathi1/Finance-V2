import { describe, expect, it } from "vitest";

import { investmentThesis, type ThesisInput } from "@/shared/investment-thesis";

/** Enough signals to clear the minimum, all neutral unless overridden. */
const base: ThesisInput = {
  peRatio: 25,
  peerMedianPe: 25,
  pegRatio: 1.5,
  revenueCagrPercent: 8,
  profitCagrPercent: 10,
  roePercent: 12,
  debtToEquity: 0.8,
  interestCoverage: 5,
  altmanZ: 2.5,
  cashConversionRatio: 0.9,
};

/** A clearly strong business. */
const strong: ThesisInput = {
  ...base,
  peRatio: 15,
  peerMedianPe: 35,
  revenueCagrPercent: 22,
  profitCagrPercent: 28,
  roePercent: 24,
  debtToEquity: 0.1,
  interestCoverage: 20,
  altmanZ: 5,
  cashConversionRatio: 1.2,
  rollingBeatBenchmarkPercent: 85,
  promoterChangePoints: 2,
  promoterStakePercent: 62,
};

/** A clearly troubled one. */
const weak: ThesisInput = {
  ...base,
  peRatio: 60,
  peerMedianPe: 20,
  revenueCagrPercent: -8,
  profitCagrPercent: -15,
  roePercent: 4,
  debtToEquity: 3,
  interestCoverage: 1.2,
  altmanZ: 1.2,
  cashConversionRatio: 0.4,
  rollingBeatBenchmarkPercent: 20,
  promoterChangePoints: -3,
  promoterStakePercent: 41,
};

describe("investmentThesis", () => {
  it("puts a strong business on the constructive side", () => {
    const thesis = investmentThesis(strong)!;
    expect(thesis.stance).toBe("constructive");
    expect(thesis.balance).toBeGreaterThan(25);
    expect(thesis.bull.length).toBeGreaterThan(thesis.bear.length);
  });

  it("puts a troubled one on the cautious side", () => {
    const thesis = investmentThesis(weak)!;
    expect(thesis.stance).toBe("cautious");
    expect(thesis.balance).toBeLessThan(-25);
    expect(thesis.bear.length).toBeGreaterThan(thesis.bull.length);
  });

  it("always states both sides where both exist", () => {
    // Cheap and shrinking: a real combination, and the card must not hide
    // either half of it.
    const thesis = investmentThesis({
      ...base,
      peRatio: 12,
      peerMedianPe: 30,
      revenueCagrPercent: -6,
      cashConversionRatio: 1.3,
      debtToEquity: 2.5,
    })!;
    expect(thesis.bull.length).toBeGreaterThan(0);
    expect(thesis.bear.length).toBeGreaterThan(0);
  });

  it("leads each side with its strongest argument", () => {
    const thesis = investmentThesis(weak)!;
    const strengths = thesis.bear.map((signal) => signal.strength);
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
  });

  it("names the contradiction when cheapness meets insider selling", () => {
    const thesis = investmentThesis({
      ...base,
      peRatio: 12,
      peerMedianPe: 30,
      promoterChangePoints: -2,
      promoterStakePercent: 45,
      // Extra signals so the sample clears the minimum the card requires.
      roePercent: 22,
      debtToEquity: 0.1,
      cashConversionRatio: 1.2,
    })!;
    expect(thesis.tensions.length).toBeGreaterThan(0);
    expect(thesis.tensions.some((t) => /better informed/i.test(t.question))).toBe(true);
  });

  it("names the contradiction when profit grows but cash does not", () => {
    const thesis = investmentThesis({
      ...base,
      profitCagrPercent: 30,
      cashConversionRatio: 0.4,
      revenueCagrPercent: 18,
      roePercent: 21,
      debtToEquity: 0.2,
    })!;
    expect(thesis.tensions.some((t) => /not been collected|working-capital/i.test(t.question))).toBe(true);
  });

  it("raises no tension when the signals agree", () => {
    expect(investmentThesis(strong)!.tensions).toEqual([]);
  });

  it("says what would change the view", () => {
    const thesis = investmentThesis(weak)!;
    expect(thesis.watchItems.length).toBeGreaterThan(0);
    expect(thesis.watchItems.join(" ")).toMatch(/promoter|revenue|cash conversion|debt/i);
  });

  it("always offers at least one thing to watch", () => {
    expect(investmentThesis(strong)!.watchItems.length).toBeGreaterThan(0);
  });

  it("reports how much of the picture it could actually assess", () => {
    const thesis = investmentThesis(strong)!;
    expect(thesis.evaluated).toBeGreaterThan(0);
    expect(thesis.evaluated).toBeLessThanOrEqual(thesis.possible);
    expect(thesis.possible).toBeGreaterThan(15);
  });

  it("withholds the card when too little could be assessed", () => {
    // Two signals is not a case for or against anything.
    expect(investmentThesis({ roePercent: 25, debtToEquity: 0.1 })).toBeNull();
    expect(investmentThesis({ roePercent: 25 })).toBeNull();
    expect(investmentThesis({})).toBeNull();
    expect(investmentThesis(null)).toBeNull();
    expect(investmentThesis(undefined)).toBeNull();
  });

  it("ignores unusable inputs rather than reasoning from them", () => {
    const thesis = investmentThesis({
      ...strong,
      peRatio: Number.NaN,
      peerMedianPe: 0,
      roePercent: null,
      debtToEquity: -1,
      altmanZ: Number.POSITIVE_INFINITY,
    })!;
    expect(thesis).not.toBeNull();
    const claims = [...thesis.bull, ...thesis.bear].map((s) => s.claim).join(" ");
    expect(claims).not.toMatch(/NaN|Infinity|null/);
  });

  it("never contradicts itself by firing both sides of one rule", () => {
    const thesis = investmentThesis(weak)!;
    const bullKeys = new Set(thesis.bull.map((s) => s.key));
    for (const signal of thesis.bear) expect(bullKeys.has(signal.key)).toBe(false);
  });

  it("keeps the balance figure inside its stated range", () => {
    for (const input of [strong, weak, base]) {
      const thesis = investmentThesis(input);
      if (!thesis) continue;
      expect(thesis.balance).toBeGreaterThanOrEqual(-100);
      expect(thesis.balance).toBeLessThanOrEqual(100);
    }
  });

  it("treats a bank's suppressed Altman score as absent, not as a pass", () => {
    // quality-checklist suppresses Altman for financials; the thesis must not
    // read the resulting null as a clean bill of health.
    const thesis = investmentThesis({ ...strong, altmanZ: null })!;
    expect(thesis.bull.some((s) => s.key === "altman")).toBe(false);
    expect(thesis.bear.some((s) => s.key === "altman")).toBe(false);
  });
});
