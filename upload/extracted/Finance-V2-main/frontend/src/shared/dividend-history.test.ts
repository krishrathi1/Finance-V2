import { describe, expect, it } from "vitest";

import { dividendTrackRecord, toIsoDate } from "@/shared/dividend-history";

const payout = (exDate: string, dividendAmount: number) => ({ exDate, dividendAmount, type: "Dividend" });

/** The real RELIANCE feed, newest first. */
const RELIANCE = [
  payout("05-Jun-2026", 6),
  payout("14-Aug-2025", 5.5),
  payout("19-Aug-2024", 10),
  payout("21-Aug-2023", 9),
  payout("18-Aug-2022", 8),
  payout("11-Jun-2021", 7),
];

describe("toIsoDate", () => {
  it("reads the corporate-actions date format", () => {
    expect(toIsoDate("05-Jun-2026")).toBe("2026-06-05");
    expect(toIsoDate("5-Jun-2026")).toBe("2026-06-05");
  });

  it("passes ISO through", () => {
    expect(toIsoDate("2026-06-05")).toBe("2026-06-05");
    expect(toIsoDate("2026-06-05T10:00:00Z")).toBe("2026-06-05");
  });

  it("rejects what it cannot read", () => {
    expect(toIsoDate("05-Xyz-2026")).toBeNull();
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });
});

describe("dividendTrackRecord", () => {
  it("groups payouts by financial year, newest first", () => {
    const record = dividendTrackRecord(RELIANCE, 1310, "2026-08-16")!;
    expect(record.years[0].financialYear).toBe("2026-27");
    expect(record.years[0].total).toBe(6);
    expect(record.yearsPaid).toBe(6);
  });

  it("puts an interim and a final in the same financial year", () => {
    // June and the following February are one financial year; calendar
    // grouping would split them across two.
    const record = dividendTrackRecord(
      [payout("10-Jun-2025", 4), payout("12-Feb-2026", 3)],
      100,
      "2026-08-16"
    )!;
    expect(record.years).toHaveLength(1);
    expect(record.years[0].financialYear).toBe("2025-26");
    expect(record.years[0].total).toBe(7);
    expect(record.years[0].payouts).toBe(2);
  });

  it("counts an unbroken run of paying years", () => {
    expect(dividendTrackRecord(RELIANCE, 1310, "2026-08-16")!.consecutiveYears).toBe(6);
  });

  it("breaks the streak on a missed year", () => {
    // 2023-24 has no payout, so the run ending at the newest year is just two.
    const record = dividendTrackRecord(
      [
        payout("10-Jun-2026", 5),
        payout("10-Jun-2025", 5),
        payout("10-Jun-2023", 5),
        payout("10-Jun-2022", 5),
      ],
      100,
      "2026-08-16"
    )!;
    expect(record.yearsPaid).toBe(4);
    expect(record.consecutiveYears).toBe(2);
  });

  it("yields on the last twelve months, not the whole history", () => {
    const record = dividendTrackRecord(RELIANCE, 1310, "2026-08-16")!;
    // Only the 05-Jun-2026 payout of ₹6 falls inside the year to 16-Aug-2026.
    expect(record.trailingTwelveMonths).toBe(6);
    expect(record.yieldPercent).toBeCloseTo((6 / 1310) * 100, 6);
  });

  it("reports no yield without a usable price", () => {
    expect(dividendTrackRecord(RELIANCE, null, "2026-08-16")!.yieldPercent).toBeNull();
    expect(dividendTrackRecord(RELIANCE, 0, "2026-08-16")!.yieldPercent).toBeNull();
  });

  it("measures growth across complete years only", () => {
    // 2026-27 is still open — including its part-year ₹6 against a full ₹10
    // would report a collapse that has not happened.
    const record = dividendTrackRecord(RELIANCE, 1310, "2026-08-16")!;
    // Complete years run 2025-26 (5.5) back to 2021-22 (7), a four-year span.
    const expected = (Math.pow(5.5 / 7, 1 / 4) - 1) * 100;
    expect(record.growthCagrPercent).toBeCloseTo(expected, 6);
  });

  it("classifies the direction of travel", () => {
    const rising = dividendTrackRecord(
      [payout("10-Jun-2025", 10), payout("10-Jun-2022", 5)],
      100,
      "2026-08-16"
    )!;
    expect(rising.direction).toBe("rising");

    const falling = dividendTrackRecord(
      [payout("10-Jun-2025", 5), payout("10-Jun-2022", 10)],
      100,
      "2026-08-16"
    )!;
    expect(falling.direction).toBe("falling");

    const steady = dividendTrackRecord(
      [payout("10-Jun-2025", 10), payout("10-Jun-2022", 10)],
      100,
      "2026-08-16"
    )!;
    expect(steady.direction).toBe("steady");
  });

  it("names the best and leanest complete years", () => {
    const record = dividendTrackRecord(RELIANCE, 1310, "2026-08-16")!;
    expect(record.bestYear?.total).toBe(10);
    expect(record.leanestYear?.total).toBe(5.5);
  });

  it("reports the most recent payout", () => {
    const record = dividendTrackRecord(RELIANCE, 1310, "2026-08-16")!;
    expect(record.latestPayout).toEqual({ date: "2026-06-05", amount: 6 });
  });

  it("prefers the ex-date over the generic date column", () => {
    // `date` is sometimes the announcement; entitlement follows the ex-date.
    const record = dividendTrackRecord(
      [{ date: "22-Apr-2024", exDate: "19-Aug-2024", dividendAmount: 10 }],
      100,
      "2026-08-16"
    )!;
    expect(record.latestPayout?.date).toBe("2024-08-19");
  });

  it("falls back to the date column when there is no ex-date", () => {
    const record = dividendTrackRecord(
      [{ date: "19-Aug-2024", dividendAmount: 10 }],
      100,
      "2026-08-16"
    )!;
    expect(record.latestPayout?.date).toBe("2024-08-19");
  });

  it("skips rows with no usable amount or date", () => {
    const record = dividendTrackRecord(
      [
        payout("10-Jun-2025", 5),
        payout("10-Jun-2024", 4),
        { exDate: "10-Jun-2023", dividendAmount: 0 },
        { exDate: "10-Jun-2022", dividendAmount: null },
        { exDate: "bad-date", dividendAmount: 9 },
      ],
      100,
      "2026-08-16"
    )!;
    expect(record.yearsPaid).toBe(2);
  });

  it("returns null for a company that has never paid", () => {
    expect(dividendTrackRecord([], 100, "2026-08-16")).toBeNull();
    expect(dividendTrackRecord(null, 100, "2026-08-16")).toBeNull();
    expect(
      dividendTrackRecord([{ exDate: "10-Jun-2025", dividendAmount: 0 }], 100, "2026-08-16")
    ).toBeNull();
  });
});
