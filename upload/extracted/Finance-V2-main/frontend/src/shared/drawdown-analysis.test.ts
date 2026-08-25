import { describe, expect, it } from "vitest";

import { drawdownAnalysis } from "@/shared/drawdown-analysis";

/** Daily series from 2020-01-01, one calendar day per close. */
function series(closes: number[]) {
  let day = Date.UTC(2020, 0, 1);
  return closes.map((close) => {
    const date = new Date(day).toISOString().slice(0, 10);
    day += 86_400_000;
    return { date, close };
  });
}

/** Straight line of `steps` closes from `from` to `to`, excluding `from`. */
function ramp(from: number, to: number, steps: number) {
  return Array.from({ length: steps }, (_, index) => from + ((to - from) * (index + 1)) / steps);
}

describe("drawdownAnalysis", () => {
  it("measures a single fall and its recovery", () => {
    // 100 -> 60 over 40 days, back to 100 over 60 more.
    const analysis = drawdownAnalysis(series([100, ...ramp(100, 60, 40), ...ramp(60, 100, 60)]))!;
    expect(analysis.spells).toHaveLength(1);

    const spell = analysis.spells[0];
    expect(spell.depthPercent).toBeCloseTo(-40, 6);
    expect(spell.recovered).toBe(true);
    expect(spell.recoveryDays).toBe(60);
    expect(spell.days).toBe(100);
    expect(analysis.currentlyUnderwater).toBe(false);
  });

  it("separates how deep a fall went from how long it lasted", () => {
    // A shallow-but-endless slump alongside a sharp-but-brief one. maxDrawdown
    // alone cannot tell these apart; that is the whole point of this module.
    const sharp = [...ramp(100, 70, 10), ...ramp(70, 100, 10)];
    const grinding = [...ramp(100, 88, 50), ...Array(300).fill(88), ...ramp(88, 101, 50)];
    const analysis = drawdownAnalysis(series([100, ...sharp, ...grinding]))!;

    expect(analysis.deepestSpell!.depthPercent).toBeCloseTo(-30, 0);
    expect(analysis.longestUnderwaterSpell!.days).toBeGreaterThan(300);
    // The deepest and the longest are different spells.
    expect(analysis.deepestSpell!.peakDate).not.toBe(analysis.longestUnderwaterSpell!.peakDate);
  });

  it("reports a position that never recovered as still underwater", () => {
    const analysis = drawdownAnalysis(series([100, ...ramp(100, 50, 50), ...Array(200).fill(50)]))!;
    expect(analysis.currentlyUnderwater).toBe(true);
    expect(analysis.currentDepthPercent).toBeCloseTo(-50, 6);
    expect(analysis.currentUnderwaterDays).toBeGreaterThan(240);
    expect(analysis.spells[0].recovered).toBe(false);
    expect(analysis.spells[0].recoveryDays).toBeNull();
  });

  it("counts the share of the period spent below a previous high", () => {
    // 100 flat for 100 days, one 20% dip lasting 100 days, then flat again.
    const analysis = drawdownAnalysis(
      series([
        ...Array(100).fill(100),
        ...ramp(100, 80, 50),
        ...ramp(80, 100, 50),
        ...Array(100).fill(100),
      ])
    )!;
    expect(analysis.timeUnderwaterPercent).toBeGreaterThan(30);
    expect(analysis.timeUnderwaterPercent).toBeLessThan(45);
  });

  it("never reports more time underwater than the period contains", () => {
    const choppy = Array.from({ length: 500 }, (_, index) => 100 + 25 * Math.sin(index / 7));
    const analysis = drawdownAnalysis(series(choppy))!;
    expect(analysis.timeUnderwaterPercent).toBeGreaterThan(0);
    expect(analysis.timeUnderwaterPercent).toBeLessThanOrEqual(100);
  });

  it("ignores dips too shallow to be a drawdown", () => {
    // Without a depth floor, every one-tick wobble is a "drawdown" and the
    // time-underwater figure approaches 100% for every stock alive.
    const noisy = Array.from({ length: 300 }, (_, index) => 100 + index * 0.1 - (index % 3) * 0.2);
    expect(drawdownAnalysis(noisy.length ? series(noisy) : [])).toBeNull();
  });

  it("counts a dip that clears the floor once the floor is lowered", () => {
    const shallow = series([100, ...ramp(100, 93, 20), ...ramp(93, 100, 20)]);
    expect(drawdownAnalysis(shallow, 10)).toBeNull();
    expect(drawdownAnalysis(shallow, 5)!.spells).toHaveLength(1);
  });

  it("takes the median recovery across spells that recovered", () => {
    const dip = (depth: number, down: number, up: number) => [
      ...ramp(100, depth, down),
      ...ramp(depth, 100, up),
    ];
    const analysis = drawdownAnalysis(
      series([100, ...dip(80, 10, 20), ...dip(80, 10, 40), ...dip(80, 10, 60)])
    )!;
    expect(analysis.spells).toHaveLength(3);
    expect(analysis.medianRecoveryDays).toBe(40);
  });

  it("returns null when nothing ever fell", () => {
    expect(drawdownAnalysis(series([100, 101, 102, 103]))).toBeNull();
    expect(drawdownAnalysis(series(Array(50).fill(100)))).toBeNull();
  });

  it("returns null for input it cannot measure", () => {
    expect(drawdownAnalysis([])).toBeNull();
    expect(drawdownAnalysis(null)).toBeNull();
    expect(drawdownAnalysis(series([100]))).toBeNull();
  });

  it("skips unusable rows and duplicate dates", () => {
    const base = series([100, ...ramp(100, 60, 40), ...ramp(60, 100, 60)]);
    const dirty = [
      ...base,
      { date: base[5].date, close: 999 },
      { date: "2021-01-01", close: 0 },
      { date: "2021-01-02", close: -10 },
      { date: "bad-date", close: 100 },
    ];
    const analysis = drawdownAnalysis(dirty)!;
    // The duplicate 999 must not become a new peak the stock never reached.
    expect(analysis.spells[0].peakPrice).toBe(100);
    expect(analysis.spells[0].depthPercent).toBeCloseTo(-40, 6);
  });

  it("orders spells deepest first", () => {
    const analysis = drawdownAnalysis(
      series([
        100,
        ...ramp(100, 90, 10),
        ...ramp(90, 100, 10),
        ...ramp(100, 60, 20),
        ...ramp(60, 100, 20),
      ])
    )!;
    const depths = analysis.spells.map((spell) => spell.depthPercent);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });
});
