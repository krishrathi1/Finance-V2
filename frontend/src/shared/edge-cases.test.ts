/**
 * Regression tests for degenerate market data.
 *
 * Every case here was a live defect found by feeding the analytics inputs that
 * real providers genuinely return — a suspended scrip that never moves, a
 * position held three weeks, a statement year the provider skipped. Each one
 * produced a *confident wrong answer* rather than an error, which is the
 * failure mode that actually reaches a user's screen.
 */

import { describe, expect, it } from "vitest";

import { maxDrawdown } from "@/shared/price-stats";
import { calendarYearReturns, downsideRisk } from "@/shared/return-analytics";
import { xirr } from "@/shared/portfolio-returns";
import { statementCagr } from "@/shared/statement-analytics";
import { macd, rsi } from "@/shared/technical-indicators";

/** A daily series starting 2020-01-01, one calendar day per close. */
function series(closes: number[], startYear = 2020) {
  let day = Date.UTC(startYear, 0, 1);
  return closes.map((close) => {
    const date = new Date(day).toISOString().slice(0, 10);
    day += 86_400_000;
    return { date, close, high: close, low: close, volume: 1000 };
  });
}

describe("a price series that never moves", () => {
  // NSE scrips get suspended, circuit-locked, or simply go untraded for weeks.
  // The provider keeps returning rows; every close is identical.
  const flat = series(Array(60).fill(100));

  it("reads RSI as neutral, not overbought", () => {
    // Was 100/"overbought": avgLoss === 0 was checked before asking whether
    // there had been any gains either, so a dead ticker looked like a melt-up.
    expect(rsi(flat)).toEqual({ value: 50, zone: "neutral" });
  });

  it("still reports RSI 100 when the series genuinely only rises", () => {
    const rising = series(Array.from({ length: 60 }, (_, index) => 100 + index));
    expect(rsi(rising)?.value).toBe(100);
    expect(rsi(rising)?.zone).toBe("overbought");
  });

  it("calls MACD neutral rather than bullish", () => {
    // Was "bullish" via `histogram >= 0`, which the UI paints green with
    // "MACD above its signal line" — for a stock sitting exactly on it.
    expect(macd(flat)?.crossover).toBe("neutral");
  });

  it("reports no drawdown, matching a series that only rises", () => {
    // Was a 0% "drawdown" with peak/trough dates and `recovered: true`, while a
    // monotonically rising series correctly returned null. Two shapes with no
    // decline must not disagree.
    expect(maxDrawdown(flat)).toBeNull();
    expect(maxDrawdown(series([100, 101, 102, 103]))).toBeNull();
  });

  it("still measures a real decline", () => {
    const dip = maxDrawdown(series([100, 120, 60, 80]));
    expect(dip?.percent).toBeCloseTo(-50, 6);
    expect(dip?.peakPrice).toBe(120);
    expect(dip?.troughPrice).toBe(60);
  });
});

describe("downside risk when there is no downside", () => {
  it("never reports a gain as a loss", () => {
    // On a strong uptrend even the 5th-percentile day can be positive.
    // Math.abs() turned that gain into an identically-sized "loss", which the
    // card renders as `-2.1%` in red.
    const climbing = series(
      Array.from({ length: 200 }, (_, index) => 100 * Math.pow(1.004, index) - (index % 7 === 0 ? 0.2 : 0))
    );
    const risk = downsideRisk(climbing);
    if (risk) {
      expect(risk.valueAtRisk95).toBeGreaterThanOrEqual(0);
      expect(risk.expectedShortfall95).toBeGreaterThanOrEqual(0);
    }
  });

  it("still quantifies a genuinely volatile series", () => {
    const choppy = series(
      Array.from({ length: 200 }, (_, index) => 100 + 20 * Math.sin(index / 3) + (index % 11 === 0 ? -8 : 0))
    );
    const risk = downsideRisk(choppy);
    expect(risk).not.toBeNull();
    expect(risk!.valueAtRisk95).toBeGreaterThan(0);
  });
});

describe("XIRR over a short, sharply profitable holding", () => {
  it("solves a rate far above the old fixed bracket instead of vanishing", () => {
    // 10x in a month annualises to ~6e11. The bracket was capped at 1e6, so no
    // sign change was found and the metric silently disappeared from the
    // portfolio header — exactly when the number was most flattering.
    const rate = xirr([
      { date: "2026-01-01", amount: -100 },
      { date: "2026-02-01", amount: 1000 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeGreaterThan(1e6);
  });

  it("still solves ordinary rates precisely", () => {
    expect(
      xirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2026-01-01", amount: 1100 },
      ])
    ).toBeCloseTo(0.1, 4);
  });

  it("withholds a rate for a span too short to annualise", () => {
    // 3% over two days annualises to ~24,000%. That is noise wearing a
    // percentage sign, so no figure is better than a confident one.
    expect(
      xirr([
        { date: "2026-01-01", amount: -1000 },
        { date: "2026-01-03", amount: 1030 },
      ])
    ).toBeNull();
  });
});

describe("statement CAGR across a provider gap", () => {
  const rows = [
    { period: "2019", revenue: 100 },
    { period: "2020", revenue: null },
    { period: "2021", revenue: 150 },
    { period: "2022", revenue: 170 },
    { period: "2023", revenue: 200 },
  ];

  it("compounds over elapsed years, not over surviving rows", () => {
    // The 2020 gap leaves four usable rows. Using `rows - 1` compounds a
    // four-year gain over three years and overstates the growth rate.
    const fourYears = (Math.pow(200 / 100, 1 / 4) - 1) * 100;
    expect(statementCagr(rows, (row) => row.revenue)).toBeCloseTo(fourYears, 6);
  });

  it("falls back to the row count when periods carry no parseable year", () => {
    const unlabelled = [
      { period: "FY-A", revenue: 100 },
      { period: "FY-B", revenue: 110 },
      { period: "FY-C", revenue: 121 },
    ];
    expect(statementCagr(unlabelled, (row) => row.revenue)).toBeCloseTo(10, 6);
  });

  it("reads a year out of a full period date", () => {
    const dated = [
      { period: "2021-03-31", revenue: 100 },
      { period: "2023-03-31", revenue: 121 },
    ];
    expect(statementCagr(dated, (row) => row.revenue)).toBeCloseTo(10, 6);
  });
});

describe("calendar-year returns when coverage starts late", () => {
  it("calls a December-to-December return complete despite a missing January", () => {
    // Measured from the prior year's close, so the return spans the whole year
    // even though this year's own rows begin in March. It was flagged partial.
    const points = [
      ...Array.from({ length: 12 }, (_, month) => ({
        date: `2022-${String(month + 1).padStart(2, "0")}-15`,
        close: 100 + month,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        date: `2023-${String(index + 3).padStart(2, "0")}-15`,
        close: 200 + index,
      })),
    ];
    const byYear = calendarYearReturns(points);
    expect(byYear.find((entry) => entry.year === 2023)?.complete).toBe(true);
  });

  it("still flags a year that stops short of December", () => {
    const points = [
      ...Array.from({ length: 12 }, (_, month) => ({
        date: `2022-${String(month + 1).padStart(2, "0")}-15`,
        close: 100 + month,
      })),
      ...Array.from({ length: 6 }, (_, month) => ({
        date: `2023-${String(month + 1).padStart(2, "0")}-15`,
        close: 200 + month,
      })),
    ];
    const byYear = calendarYearReturns(points);
    expect(byYear.find((entry) => entry.year === 2023)?.complete).toBe(false);
  });
});
