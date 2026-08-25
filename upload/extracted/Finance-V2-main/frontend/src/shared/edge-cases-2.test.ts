/**
 * Regression tests for the second edge-case sweep: inconsistent upstream data
 * shapes, absent HTTP headers, unit-blind parsing, and a calendar that expires.
 *
 * As with `edge-cases.test.ts`, each of these produced a confident wrong answer
 * rather than an error — the failure mode that reaches a user unnoticed.
 */

import { describe, expect, it } from "vitest";

import { computeQuality } from "@/lib/quality-checklist";
import { parseScreenerQuery } from "@/server/application/screener-query";
import { retryDelayMs } from "@/server/infrastructure/http";
import { getIndianMarketStatus, hasHolidayCalendar } from "@/shared/market-status";

describe("statement periods in mixed formats", () => {
  // A healthy latest year and a distressed prior year, labelled the two ways
  // providers actually label them.
  const healthyLatest = {
    period: "Mar 2024",
    totalAssets: 1000,
    totalLiabilities: 200,
    currentAssets: 800,
    currentLiabilities: 100,
    retainedEarnings: 600,
  };
  const distressedPrior = {
    period: "2023-03-31",
    totalAssets: 1000,
    totalLiabilities: 950,
    currentAssets: 50,
    currentLiabilities: 400,
    retainedEarnings: -300,
  };
  const incomeLatest = { period: "Mar 2024", revenue: 900, ebit: 200, netIncome: 150 };
  const incomePrior = { period: "2023-03-31", revenue: 100, ebit: -50, netIncome: -40 };
  const metrics = { marketCap: 1000, roe: 20 };

  it("selects the newest row even when the two rows are labelled differently", () => {
    // `periodKey` returned months (~24,290) for "Mar 2024" but epoch
    // milliseconds (~1.68e12) for "2023-03-31", so every ISO-dated row
    // outranked every named-month row and the OLDEST balance sheet was used.
    const result = computeQuality({
      metrics,
      incomeStatement: [incomeLatest, incomePrior],
      balanceSheet: [healthyLatest, distressedPrior],
    });
    expect(result.altmanZ).toBeCloseTo(6.24, 2);
    expect(result.altmanZone).toBe("Safe");
  });

  it("does not raise a bankruptcy red flag on a healthy company", () => {
    const result = computeQuality({
      metrics,
      incomeStatement: [incomeLatest, incomePrior],
      balanceSheet: [healthyLatest, distressedPrior],
    });
    // The mis-sort didn't just skew a number — it fed the red-flag list.
    expect(result.redFlags).not.toContain("Altman Z in distress zone");
  });

  it("agrees with the same data labelled consistently", () => {
    const mixed = computeQuality({
      metrics,
      incomeStatement: [incomeLatest, incomePrior],
      balanceSheet: [healthyLatest, distressedPrior],
    });
    const consistent = computeQuality({
      metrics,
      incomeStatement: [incomeLatest, { ...incomePrior, period: "Mar 2023" }],
      balanceSheet: [healthyLatest, { ...distressedPrior, period: "Mar 2023" }],
    });
    expect(mixed.altmanZ).toBe(consistent.altmanZ);
  });

  it("orders ISO-only and named-month-only lists identically", () => {
    const iso = computeQuality({
      metrics,
      incomeStatement: [{ ...incomePrior }, { ...incomeLatest, period: "2024-03-31" }],
      balanceSheet: [{ ...distressedPrior }, { ...healthyLatest, period: "2024-03-31" }],
    });
    expect(iso.altmanZ).toBeCloseTo(6.24, 2);
  });
});

