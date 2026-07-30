import { describe, it, expect } from "vitest";
import { normalizeHistory, returnsSummary, simpleSentiment } from "@/server/domain/derivations";
import type { Candle } from "@/shared/contracts";

function candle(date: string, close: number, overrides: Partial<Candle> = {}): Candle {
  return { date, open: close, high: close, low: close, close, volume: 100, ...overrides };
}

describe("normalizeHistory", () => {
  it("sorts candles ascending by date", () => {
    const out = normalizeHistory([candle("2024-01-03", 30), candle("2024-01-01", 10), candle("2024-01-02", 20)]);
    expect(out.map((r) => r.date)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("drops rows with an unparseable date or a null close", () => {
    const out = normalizeHistory([
      candle("not-a-date", 10),
      { date: "2024-01-05", open: 1, high: 1, low: 1, close: NaN as unknown as number, volume: 0 },
      candle("2024-01-06", 15),
    ]);
    expect(out.map((r) => r.date)).toEqual(["2024-01-06"]);
  });

  it("keeps the FIRST candle when a date has duplicates, dropping later ones", () => {
    const out = normalizeHistory([
      candle("2024-01-01", 100, { volume: 111 }),
      candle("2024-01-01", 200, { volume: 222 }),
      candle("2024-01-01", 300, { volume: 333 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(100);
    expect(out[0].volume).toBe(111);
  });

  it("falls back missing open/high/low/volume to close/0", () => {
    const out = normalizeHistory([
      { date: "2024-01-01", open: 0, high: 0, low: 0, close: 42, volume: 0 },
    ]);
    expect(out[0]).toMatchObject({ open: 42, high: 42, low: 42, close: 42, volume: 0 });
  });

  it("returns [] for non-array input", () => {
    expect(normalizeHistory(undefined as unknown as Candle[])).toEqual([]);
    expect(normalizeHistory(null as unknown as Candle[])).toEqual([]);
  });
});

describe("returnsSummary", () => {
  it("returns [] when there are fewer than 5 closes", () => {
    const history = [candle("2024-01-01", 100), candle("2024-01-02", 110)];
    expect(returnsSummary(history)).toEqual([]);
  });

  it("returns null for horizons longer than the available history", () => {
    const history = Array.from({ length: 10 }, (_, i) => candle(`2024-01-${String(i + 1).padStart(2, "0")}`, 100 + i * 10));
    const summary = returnsSummary(history);
    const oneMonth = summary.find((s) => s.label === "1 Month");
    expect(oneMonth?.value).toBeNull();
  });

  it("computes a simple pct-change return over the available window", () => {
    const history = Array.from({ length: 10 }, (_, i) => candle(`2024-01-${String(i + 1).padStart(2, "0")}`, 100 + i * 10));
    const summary = returnsSummary(history);
    // closes = [100,110,...,190]; 1-week = pct(5): idx = 10-5-1 = 4 -> closes[4]=140, current=190.
    const oneWeek = summary.find((s) => s.label === "1 Week");
    expect(oneWeek?.value).toBeCloseTo(((190 - 140) / 140) * 100, 2);
  });

  it("returns [] for empty history", () => {
    expect(returnsSummary([])).toEqual([]);
  });
});

describe("simpleSentiment", () => {
  it("scores clearly positive text above neutral", () => {
    expect(simpleSentiment("Company reports record profit and strong growth")).toBeGreaterThan(0.5);
  });

  it("scores clearly negative text below neutral", () => {
    expect(simpleSentiment("Company faces fraud probe and steep decline in revenue")).toBeLessThan(0.5);
  });

  it("stays within [0, 1] for empty input", () => {
    const score = simpleSentiment("");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
