/**
 * Regression tests for the third edge-case sweep: fiscal-quarter labels no
 * date parser understands, sentiment cues matched inside unrelated words, and
 * model output that ignores "return only JSON".
 *
 * All three shared the same shape as the earlier rounds — no error, no empty
 * result, just a confident wrong answer.
 */

import { describe, expect, it } from "vitest";

import { backfillQuarterlyFinancials, simpleSentiment } from "@/server/domain/derivations";
import { extractJson } from "@/server/ai/gemini";

const quarter = (period: string, revenue: number) => ({ period, revenue, profit: revenue / 10 });

describe("quarterly results labelled by fiscal quarter", () => {
  // "Q1 FY25" is not Date.parse-able. Every row scored 0, the sort became a
  // no-op, and slice(-5) took the tail of a newest-first list — keeping the
  // OLDEST five quarters and dropping the two most recent.
  const newestFirst = [
    quarter("Q3 FY25", 300),
    quarter("Q2 FY25", 250),
    quarter("Q1 FY25", 200),
    quarter("Q4 FY24", 150),
    quarter("Q3 FY24", 120),
    quarter("Q2 FY24", 110),
    quarter("Q1 FY24", 100),
  ];

  it("keeps the most recent five quarters, not the oldest five", () => {
    const financials: any = { quarterly: [...newestFirst] };
    backfillQuarterlyFinancials(financials);
    expect(financials.quarterly.map((row: any) => row.period)).toEqual([
      "Q3 FY24",
      "Q4 FY24",
      "Q1 FY25",
      "Q2 FY25",
      "Q3 FY25",
    ]);
  });

  it("orders them oldest-first, which is what the growth comparison expects", () => {
    // scoring.ts reads quarterly[len-1] against quarterly[len-5] for a
    // year-over-year comparison, so the newest must be last.
    const financials: any = { quarterly: [...newestFirst] };
    backfillQuarterlyFinancials(financials);
    const periods = financials.quarterly.map((row: any) => row.period);
    expect(periods[periods.length - 1]).toBe("Q3 FY25");
    expect(periods[0]).toBe("Q3 FY24");
  });

  it("places Q4 in the fiscal year it ends, not the one it starts", () => {
    // FY25 runs Apr 2024 - Mar 2025, so Q4 FY25 (Mar 2025) is newer than
    // Q1 FY25 (Jun 2024) — the quarter number is not a calendar quarter.
    const financials: any = {
      quarterly: [
        quarter("Q4 FY25", 400),
        quarter("Q1 FY25", 100),
        quarter("Q2 FY25", 200),
        quarter("Q3 FY25", 300),
      ],
    };
    backfillQuarterlyFinancials(financials);
    expect(financials.quarterly.map((row: any) => row.period)).toEqual([
      "Q1 FY25",
      "Q2 FY25",
      "Q3 FY25",
      "Q4 FY25",
    ]);
  });

  it("still handles ordinary month-year labels", () => {
    const financials: any = {
      quarterly: [
        quarter("Dec 2024", 300),
        quarter("Sep 2024", 250),
        quarter("Jun 2024", 200),
        quarter("Mar 2024", 150),
        quarter("Dec 2023", 120),
        quarter("Sep 2023", 110),
      ],
    };
    backfillQuarterlyFinancials(financials);
    const periods = financials.quarterly.map((row: any) => row.period);
    expect(periods).toHaveLength(5);
    expect(periods[periods.length - 1]).toBe("Dec 2024");
  });

  it("dates a range by where it ends", () => {
    const financials: any = {
      quarterly: [
        quarter("Apr 2024 to Jun 2024", 100),
        quarter("Jul 2024 to Sep 2024", 200),
      ],
    };
    backfillQuarterlyFinancials(financials);
    const periods = financials.quarterly.map((row: any) => row.period);
    expect(periods[periods.length - 1]).toBe("Jul 2024 to Sep 2024");
  });
});

describe("news sentiment cue matching", () => {
  it("does not read a profit out of 'unprofitable'", () => {
    // Scored 0.66 — positive — for an unambiguously bad headline, because the
    // substrings "profit" and "record" both matched. Neutral, not negative, is
    // the honest outcome: "unprofitable" is not itself a negative cue, so
    // there is nothing left to fire once the two false positives are gone.
    expect(simpleSentiment("Company posts unprofitable quarter, record low margins")).toBe(0.5);
  });

  it("does not read a profit out of 'nonprofit'", () => {
    expect(simpleSentiment("Nonprofit arm restructured")).toBe(0.5);
  });

  it("does not read a drop out of 'backdrop'", () => {
    expect(simpleSentiment("Steady quarter against a soft macro backdrop")).toBe(0.5);
  });

  it("does not read risk out of 'brisk' or strength out of 'Armstrong'", () => {
    expect(simpleSentiment("Brisk trading volumes")).toBe(0.5);
    expect(simpleSentiment("Armstrong Industries files results")).toBe(0.5);
  });

  it("does not treat 'record low' as the good kind of record", () => {
    expect(simpleSentiment("Margins hit a record low")).toBe(0.5);
    expect(simpleSentiment("Firm posts a record loss")).toBe(0.5);
    // "Record" on its own is still the good kind.
    expect(simpleSentiment("Firm posts a record profit")).toBeGreaterThan(0.5);
  });

  it("still scores genuine cues, including inflected forms", () => {
    expect(simpleSentiment("Q3 profit beats estimates on strong growth")).toBeGreaterThan(0.5);
    expect(simpleSentiment("Regulator probes the firm as revenue declines")).toBeLessThan(0.5);
    expect(simpleSentiment("Brokerage upgrades the stock")).toBeGreaterThan(0.5);
  });

  it("stays neutral on text with no cues at all", () => {
    expect(simpleSentiment("Board meeting scheduled for Tuesday")).toBe(0.5);
    expect(simpleSentiment("")).toBe(0.5);
  });
});

describe("extracting JSON from a model response", () => {
  it("reads a bare or fenced value", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("survives the preamble models add despite being told not to", () => {
    // Anchored fence-stripping left "Here is the analysis:" in place, JSON.parse
    // threw, and the feature silently fell back to its rule-based path.
    expect(extractJson('Here is the analysis:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Sure! {"a":1}')).toBe('{"a":1}');
  });

  it("survives trailing commentary", () => {
    expect(extractJson('{"a":1}\n\nHope this helps!')).toBe('{"a":1}');
  });

  it("reads a top-level array", () => {
    expect(extractJson('Results:\n[{"a":1},{"b":2}]')).toBe('[{"a":1},{"b":2}]');
  });

  it("keeps nested structure intact", () => {
    const nested = '{"a":{"b":[1,2,{"c":3}]},"d":"e"}';
    expect(extractJson(`Here you go:\n${nested}\nDone.`)).toBe(nested);
  });

  it("is not fooled by braces inside string values", () => {
    // A closing brace inside a string must not end the slice early, and a
    // brace in trailing prose must not extend it.
    const value = '{"note":"use {curly} braces","n":1}';
    expect(extractJson(`${value} — hope that helps {see docs}`)).toBe(value);
  });

  it("handles an escaped quote before a brace", () => {
    const value = '{"note":"a \\" then {","n":1}';
    expect(extractJson(value)).toBe(value);
  });

  it("returns null when there is no JSON to find", () => {
    expect(extractJson("I cannot help with that.")).toBeNull();
    expect(extractJson("")).toBeNull();
    // Unbalanced — a truncated response is not worth guessing at.
    expect(extractJson('{"a":1')).toBeNull();
  });
});
