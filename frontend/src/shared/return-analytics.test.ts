import { describe, expect, it } from "vitest";

import {
  calendarYearReturns,
  downsideRisk,
  trailingReturns,
  volatilityRegime,
} from "./return-analytics";
import type { PricePoint } from "./price-stats";

/** Daily series starting at a given date. */
function daily(closes: number[], startIso = "2020-01-01"): PricePoint[] {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  return closes.map((close, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

describe("trailingReturns", () => {
  it("omits windows longer than the available history", () => {
    // 100 sessions can support 1M and 3M, never 1Y — clamping to the full
    // series would mislabel a 4-month return as a year.
    const labels = trailingReturns(daily(Array.from({ length: 100 }, (_, i) => 100 + i))).map(
      (r) => r.label
    );
    expect(labels).toContain("1M");
    expect(labels).toContain("3M");
    expect(labels).not.toContain("1Y");
    expect(labels).not.toContain("5Y");
  });

  it("computes a simple return for windows up to a year", () => {
    // Flat then a step: 21 sessions back the price was 100, now 110.
    const closes = [...Array(30).fill(100), ...Array(21).fill(110)];
    const oneMonth = trailingReturns(daily(closes)).find((r) => r.label === "1M")!;
    expect(oneMonth.annualised).toBe(false);
    expect(oneMonth.percent).toBeCloseTo(10, 6);
  });

  it("annualises windows beyond a year", () => {
    // 756 sessions (3y) doubling => ~26% annualised, not 100%.
    const closes = Array.from({ length: 800 }, (_, i) => 100 * Math.pow(2, i / 756));
    const threeYear = trailingReturns(daily(closes)).find((r) => r.label === "3Y")!;
    expect(threeYear.annualised).toBe(true);
    expect(threeYear.percent).toBeCloseTo(25.99, 0);
  });

  it("returns an empty list for an unusable series", () => {
    expect(trailingReturns([])).toEqual([]);
    expect(trailingReturns(daily([100]))).toEqual([]);
  });
});

describe("calendarYearReturns", () => {
  it("measures each year from the previous year's close", () => {
    // 2020 ends at 100; 2021 ends at 150 => 2021 is +50%.
    const history: PricePoint[] = [
      { date: "2020-12-30", close: 90 },
      { date: "2020-12-31", close: 100 },
      { date: "2021-01-04", close: 110 },
      { date: "2021-12-31", close: 150 },
    ];
    const byYear = calendarYearReturns(history);
    const y2021 = byYear.find((y) => y.year === 2021)!;
    expect(y2021.percent).toBeCloseTo(50, 6);
  });

  it("returns newest year first", () => {
    const history: PricePoint[] = [
      { date: "2020-01-01", close: 100 },
      { date: "2020-12-31", close: 110 },
      { date: "2021-06-01", close: 120 },
      { date: "2021-12-31", close: 130 },
      { date: "2022-06-01", close: 140 },
      { date: "2022-12-31", close: 150 },
    ];
    expect(calendarYearReturns(history).map((y) => y.year)).toEqual([2022, 2021, 2020]);
  });

  it("flags a partial year rather than hiding it", () => {
    // The current year is the one users most want, even half-finished.
    const history: PricePoint[] = [
      { date: "2025-01-02", close: 100 },
      { date: "2025-12-31", close: 120 },
      { date: "2026-01-02", close: 122 },
      { date: "2026-06-30", close: 140 },
    ];
    const y2026 = calendarYearReturns(history).find((y) => y.year === 2026)!;
    expect(y2026.complete).toBe(false);
    expect(y2026.percent).toBeGreaterThan(0);
  });

  it("skips a year with a single observation", () => {
    const history: PricePoint[] = [
      { date: "2024-12-31", close: 100 },
      { date: "2025-06-01", close: 120 },
      { date: "2025-12-31", close: 130 },
    ];
    expect(calendarYearReturns(history).some((y) => y.year === 2024)).toBe(false);
  });

  it("handles an empty series", () => {
    expect(calendarYearReturns([])).toEqual([]);
  });
});

describe("downsideRisk", () => {
  /** Alternating gains and losses of a fixed size. */
  function choppy(n: number, up = 0.02, down = -0.02): PricePoint[] {
    const closes = [100];
    for (let i = 1; i < n; i += 1) {
      closes.push(closes[i - 1] * (1 + (i % 2 === 0 ? up : down)));
    }
    return daily(closes);
  }

  it("reports VaR and expected shortfall as positive magnitudes", () => {
    const risk = downsideRisk(choppy(200))!;
    expect(risk.valueAtRisk95).toBeGreaterThan(0);
    expect(risk.expectedShortfall95).toBeGreaterThan(0);
  });

  it("makes expected shortfall at least as severe as VaR", () => {
    // Expected shortfall averages the tail *beyond* the VaR cutoff, so it can
    // never be milder. A violation here means the tail slice is misaligned.
    const risk = downsideRisk(choppy(300, 0.03, -0.05))!;
    expect(risk.expectedShortfall95).toBeGreaterThanOrEqual(risk.valueAtRisk95);
  });

  it("rises with the size of losses", () => {
    const mild = downsideRisk(choppy(200, 0.01, -0.01))!;
    const severe = downsideRisk(choppy(200, 0.01, -0.05))!;
    expect(severe.downsideDeviation).toBeGreaterThan(mild.downsideDeviation);
    expect(severe.valueAtRisk95).toBeGreaterThan(mild.valueAtRisk95);
  });

  it("ignores upside when measuring downside deviation", () => {
    // Two series with identical losses but very different gains must have the
    // same downside deviation — the whole point of the measure.
    const a = downsideRisk(choppy(200, 0.01, -0.02))!;
    const b = downsideRisk(choppy(200, 0.08, -0.02))!;
    expect(a.downsideDeviation).toBeCloseTo(b.downsideDeviation, 4);
  });

  it("returns null when there are no losing days to measure", () => {
    expect(downsideRisk(daily(Array.from({ length: 100 }, (_, i) => 100 + i)))).toBeNull();
  });

  it("returns null for a series too short for a stable 5th percentile", () => {
    expect(downsideRisk(choppy(20))).toBeNull();
  });
});

describe("volatilityRegime", () => {
  it("flags an elevated regime when recent moves outpace the baseline", () => {
    const closes = [100];
    for (let i = 1; i < 200; i += 1) closes.push(closes[i - 1] * (1 + (i % 2 ? 0.002 : -0.002)));
    for (let i = 0; i < 30; i += 1) closes.push(closes[closes.length - 1] * (1 + (i % 2 ? 0.06 : -0.06)));
    const regime = volatilityRegime(daily(closes))!;
    expect(regime.ratio).toBeGreaterThan(1.25);
    expect(regime.regime).toBe("elevated");
  });

  it("flags a calm regime when recent moves are unusually small", () => {
    const closes = [100];
    for (let i = 1; i < 200; i += 1) closes.push(closes[i - 1] * (1 + (i % 2 ? 0.05 : -0.05)));
    for (let i = 0; i < 30; i += 1) closes.push(closes[closes.length - 1] * (1 + (i % 2 ? 0.0005 : -0.0005)));
    const regime = volatilityRegime(daily(closes))!;
    expect(regime.regime).toBe("calm");
  });

  it("calls a steady series normal", () => {
    const closes = [100];
    for (let i = 1; i < 200; i += 1) closes.push(closes[i - 1] * (1 + (i % 2 ? 0.01 : -0.01)));
    expect(volatilityRegime(daily(closes))!.regime).toBe("normal");
  });

  it("returns null without enough history to have a baseline", () => {
    expect(volatilityRegime(daily([100, 101, 102]))).toBeNull();
  });
});
