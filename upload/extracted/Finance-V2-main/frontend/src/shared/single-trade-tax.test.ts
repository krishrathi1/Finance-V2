import { describe, expect, it } from "vitest";

import { estimateTradeTax } from "@/shared/single-trade-tax";

describe("estimateTradeTax", () => {
  it("prices a short-term gain the same way taxForLots does", () => {
    // 100 shares, bought 1000, sold 2000: pnl = 100,000, held 100 days (short-
    // term). FY 2025-26 short-term rate is 20% + 4% cess. Matches the figure
    // already verified directly against taxForLots in capital-gains.test.ts.
    const result = estimateTradeTax({
      quantity: 100,
      buyPrice: 1000,
      sellPrice: 2000,
      buyDate: "2025-06-01",
      sellDate: "2025-09-09", // 100 days later
    })!;
    expect(result.holdingDays).toBe(100);
    expect(result.term).toBe("short");
    expect(result.realisedPnl).toBe(100_000);
    expect(result.shortTermTax).toBe(20_000);
    expect(result.cess).toBe(800);
    expect(result.totalTax).toBe(20_800);
  });

  it("shelters a long-term gain inside the exemption", () => {
    const result = estimateTradeTax({
      quantity: 10,
      buyPrice: 1000,
      sellPrice: 11_000,
      buyDate: "2024-01-01",
      sellDate: "2025-06-01", // 517 days later, long-term
    })!;
    expect(result.term).toBe("long");
    expect(result.realisedPnl).toBe(100_000);
    expect(result.exemptionUsed).toBe(100_000);
    expect(result.totalTax).toBe(0);
  });

  it("apportions buy and sell fees the same way the FIFO ledger does", () => {
    const result = estimateTradeTax({
      quantity: 100,
      buyPrice: 100,
      sellPrice: 120,
      buyDate: "2025-01-01",
      sellDate: "2025-06-01",
      buyFees: 100,
      sellFees: 200,
    })!;
    // costBasis = 100*(100+1) = 10100; proceeds = 100*(120-2) = 11800.
    expect(result.costBasis).toBe(10_100);
    expect(result.proceeds).toBe(11_800);
    expect(result.realisedPnl).toBe(1_700);
  });

  it("counts exactly 365 days as still short-term", () => {
    // The same >365 boundary the FIFO engine uses.
    const exact = estimateTradeTax({
      quantity: 1,
      buyPrice: 100,
      sellPrice: 200,
      buyDate: "2023-01-01",
      sellDate: "2024-01-01",
    })!;
    expect(exact.holdingDays).toBe(365);
    expect(exact.term).toBe("short");

    const overOneDay = estimateTradeTax({
      quantity: 1,
      buyPrice: 100,
      sellPrice: 200,
      buyDate: "2023-01-01",
      sellDate: "2024-01-02",
    })!;
    expect(overOneDay.holdingDays).toBe(366);
    expect(overOneDay.term).toBe("long");
  });

  it("counts down the days remaining to long-term, independent of the sell date", () => {
    // Held 100 days so far: 365 - 100 + 1 = 266 more days needed.
    const result = estimateTradeTax({
      quantity: 10,
      buyPrice: 100,
      sellPrice: 90,
      buyDate: "2025-06-01",
      sellDate: "2025-09-09",
    })!;
    expect(result.daysToLongTerm).toBe(266);
  });

  it("reports zero days remaining once already long-term", () => {
    const result = estimateTradeTax({
      quantity: 10,
      buyPrice: 100,
      sellPrice: 90,
      buyDate: "2023-01-01",
      sellDate: "2025-06-01",
    })!;
    expect(result.term).toBe("long");
    expect(result.daysToLongTerm).toBe(0);
  });

  it("handles a loss, carried forward rather than taxed", () => {
    const result = estimateTradeTax({
      quantity: 100,
      buyPrice: 200,
      sellPrice: 150,
      buyDate: "2025-01-01",
      sellDate: "2025-06-01",
    })!;
    expect(result.realisedPnl).toBe(-5_000);
    expect(result.totalTax).toBe(0);
    expect(result.carriedForwardLoss).toBe(5_000);
  });

  it("rejects a sell date before the buy date", () => {
    expect(
      estimateTradeTax({
        quantity: 10,
        buyPrice: 100,
        sellPrice: 110,
        buyDate: "2025-06-01",
        sellDate: "2025-01-01",
      })
    ).toBeNull();
  });

  it("rejects non-positive quantity or prices", () => {
    const base = { quantity: 10, buyPrice: 100, sellPrice: 110, buyDate: "2025-01-01", sellDate: "2025-06-01" };
    expect(estimateTradeTax({ ...base, quantity: 0 })).toBeNull();
    expect(estimateTradeTax({ ...base, buyPrice: -1 })).toBeNull();
    expect(estimateTradeTax({ ...base, sellPrice: Number.NaN })).toBeNull();
  });

  it("rejects unparseable dates rather than silently treating them as day zero", () => {
    const base = { quantity: 10, buyPrice: 100, sellPrice: 110 };
    expect(estimateTradeTax({ ...base, buyDate: "not-a-date", sellDate: "2025-06-01" })).toBeNull();
    expect(estimateTradeTax({ ...base, buyDate: "2025-01-01", sellDate: "" })).toBeNull();
  });

  it("prices a same-day trade as zero holding days, short-term", () => {
    const result = estimateTradeTax({
      quantity: 10,
      buyPrice: 100,
      sellPrice: 105,
      buyDate: "2025-06-01",
      sellDate: "2025-06-01",
    })!;
    expect(result.holdingDays).toBe(0);
    expect(result.term).toBe("short");
  });

  it("charges each side of a rate-change year at its own date's rate", () => {
    // Sold 2024-09-01, after the 23 July 2024 change: 20% short-term rate.
    const result = estimateTradeTax({
      quantity: 100,
      buyPrice: 100,
      sellPrice: 200,
      buyDate: "2024-06-01",
      sellDate: "2024-09-01",
    })!;
    expect(result.shortTermTax).toBe(2_000); // 10,000 * 20%
  });
});
