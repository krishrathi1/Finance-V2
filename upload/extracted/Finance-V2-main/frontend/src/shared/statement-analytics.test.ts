import { describe, expect, it } from "vitest";

import {
  cashConversion,
  duPont,
  freeCashFlowYield,
  growthProfile,
  leverageTrend,
  netMarginTrend,
  statementCagr,
  type StatementInput,
} from "./statement-analytics";

const BASE: StatementInput = {
  incomeStatement: [
    { period: "2026", revenue: 1000, ebit: 200, netIncome: 100 },
    { period: "2025", revenue: 800, ebit: 150, netIncome: 60 },
    { period: "2024", revenue: 600, ebit: 100, netIncome: 40 },
  ],
  balanceSheet: [
    { period: "2026", totalAssets: 2000, totalDebt: 200, totalLiabilities: 1000, equity: 1000 },
    { period: "2025", totalAssets: 1600, totalDebt: 300, totalLiabilities: 900, equity: 700 },
    { period: "2024", totalAssets: 1200, totalDebt: 400, totalLiabilities: 800, equity: 400 },
  ],
  cashFlow: [
    { period: "2026", operatingCashFlow: 150, freeCashFlow: 120 },
    { period: "2025", operatingCashFlow: 50, freeCashFlow: 20 },
  ],
};

describe("duPont", () => {
  it("decomposes ROE into margin, turnover and leverage", () => {
    const result = duPont(BASE)!;
    // margin 100/1000 = 10%; turnover 1000/2000 = 0.5; multiplier 2000/1000 = 2
    expect(result.netMargin).toBeCloseTo(10, 6);
    expect(result.assetTurnover).toBeCloseTo(0.5, 6);
    expect(result.equityMultiplier).toBeCloseTo(2, 6);
    // 0.10 * 0.5 * 2 = 10% ROE
    expect(result.roe).toBeCloseTo(10, 6);
  });

  it("multiplies back to ROE exactly", () => {
    const r = duPont(BASE)!;
    expect((r.netMargin / 100) * r.assetTurnover * r.equityMultiplier * 100).toBeCloseTo(r.roe, 9);
  });

  it("derives equity from assets minus liabilities when not reported", () => {
    const result = duPont({
      incomeStatement: [{ period: "2026", revenue: 1000, netIncome: 100 }],
      balanceSheet: [{ period: "2026", totalAssets: 2000, totalLiabilities: 1500 }],
    })!;
    expect(result.equityMultiplier).toBeCloseTo(4, 6); // 2000 / 500
  });

  it("names leverage as the driver for a heavily geared balance sheet", () => {
    const levered = duPont({
      incomeStatement: [{ period: "2026", revenue: 1000, netIncome: 20 }],
      balanceSheet: [{ period: "2026", totalAssets: 5000, totalLiabilities: 4500, equity: 500 }],
    })!;
    expect(levered.primaryDriver).toBe("leverage");
  });

  it("names margin as the driver for a high-margin, low-leverage business", () => {
    const fat = duPont({
      incomeStatement: [{ period: "2026", revenue: 1000, netIncome: 400 }],
      balanceSheet: [{ period: "2026", totalAssets: 1000, totalLiabilities: 50, equity: 950 }],
    })!;
    expect(fat.primaryDriver).toBe("margin");
  });

  it("refuses to describe negative equity", () => {
    // The multiplier goes negative and flips ROE's sign for the wrong reason.
    expect(
      duPont({
        incomeStatement: [{ period: "2026", revenue: 1000, netIncome: 100 }],
        balanceSheet: [{ period: "2026", totalAssets: 500, totalLiabilities: 800, equity: -300 }],
      })
    ).toBeNull();
  });

  it("returns null when statements are missing", () => {
    expect(duPont({})).toBeNull();
    expect(duPont({ incomeStatement: [{ period: "2026", revenue: 1000 }] })).toBeNull();
  });

  it("uses the newest period regardless of array order", () => {
    const reversed: StatementInput = {
      incomeStatement: [...BASE.incomeStatement!].reverse(),
      balanceSheet: [...BASE.balanceSheet!].reverse(),
    };
    expect(duPont(reversed)!.period).toBe("2026");
  });
});

