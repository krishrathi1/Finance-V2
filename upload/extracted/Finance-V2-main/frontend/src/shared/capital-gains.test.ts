import { describe, expect, it } from "vitest";

import {
  CESS_PERCENT,
  capitalGainsByYear,
  currentFinancialYear,
  financialYearRange,
  harvestHeadroom,
  indianFinancialYear,
  regimeForDate,
  taxForLots,
} from "@/shared/capital-gains";
import type { RealisedLot } from "@/shared/portfolio-returns";

function lot(overrides: Partial<RealisedLot> & Pick<RealisedLot, "realisedPnl" | "sellDate" | "term">): RealisedLot {
  return {
    symbol: "TCS",
    quantity: 10,
    buyPrice: 100,
    sellPrice: 100,
    buyDate: "2020-01-01",
    costBasis: 1000,
    proceeds: 1000,
    realisedPnlPercent: 0,
    holdingDays: overrides.term === "long" ? 400 : 100,
    ...overrides,
  };
}

describe("indianFinancialYear", () => {
  it("starts the year in April, not January", () => {
    expect(indianFinancialYear("2025-04-01")).toBe("2025-26");
    expect(indianFinancialYear("2026-03-31")).toBe("2025-26");
  });

  it("puts January to March in the year that began the previous April", () => {
    // The off-by-one that calendar-year grouping gets wrong: these two sales
    // are three days apart and belong to different assessment years.
    expect(indianFinancialYear("2026-03-30")).toBe("2025-26");
    expect(indianFinancialYear("2026-04-02")).toBe("2026-27");
  });

  it("wraps the century correctly", () => {
    expect(indianFinancialYear("2099-05-01")).toBe("2099-00");
  });

  it("rejects anything it cannot place", () => {
    expect(indianFinancialYear("not-a-date")).toBeNull();
    expect(indianFinancialYear("2025-13-01")).toBeNull();
    expect(indianFinancialYear("")).toBeNull();
  });

  it("round-trips to a range", () => {
    expect(financialYearRange("2025-26")).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(currentFinancialYear("2025-08-16")).toBe("2025-26");
  });
});

describe("regimeForDate", () => {
  it("applies the post-July-2024 rates from the day they took effect", () => {
    expect(regimeForDate("2024-07-23").shortTermPercent).toBe(20);
    expect(regimeForDate("2024-07-23").longTermPercent).toBe(12.5);
    expect(regimeForDate("2024-07-23").longTermExemption).toBe(125_000);
  });

  it("still applies the old rates the day before", () => {
    expect(regimeForDate("2024-07-22").shortTermPercent).toBe(15);
    expect(regimeForDate("2024-07-22").longTermPercent).toBe(10);
    expect(regimeForDate("2024-07-22").longTermExemption).toBe(100_000);
  });
});

describe("taxForLots", () => {
  it("charges short-term gains at 20% plus cess", () => {
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: 100_000, sellDate: "2025-06-01", term: "short" }),
    ])!;
    expect(result.taxableShortTerm).toBe(100_000);
    expect(result.shortTermTax).toBe(20_000);
    expect(result.cess).toBe(20_000 * (CESS_PERCENT / 100));
    expect(result.totalTax).toBe(20_800);
  });

  it("shelters long-term gains up to the annual exemption", () => {
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: 125_000, sellDate: "2025-06-01", term: "long" }),
    ])!;
    expect(result.exemptionUsed).toBe(125_000);
    expect(result.taxableLongTerm).toBe(0);
    expect(result.longTermTax).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.exemptionRemaining).toBe(0);
  });

  it("charges only the excess over the exemption at 12.5%", () => {
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: 225_000, sellDate: "2025-06-01", term: "long" }),
    ])!;
    expect(result.taxableLongTerm).toBe(100_000);
    expect(result.longTermTax).toBe(12_500);
    expect(result.totalTax).toBe(13_000);
  });

  it("reports the unused exemption as harvesting headroom", () => {
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: 40_000, sellDate: "2025-06-01", term: "long" }),
    ])!;
    expect(result.exemptionUsed).toBe(40_000);
    expect(result.exemptionRemaining).toBe(85_000);
  });
});