describe("retry backoff", () => {
  it("backs off exponentially when the server sends no Retry-After", () => {
    // The absent header is the common case, and it was the broken one:
    // Number(null) === 0 is finite, so the delay collapsed to 0ms and the
    // retry fired instantly at an upstream that had just rate-limited us.
    expect(retryDelayMs(null, 0)).toBe(250);
    expect(retryDelayMs(null, 1)).toBe(500);
    expect(retryDelayMs(null, 2)).toBe(750);
  });

  it("honours a numeric Retry-After, capped so one upstream can't stall a request", () => {
    expect(retryDelayMs("1", 0)).toBe(1000);
    expect(retryDelayMs("120", 0)).toBe(2000);
  });

  it("falls back to the schedule for a date-form or nonsensical Retry-After", () => {
    expect(retryDelayMs("Wed, 21 Oct 2015 07:28:00 GMT", 0)).toBe(250);
    expect(retryDelayMs("0", 1)).toBe(500);
    expect(retryDelayMs("-5", 1)).toBe(500);
    expect(retryDelayMs("", 0)).toBe(250);
  });
});

describe("screener value units", () => {
  it("accepts a crore suffix on a field denominated in crore", () => {
    expect(parseScreenerQuery("market cap > 2cr").clauses).toEqual([
      { field: "marketCap", operator: ">", value: 2 },
    ]);
    expect(parseScreenerQuery("market cap > 50 lakh").clauses).toEqual([
      { field: "marketCap", operator: ">", value: 0.5 },
    ]);
  });

  it("rejects a crore/lakh suffix on a field that isn't in crore", () => {
    // `price > 2l` silently became `price > 0.02`, which every stock passes —
    // a filter that looks applied and does nothing.
    const priced = parseScreenerQuery("price > 2l");
    expect(priced.clauses).toEqual([]);
    expect(priced.unparsed).toEqual(["price > 2l"]);

    const roe = parseScreenerQuery("roe > 1cr");
    expect(roe.clauses).toEqual([]);
    expect(roe.unparsed).toEqual(["roe > 1cr"]);
  });

  it("still allows a plain thousand multiplier anywhere, since it assumes no unit", () => {
    expect(parseScreenerQuery("volume > 500k").clauses).toEqual([
      { field: "volume", operator: ">", value: 500_000 },
    ]);
  });

  it("keeps parsing the clauses it does understand alongside one it doesn't", () => {
    const parsed = parseScreenerQuery("pe < 20 and price > 2l and roe > 15");
    expect(parsed.clauses.map((clause) => clause.field)).toEqual(["pe", "roe"]);
    expect(parsed.unparsed).toEqual(["price > 2l"]);
  });

  it("still treats Indian digit grouping as one number", () => {
    expect(parseScreenerQuery("market cap > 1,50,000").clauses).toEqual([
      { field: "marketCap", operator: ">", value: 150_000 },
    ]);
  });
});

describe("NSE holiday calendar coverage", () => {
  it("knows which years it has a published list for", () => {
    expect(hasHolidayCalendar(2026)).toBe(true);
    expect(hasHolidayCalendar(2027)).toBe(false);
  });

  it("still closes the market on a known holiday", () => {
    // 26 January 2026, 10:30 IST — a weekday inside session hours.
    expect(getIndianMarketStatus(new Date(Date.UTC(2026, 0, 26, 5, 0))).isOpen).toBe(false);
  });

  it("discloses that holidays are unaccounted for in an uncovered year", () => {
    // The calendar used to be gated on `year === 2026`, so from 1 Jan 2027 the
    // header would read a confident "Live" straight through Republic Day.
    const status = getIndianMarketStatus(new Date(Date.UTC(2027, 0, 26, 5, 0)));
    expect(status.tooltip).toContain("2027");
    expect(status.tooltip).toMatch(/not loaded/i);
  });

  it("says nothing about the calendar in a year it does cover", () => {
    // A normal 2026 trading day: Monday 17 August, 10:30 IST.
    const status = getIndianMarketStatus(new Date(Date.UTC(2026, 7, 17, 5, 0)));
    expect(status.isOpen).toBe(true);
    expect(status.tooltip).not.toMatch(/not loaded/i);
  });

  it("keeps weekends closed regardless of calendar coverage", () => {
    // Saturday 30 January 2027.
    expect(getIndianMarketStatus(new Date(Date.UTC(2027, 0, 30, 5, 0))).isOpen).toBe(false);
  });
});