describe("cashConversion", () => {
  it("rates profit fully backed by cash as strong", () => {
    const result = cashConversion({
      incomeStatement: [{ period: "2026", netIncome: 100 }],
      cashFlow: [{ period: "2026", operatingCashFlow: 150 }],
    })!;
    expect(result.ratio).toBeCloseTo(1.5, 6);
    expect(result.quality).toBe("strong");
  });

  it("flags profit that isn't arriving as cash", () => {
    const result = cashConversion({
      incomeStatement: [{ period: "2026", netIncome: 100 }],
      cashFlow: [{ period: "2026", operatingCashFlow: 40 }],
    })!;
    expect(result.quality).toBe("weak");
  });

  it("treats the 0.8-1.0 band as adequate", () => {
    const result = cashConversion({
      incomeStatement: [{ period: "2026", netIncome: 100 }],
      cashFlow: [{ period: "2026", operatingCashFlow: 90 }],
    })!;
    expect(result.quality).toBe("adequate");
  });

  it("returns null for a loss-making year, where the ratio is meaningless", () => {
    expect(
      cashConversion({
        incomeStatement: [{ period: "2026", netIncome: -50 }],
        cashFlow: [{ period: "2026", operatingCashFlow: 40 }],
      })
    ).toBeNull();
  });
});

describe("freeCashFlowYield", () => {
  it("expresses free cash flow against market cap", () => {
    expect(freeCashFlowYield(BASE, 2400)!).toBeCloseTo(5, 6); // 120 / 2400
  });

  it("can be negative when the business burns cash", () => {
    const result = freeCashFlowYield(
      { cashFlow: [{ period: "2026", freeCashFlow: -50 }] },
      1000
    )!;
    expect(result).toBeCloseTo(-5, 6);
  });

  it("returns null without a usable market cap", () => {
    expect(freeCashFlowYield(BASE, 0)).toBeNull();
    expect(freeCashFlowYield(BASE, null)).toBeNull();
    expect(freeCashFlowYield({}, 1000)).toBeNull();
  });
});

describe("netMarginTrend", () => {
  it("orders oldest first and measures the change", () => {
    const trend = netMarginTrend(BASE)!;
    expect(trend.points.map((p) => p.period)).toEqual(["2024", "2025", "2026"]);
    // 40/600 = 6.67% -> 100/1000 = 10%
    expect(trend.points[0].value).toBeCloseTo(6.667, 2);
    expect(trend.points[2].value).toBeCloseTo(10, 6);
    expect(trend.direction).toBe("up");
    expect(trend.change).toBeCloseTo(3.333, 2);
  });

  it("returns null with fewer than two usable periods", () => {
    expect(netMarginTrend({ incomeStatement: [{ period: "2026", revenue: 100, netIncome: 10 }] })).toBeNull();
  });

  it("skips periods with missing inputs rather than treating them as zero", () => {
    const trend = netMarginTrend({
      incomeStatement: [
        { period: "2026", revenue: 1000, netIncome: 100 },
        { period: "2025", revenue: null, netIncome: 60 },
        { period: "2024", revenue: 600, netIncome: 40 },
      ],
    })!;
    expect(trend.points).toHaveLength(2);
  });
});

describe("leverageTrend", () => {
  it("tracks falling debt as a downward trend", () => {
    const trend = leverageTrend(BASE)!;
    // 400/1200 = 33.3% -> 200/2000 = 10%
    expect(trend.direction).toBe("down");
    expect(trend.change).toBeLessThan(0);
  });
});

describe("statementCagr", () => {
  it("compounds across the reported periods", () => {
    // 600 -> 1000 over 2 intervals = ~29.1% a year.
    expect(statementCagr(BASE.incomeStatement, (row) => row.revenue)!).toBeCloseTo(29.1, 1);
  });

  it("returns null when the base is a loss or zero", () => {
    // A CAGR out of a negative or zero starting value is undefined.
    expect(
      statementCagr(
        [
          { period: "2026", netIncome: 100 },
          { period: "2025", netIncome: -50 },
        ] as any,
        (row) => row.netIncome
      )
    ).toBeNull();
  });

  it("returns null with fewer than two periods", () => {
    expect(statementCagr([{ period: "2026", revenue: 100 }] as any, (r) => r.revenue)).toBeNull();
  });
});

describe("growthProfile", () => {
  it("reports revenue and profit CAGR with the interval count", () => {
    const profile = growthProfile(BASE)!;
    expect(profile.years).toBe(2);
    expect(profile.revenueCagr!).toBeCloseTo(29.1, 1);
    expect(profile.profitCagr!).toBeCloseTo(58.1, 1); // 40 -> 100
  });

  it("returns null without at least two years", () => {
    expect(growthProfile({ incomeStatement: [{ period: "2026", revenue: 100 }] })).toBeNull();
  });
});
