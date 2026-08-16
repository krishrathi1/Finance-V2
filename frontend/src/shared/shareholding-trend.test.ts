import { describe, expect, it } from "vitest";

import { shareholdingTrend } from "@/shared/shareholding-trend";

const q = (quarter: string, promoters: number, fii = 0, dii = 0, publicHolding = 0) => ({
  quarter,
  promoters,
  fii,
  dii,
  public: publicHolding,
});

describe("shareholdingTrend", () => {
  it("measures the direction of each reported class", () => {
    const trend = shareholdingTrend([
      q("2025-06-30", 60, 10, 5, 25),
      q("2025-09-30", 59, 11, 5, 25),
      q("2025-12-31", 58, 12, 5, 25),
      q("2026-03-31", 57, 13, 5, 25),
      q("2026-06-30", 56, 14, 5, 25),
    ])!;
    const byKey = Object.fromEntries(trend.trends.map((t) => [t.key, t]));
    expect(byKey.promoters.direction).toBe("down");
    expect(byKey.promoters.changeFullPoints).toBeCloseTo(-4, 6);
    expect(byKey.fii.direction).toBe("up");
    expect(byKey.dii.direction).toBe("flat");
  });

  it("orders an unsorted series before measuring", () => {
    const ordered = shareholdingTrend([
      q("2026-06-30", 56),
      q("2025-06-30", 60),
      q("2025-12-31", 58),
    ])!;
    expect(ordered.latestQuarter).toBe("2026-06-30");
    expect(ordered.trends[0].latest).toBe(56);
    expect(ordered.trends[0].changeFullPoints).toBeCloseTo(-4, 6);
  });

  it("flags sustained promoter selling", () => {
    const trend = shareholdingTrend([
      q("2025-06-30", 60),
      q("2025-09-30", 59),
      q("2025-12-31", 58),
      q("2026-03-31", 57),
      q("2026-06-30", 55),
    ])!;
    expect(trend.flags[0]).toMatch(/cut their stake/i);
    expect(trend.flags[0]).toContain("55.00%");
  });

  it("flags promoters buying as well as selling", () => {
    const trend = shareholdingTrend([
      q("2025-06-30", 50),
      q("2025-09-30", 51),
      q("2025-12-31", 52),
      q("2026-03-31", 53),
      q("2026-06-30", 54),
    ])!;
    expect(trend.flags[0]).toMatch(/added/i);
  });

  it("stays quiet when nothing moved materially", () => {
    const trend = shareholdingTrend([
      q("2025-06-30", 50.0),
      q("2025-09-30", 50.1),
      q("2026-06-30", 50.2),
    ])!;
    expect(trend.flags).toEqual([]);
    expect(trend.trends[0].direction).toBe("flat");
  });
});

