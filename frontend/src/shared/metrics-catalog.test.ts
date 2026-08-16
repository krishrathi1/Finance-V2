import { describe, expect, it } from "vitest";

import { buildMetricsCatalog, formatMetricValue, type MetricEntry } from "@/shared/metrics-catalog";

/** A data-rich synthetic payload shaped like the real dashboard. */
function richPayload() {
  const history: any[] = [];
  let day = Date.UTC(2021, 0, 1);
  for (let index = 0; index < 1250; index += 1) {
    const close = 100 * Math.pow(1.0006, index) + 8 * Math.sin(index / 9);
    history.push({
      date: new Date(day).toISOString().slice(0, 10),
      close,
      high: close * 1.01,
      low: close * 0.99,
      open: close,
      volume: 1_000_000 + (index % 30) * 10_000,
    });
    day += 86_400_000;
  }
  return {
    symbol: "RICH",
    sector: "Energy",
    price: { cmp: 210, changePercent: 0.6, fiftyTwoWeekLow: 150, fiftyTwoWeekHigh: 230, history },
    metrics: {
      marketCap: 500_000, peRatio: 22, industryPe: 18, pegRatio: 1.4, pbRatio: 3.1,
      evToSales: 4, roe: 17, roce: 19, roa: 9, profitMargin: 12, ebitdaMargin: 21,
      debtToEquity: 0.5, currentRatio: 1.6, interestCoverage: 9, totalDebt: 40_000,
      eps: 9.5, bookValue: 68, faceValue: 10, outstandingShares: 238, dividendYield: 1.1,
    },
    financials: {
      quarterly: [
        { period: "Q2 FY25", revenue: 100, profit: 10 },
        { period: "Q3 FY25", revenue: 105, profit: 11 },
        { period: "Q4 FY25", revenue: 110, profit: 12 },
        { period: "Q1 FY26", revenue: 118, profit: 13 },
        { period: "Q2 FY26", revenue: 125, profit: 15 },
      ],
      incomeStatement: [
        { period: "2025-03-31", revenue: 430, ebit: 90, netIncome: 52 },
        { period: "2024-03-31", revenue: 380, ebit: 78, netIncome: 44 },
        { period: "2023-03-31", revenue: 330, ebit: 66, netIncome: 36 },
      ],
      balanceSheet: [
        { period: "2025-03-31", totalAssets: 900, totalDebt: 200, totalLiabilities: 420, equity: 480, currentAssets: 300, currentLiabilities: 180, retainedEarnings: 260 },
        { period: "2024-03-31", totalAssets: 800, totalDebt: 210, totalLiabilities: 400, equity: 400, currentAssets: 260, currentLiabilities: 170, retainedEarnings: 210 },
      ],
      cashFlow: [
        { period: "2025-03-31", operatingCashFlow: 70, freeCashFlow: 40, investingCashFlow: -35, financingCashFlow: -20 },
        { period: "2024-03-31", operatingCashFlow: 60, freeCashFlow: 32, investingCashFlow: -30, financingCashFlow: -15 },
      ],
    },
    corporateActions: {
      dividends: [
        { exDate: "10-Jun-2025", dividendAmount: 3, type: "Dividend" },
        { exDate: "12-Jun-2024", dividendAmount: 2.5, type: "Dividend" },
        { exDate: "14-Jun-2023", dividendAmount: 2, type: "Dividend" },
      ],
    },
    shareholding: {
      history: [
        { quarter: "2025-09-30", promoters: 55, fii: 20, dii: 10, public: 15 },
        { quarter: "2025-12-31", promoters: 55.2, fii: 20.5, dii: 10, public: 14.3 },
        { quarter: "2026-03-31", promoters: 55.4, fii: 21, dii: 10, public: 13.6 },
        { quarter: "2026-06-30", promoters: 55.5, fii: 21.5, dii: 10, public: 13 },
        { quarter: "2026-09-30", promoters: 56, fii: 22, dii: 10, public: 12 },
      ],
    },
    returnsSummary: [
      { label: "1 Week", value: 1.2 }, { label: "1 Month", value: 3.4 },
      { label: "6 Months", value: 11 }, { label: "1 Year", value: 24 },
      { label: "3 Years", value: 80 }, { label: "5 Years", value: 160 },
    ],
  };
}

