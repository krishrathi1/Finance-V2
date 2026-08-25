/**
 * Regression tests for valuing a portfolio against live prices.
 *
 * Every case here was a live defect. The portfolio page is the one screen
 * showing someone their own money, and each of these reported a confident,
 * specific, wrong number rather than failing visibly — the failure mode that
 * gets believed.
 */

import { describe, expect, it } from "vitest";

import { enrichHoldings, portfolioSummary } from "@/lib/portfolio";
import type { Holding } from "@/lib/portfolio";

const holding = (symbol: string, quantity: number, buyPrice: number): Holding => ({
  id: symbol,
  symbol,
  companyName: symbol,
  quantity,
  buyPrice,
  buyDate: "2025-01-01",
});

const TCS = holding("TCS", 10, 3000); // invested 30,000
const INFY = holding("INFY", 20, 1500); // invested 30,000

describe("a price the provider should not have sent", () => {
  it("treats zero as no price rather than a total loss", () => {
    // `prices[symbol] ?? null` only rejects null/undefined, so a suspended or
    // pre-open scrip quoting 0 valued the position at nothing and reported a
    // clean -100% on shares that still exist.
    const [tcs] = enrichHoldings([TCS], { TCS: 0 });
    expect(tcs.currentPrice).toBeNull();
    expect(tcs.currentValue).toBeNull();
    expect(tcs.pnl).toBeNull();
    expect(tcs.pnlPercent).toBeNull();
  });

  it("does not let one NaN quote poison every total on the page", () => {
    // Addition propagates NaN, so a single bad row turned the portfolio's
    // invested, current and P&L figures all into NaN.
    const enriched = enrichHoldings([TCS, INFY], { TCS: Number.NaN, INFY: 1600 });
    const summary = portfolioSummary(enriched);

    expect(Number.isFinite(summary.totalCurrentValue)).toBe(true);
    expect(Number.isFinite(summary.totalPnl)).toBe(true);
    expect(Number.isFinite(summary.totalInvested)).toBe(true);
    // Only INFY could be valued: 20 * 1600 = 32,000 against 30,000 invested.
    expect(summary.totalCurrentValue).toBe(32_000);
    expect(summary.totalPnl).toBe(2_000);
    expect(summary.knownCount).toBe(1);
  });

  it("rejects a negative price rather than reporting a negative position", () => {
    const [tcs] = enrichHoldings([TCS], { TCS: -50 });
    expect(tcs.currentPrice).toBeNull();
    expect(tcs.currentValue).toBeNull();
  });

  it("rejects a non-numeric price", () => {
    const [tcs] = enrichHoldings([TCS], { TCS: "not a price" as unknown as number });
    expect(tcs.currentPrice).toBeNull();
  });

  it("still values a healthy quote exactly", () => {
    const [tcs] = enrichHoldings([TCS], { TCS: 3500 });
    expect(tcs.currentPrice).toBe(3500);
    expect(tcs.currentValue).toBe(35_000);
    expect(tcs.pnl).toBe(5_000);
    expect(tcs.pnlPercent).toBeCloseTo(16.6667, 3);
  });
});

describe("matching a holding to its quote", () => {
  it("matches case-insensitively", () => {
    // Holdings are stored upper-cased today, but a row predating that rule —
    // or one hand-edited in localStorage — sat permanently unvalued while its
    // quote was sitting right there under a different case.
    const [row] = enrichHoldings([holding("tcs", 10, 3000)], { TCS: 3500 });
    expect(row.currentPrice).toBe(3500);
    expect(row.currentValue).toBe(35_000);
  });

  it("ignores surrounding whitespace on either side", () => {
    const [row] = enrichHoldings([holding(" TCS ", 10, 3000)], { " tcs ": 3500 });
    expect(row.currentPrice).toBe(3500);
  });

  it("leaves a genuinely unquoted holding unvalued", () => {
    const [row] = enrichHoldings([TCS], { INFY: 1600 });
    expect(row.currentPrice).toBeNull();
    expect(row.investedValue).toBe(30_000);
  });
});

describe("portfolioSummary", () => {
  it("computes P&L only across holdings it could actually value", () => {
    // Mixing a priced and an unpriced holding: the P&L percentage must be
    // measured against what was invested in the PRICED ones, or a half-priced
    // portfolio reports a loss it has not made.
    const enriched = enrichHoldings([TCS, INFY], { TCS: 3600 });
    const summary = portfolioSummary(enriched);

    expect(summary.totalInvested).toBe(60_000); // both holdings
    expect(summary.totalCurrentValue).toBe(36_000); // TCS only
    expect(summary.totalPnl).toBe(6_000); // against TCS's 30,000, not 60,000
    expect(summary.totalPnlPercent).toBeCloseTo(20, 6);
    expect(summary.knownCount).toBe(1);
  });

  it("reports zeros rather than NaN for an empty portfolio", () => {
    const summary = portfolioSummary([]);
    expect(summary.totalInvested).toBe(0);
    expect(summary.totalCurrentValue).toBe(0);
    expect(summary.totalPnl).toBe(0);
    expect(summary.totalPnlPercent).toBe(0);
    expect(summary.knownCount).toBe(0);
  });

  it("survives a corrupt holding without poisoning the total", () => {
    // A hand-edited or half-synced localStorage row with a non-numeric
    // quantity must not take the rest of the portfolio down with it.
    const corrupt = { ...TCS, quantity: Number.NaN };
    const summary = portfolioSummary(enrichHoldings([corrupt, INFY], { TCS: 3500, INFY: 1600 }));
    expect(Number.isFinite(summary.totalInvested)).toBe(true);
    expect(Number.isFinite(summary.totalCurrentValue)).toBe(true);
    expect(Number.isFinite(summary.totalPnl)).toBe(true);
  });

  it("adds up a fully priced portfolio exactly", () => {
    const summary = portfolioSummary(enrichHoldings([TCS, INFY], { TCS: 3500, INFY: 1600 }));
    expect(summary.totalInvested).toBe(60_000);
    expect(summary.totalCurrentValue).toBe(67_000);
    expect(summary.totalPnl).toBe(7_000);
    expect(summary.knownCount).toBe(2);
  });
});