describe("shareholdingTrend — unreported classes", () => {
  // The real RELIANCE feed: FII is 0 for nineteen quarters, then 28.12, while
  // `public` drops by the same amount. That is the provider starting to break
  // FII out, not a 28-point raid.
  const relianceShaped = [
    ...Array.from({ length: 5 }, (_, index) =>
      q(`202${index}-03-31`, 50.1, 0, 0, 49.9)
    ),
    q("2026-06-30", 50.48, 28.12, 0, 21.4),
  ];

  it("does not report a change in reporting as a change in ownership", () => {
    const trend = shareholdingTrend(relianceShaped)!;
    const fii = trend.trends.find((t) => t.key === "fii");
    // Only one quarter reports FII, so there is nothing to compare it against.
    expect(fii).toBeUndefined();
    expect(trend.flags.join(" ")).not.toMatch(/foreign/i);
  });

  it("still measures the classes that are reported throughout", () => {
    const trend = shareholdingTrend(relianceShaped)!;
    const promoters = trend.trends.find((t) => t.key === "promoters")!;
    expect(promoters.quartersReported).toBe(6);
    expect(promoters.latest).toBeCloseTo(50.48, 6);
  });

  it("counts a year back through reported quarters, not raw ones", () => {
    // DII is missing from the middle, so four *reported* quarters back is
    // further than four rows back — otherwise a two-year move gets labelled 1Y.
    const trend = shareholdingTrend([
      q("2024-06-30", 50, 0, 10),
      q("2024-09-30", 50, 0, 11),
      q("2024-12-31", 50, 0, 0),
      q("2025-03-31", 50, 0, 0),
      q("2025-06-30", 50, 0, 12),
      q("2025-09-30", 50, 0, 13),
      q("2025-12-31", 50, 0, 14),
    ])!;
    const dii = trend.trends.find((t) => t.key === "dii")!;
    expect(dii.quartersReported).toBe(5);
    // Five reported quarters: 10, 11, 12, 13, 14. Four back from 14 is 10.
    expect(dii.changeOneYearPoints).toBeCloseTo(4, 6);
  });

  it("ignores impossible percentages", () => {
    const trend = shareholdingTrend([
      q("2025-06-30", 50),
      q("2026-06-30", 51),
      { quarter: "2026-09-30", promoters: 150 },
    ])!;
    // The 150% row is unusable, so the latest reported stake is 51.
    expect(trend.trends[0].latest).toBe(51);
  });

  it("returns null when there is nothing to compare", () => {
    expect(shareholdingTrend([])).toBeNull();
    expect(shareholdingTrend(null)).toBeNull();
    expect(shareholdingTrend([q("2026-06-30", 50)])).toBeNull();
    // Two quarters, but no class reported in either.
    expect(shareholdingTrend([q("2025-06-30", 0), q("2026-06-30", 0)])).toBeNull();
  });
});

describe("shareholdingTrend — a change in filing format", () => {
  // The real RELIANCE series: FII is unreported for nineteen quarters and
  // `public` carries it, then FII appears at 28.12% and public drops by the
  // same amount. Not one share changed hands.
  const reclassified = [
    { quarter: "2025-06-30", promoters: 50.11, fii: 0, dii: 0, public: 49.89 },
    { quarter: "2025-09-30", promoters: 50.07, fii: 0, dii: 0, public: 49.93 },
    { quarter: "2025-12-31", promoters: 50.01, fii: 0, dii: 0, public: 49.99 },
    { quarter: "2026-03-31", promoters: 50.0, fii: 0, dii: 0, public: 50.0 },
    { quarter: "2026-06-30", promoters: 50.48, fii: 28.12, dii: 0, public: 21.4 },
  ];

  it("does not report the public residual collapsing by 28 points", () => {
    const trend = shareholdingTrend(reclassified)!;
    const pub = trend.trends.find((t) => t.key === "public")!;
    expect(pub.comparable).toBe(false);
    expect(pub.changeFullPoints).toBeNull();
    expect(pub.changeOneYearPoints).toBeNull();
    expect(pub.direction).toBe("flat");
    // Its current stake is still worth showing.
    expect(pub.latest).toBeCloseTo(21.4, 6);
  });

  it("keeps comparing promoters, which are reported directly throughout", () => {
    const trend = shareholdingTrend(reclassified)!;
    const promoters = trend.trends.find((t) => t.key === "promoters")!;
    expect(promoters.comparable).toBe(true);
    expect(promoters.changeFullPoints).toBeCloseTo(0.37, 2);
  });

  it("raises no flag about public collapsing", () => {
    const trend = shareholdingTrend(reclassified)!;
    expect(trend.flags.join(" ")).not.toMatch(/public/i);
  });

  it("still compares public when the format never changed", () => {
    const stable = [
      { quarter: "2025-06-30", promoters: 60, fii: 10, dii: 5, public: 25 },
      { quarter: "2026-06-30", promoters: 56, fii: 12, dii: 5, public: 27 },
    ];
    const pub = shareholdingTrend(stable)!.trends.find((t) => t.key === "public")!;
    expect(pub.comparable).toBe(true);
    expect(pub.changeFullPoints).toBeCloseTo(2, 6);
  });
});
