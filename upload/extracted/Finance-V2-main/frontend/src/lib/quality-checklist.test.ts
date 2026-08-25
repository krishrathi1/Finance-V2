import { describe, expect, it } from "vitest";

import { altmanAppliesTo, computeQuality } from "./quality-checklist";

/** Balance sheet + income statement rich enough to produce an Altman Z. */
const ALTMAN_INPUT = {
  metrics: { marketCap: 2000, profitMargin: 10, roe: 15 },
  incomeStatement: [{ period: "Mar 2026", revenue: 1000, ebit: 200, netIncome: 150 }],
  balanceSheet: [
    {
      period: "Mar 2026",
      totalAssets: 1000,
      totalLiabilities: 300,
      currentAssets: 500,
      currentLiabilities: 200,
      retainedEarnings: 400,
    },
  ],
};

describe("altmanAppliesTo", () => {
  it("excludes sectors the 1968 manufacturing model was never fitted to", () => {
    for (const sector of [
      "Financial Services",
      "Banking",
      "Private Sector Bank",
      "Insurance",
      "Capital Markets",
      "NBFC",
      "Asset Management",
    ]) {
      expect(altmanAppliesTo(sector), sector).toBe(false);
    }
  });

  it("allows ordinary operating sectors", () => {
    for (const sector of ["Healthcare", "Information Technology", "FMCG", "Automobile", "", null, undefined]) {
      expect(altmanAppliesTo(sector), String(sector)).toBe(true);
    }
  });
});

describe("computeQuality — Altman gating", () => {
  it("computes a Z-score for an operating company", () => {
    const result = computeQuality({ ...ALTMAN_INPUT, sector: "Healthcare" });
    expect(result.altmanZ).not.toBeNull();
    expect(result.altmanZone).toBe("Safe");
  });

  it("suppresses the Z-score for a bank instead of reporting false distress", () => {
    // A bank's balance sheet makes this model read "distress" for an entirely
    // sound institution, and that verdict would leak into redFlags too.
    const result = computeQuality({ ...ALTMAN_INPUT, sector: "Private Sector Bank" });
    expect(result.altmanZ).toBeNull();
    expect(result.altmanZone).toBeNull();
    expect(result.redFlags).not.toContain("Altman Z in distress zone");
  });

  it("still scores the rest of the checklist for a bank", () => {
    // Only the Altman term is suppressed; ordinary quality checks still apply.
    const result = computeQuality({ ...ALTMAN_INPUT, sector: "Banking" });
    expect(result.checks.some((check) => check.pass !== null)).toBe(true);
  });

  it("defaults to computing the score when sector is unknown", () => {
    expect(computeQuality(ALTMAN_INPUT).altmanZ).not.toBeNull();
  });
});