describe("loss set-off", () => {
  it("lets a short-term loss reduce a long-term gain", () => {
    // Permitted in this direction: s.70/71 allow a short-term loss against
    // both buckets.
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: -200_000, sellDate: "2025-06-01", term: "short" }),
      lot({ realisedPnl: 300_000, sellDate: "2025-07-01", term: "long" }),
    ])!;
    expect(result.lossSetOff).toBe(200_000);
    // 300k gain - 200k loss = 100k, fully inside the 1.25L exemption.
    expect(result.taxableLongTerm).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.carriedForwardLoss).toBe(0);
  });

  it("refuses to set a long-term loss against a short-term gain", () => {
    // The asymmetry that naive netting gets wrong: netting to zero here would
    // wipe out a real 300k short-term charge.
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: -300_000, sellDate: "2025-06-01", term: "long" }),
      lot({ realisedPnl: 300_000, sellDate: "2025-07-01", term: "short" }),
    ])!;
    expect(result.taxableShortTerm).toBe(300_000);
    expect(result.shortTermTax).toBe(60_000);
    expect(result.lossSetOff).toBe(0);
    // The long-term loss is stranded and can only be carried forward.
    expect(result.carriedForwardLoss).toBe(300_000);
  });

  it("carries forward a short-term loss that nothing absorbs", () => {
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: -50_000, sellDate: "2025-06-01", term: "short" }),
    ])!;
    expect(result.totalTax).toBe(0);
    expect(result.carriedForwardLoss).toBe(50_000);
  });

  it("nets losses within the short-term bucket before charging", () => {
    const result = taxForLots("2025-26", [
      lot({ realisedPnl: 100_000, sellDate: "2025-06-01", term: "short" }),
      lot({ realisedPnl: -30_000, sellDate: "2025-07-01", term: "short" }),
    ])!;
    expect(result.taxableShortTerm).toBe(70_000);
    expect(result.shortTermTax).toBe(14_000);
  });
});

describe("a financial year spanning the 2024 rate change", () => {
  // FY 2024-25 contains sales under both regimes. One blended rate would be
  // wrong for every lot in the year.
  const lots = [
    lot({ realisedPnl: 100_000, sellDate: "2024-05-01", term: "short" }), // 15%
    lot({ realisedPnl: 100_000, sellDate: "2024-09-01", term: "short" }), // 20%
  ];

  it("charges each sale at the rate in force on its own date", () => {
    const result = taxForLots("2024-25", lots)!;
    expect(result.shortTermTax).toBe(15_000 + 20_000);
    expect(result.regimeLabels).toHaveLength(2);
  });

  it("spends the exemption against the dearer long-term slice first", () => {
    // 100k at 10% and 100k at 12.5%. The 1.25L allowance should shelter all of
    // the 12.5% slice and 25k of the 10% one, leaving 75k charged at 10%.
    const result = taxForLots("2024-25", [
      lot({ realisedPnl: 100_000, sellDate: "2024-05-01", term: "long" }),
      lot({ realisedPnl: 100_000, sellDate: "2024-09-01", term: "long" }),
    ])!;
    expect(result.exemptionUsed).toBe(125_000);
    expect(result.taxableLongTerm).toBe(75_000);
    expect(result.longTermTax).toBe(7_500);
  });
});

describe("capitalGainsByYear", () => {
  const lots = [
    lot({ realisedPnl: 50_000, sellDate: "2024-06-01", term: "short" }),
    lot({ realisedPnl: 60_000, sellDate: "2025-06-01", term: "short" }),
    lot({ realisedPnl: 10_000, sellDate: "2026-03-30", term: "short" }),
  ];

  it("splits the ledger by financial year, newest first", () => {
    const years = capitalGainsByYear(lots);
    expect(years.map((entry) => entry.financialYear)).toEqual(["2025-26", "2024-25"]);
  });

  it("keeps a March sale in the closing year rather than the next one", () => {
    const years = capitalGainsByYear(lots);
    const fy2526 = years.find((entry) => entry.financialYear === "2025-26")!;
    expect(fy2526.shortTermGain).toBe(70_000);
    expect(fy2526.realisedLots).toBe(2);
  });

  it("skips lots with an unusable sale date instead of misfiling them", () => {
    expect(capitalGainsByYear([lot({ realisedPnl: 1, sellDate: "", term: "short" })])).toEqual([]);
  });

  it("returns nothing for an empty ledger", () => {
    expect(capitalGainsByYear([])).toEqual([]);
    expect(capitalGainsByYear(null as never)).toEqual([]);
  });
});

describe("harvestHeadroom", () => {
  it("reports the full allowance when nothing has been realised yet", () => {
    const headroom = harvestHeadroom([], "2025-08-16")!;
    expect(headroom.financialYear).toBe("2025-26");
    expect(headroom.exemptionRemaining).toBe(125_000);
  });

  it("counts the days left to act, including 31 March", () => {
    const headroom = harvestHeadroom([], "2026-03-31")!;
    expect(headroom.daysRemaining).toBe(1);
  });

  it("subtracts the exemption already used this year", () => {
    const breakdowns = capitalGainsByYear([
      lot({ realisedPnl: 100_000, sellDate: "2025-06-01", term: "long" }),
    ]);
    expect(harvestHeadroom(breakdowns, "2025-08-16")!.exemptionRemaining).toBe(25_000);
  });

  it("goes quiet once the allowance is spent", () => {
    const breakdowns = capitalGainsByYear([
      lot({ realisedPnl: 500_000, sellDate: "2025-06-01", term: "long" }),
    ]);
    expect(harvestHeadroom(breakdowns, "2025-08-16")).toBeNull();
  });

  it("ignores an unrelated year's unused allowance", () => {
    const breakdowns = capitalGainsByYear([
      lot({ realisedPnl: 500_000, sellDate: "2024-06-01", term: "long" }),
    ]);
    // FY 2024-25 is exhausted, but the open year is untouched.
    expect(harvestHeadroom(breakdowns, "2025-08-16")!.exemptionRemaining).toBe(125_000);
  });
});