describe("buildMetricsCatalog", () => {
  it("produces a genuinely large catalog from rich data", () => {
    const catalog = buildMetricsCatalog(richPayload());
    expect(catalog.total).toBeGreaterThanOrEqual(100);
    expect(catalog.available).toBeGreaterThanOrEqual(85);
    expect(catalog.categories.length).toBeGreaterThanOrEqual(11);
  });

  it("never emits NaN, Infinity or empty values", () => {
    const catalog = buildMetricsCatalog(richPayload());
    for (const entry of catalog.entries) {
      if (typeof entry.value === "number") {
        expect(Number.isFinite(entry.value)).toBe(true);
      } else {
        expect(entry.value.length).toBeGreaterThan(0);
      }
      expect(formatMetricValue(entry)).not.toMatch(/NaN|Infinity|undefined|null/);
    }
  });

  it("keeps every key unique", () => {
    const catalog = buildMetricsCatalog(richPayload());
    const keys = catalog.entries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("computes cross-source metrics correctly", () => {
    const catalog = buildMetricsCatalog(richPayload());
    const byKey = Object.fromEntries(catalog.entries.map((entry) => [entry.key, entry]));

    // P/E vs industry: (22-18)/18.
    expect(byKey["pe-vs-industry"].value).toBeCloseTo(22.22, 1);
    // Earnings yield: 100/22.
    expect(byKey["earnings-yield"].value).toBeCloseTo(4.545, 2);
    // Quarterly YoY from the fiscal-quarter series: 125 vs 100.
    expect(byKey["rev-yoy-q"].value).toBeCloseTo(25, 6);
    // Capex proxy: 70 - 40.
    expect(byKey["capex-proxy"].value).toBe(30);
    // Dividend streak across three consecutive FYs.
    expect(byKey["div-streak"].value).toBe(3);
    // Promoter stake from the latest reported quarter.
    expect(byKey["promoter-stake"].value).toBe(56);
  });

  it("degrades to an empty catalog on an empty payload without throwing", () => {
    for (const payload of [{}, null, undefined, { price: {}, metrics: {} }]) {
      const catalog = buildMetricsCatalog(payload);
      expect(catalog.available).toBe(0);
      expect(catalog.entries).toEqual([]);
      expect(catalog.total).toBeGreaterThanOrEqual(100);
    }
  });

  it("survives a partially poisoned payload", () => {
    const poisoned = {
      ...richPayload(),
      metrics: { peRatio: "not-a-number", roe: Infinity, debtToEquity: NaN, marketCap: -5 },
      financials: { quarterly: "wrong-type", incomeStatement: [{ period: 42 }] },
    };
    const catalog = buildMetricsCatalog(poisoned);
    // Price-derived metrics still compute; the poisoned ones are just absent.
    expect(catalog.available).toBeGreaterThan(20);
    for (const entry of catalog.entries) {
      expect(formatMetricValue(entry)).not.toMatch(/NaN|Infinity/);
    }
  });

  it("keeps price-only stocks working with no financials at all", () => {
    const payload = richPayload();
    const catalog = buildMetricsCatalog({ price: payload.price, returnsSummary: payload.returnsSummary });
    const categories = new Set(catalog.entries.map((entry) => entry.category));
    expect(categories.has("Risk")).toBe(true);
    expect(categories.has("Technicals")).toBe(true);
    expect(categories.has("Returns")).toBe(true);
    expect(categories.has("Profitability")).toBe(false);
  });

  it("applies tone only at conventional thresholds", () => {
    const catalog = buildMetricsCatalog(richPayload());
    const de = catalog.entries.find((entry) => entry.key === "de")!;
    // 0.5 sits between the good (<=0.3) and bad (>=2) bands: no tint.
    expect(de.tone).toBeUndefined();
  });
});

describe("formatMetricValue", () => {
  const entry = (value: number | string, format: MetricEntry["format"], key = "x"): MetricEntry => ({
    key, label: "", category: "Valuation", value, format, about: "",
  });

  it("signs changes but not levels", () => {
    expect(formatMetricValue(entry(12.5, "percent"))).toBe("+12.50%");
    expect(formatMetricValue(entry(-8.2, "percent"))).toBe("-8.20%");
    expect(formatMetricValue(entry(42, "share"))).toBe("42.00%");
  });

  it("renders crore values at Indian scale", () => {
    expect(formatMetricValue(entry(500_000, "crore"))).toBe("₹5.00 L Cr");
    expect(formatMetricValue(entry(40_000, "crore"))).toBe("₹40,000 Cr");
  });

  it("renders long day-spans as years", () => {
    expect(formatMetricValue(entry(90, "days"))).toBe("90 d");
    expect(formatMetricValue(entry(767, "days"))).toBe("2.1 yr");
  });

  it("passes text through", () => {
    expect(formatMetricValue(entry("golden-cross", "text"))).toBe("golden-cross");
  });
});
