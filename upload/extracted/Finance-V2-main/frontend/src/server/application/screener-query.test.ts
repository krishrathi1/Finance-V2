import { describe, it, expect } from "vitest";

import { parseScreenerQuery, matchesQuery } from "@/server/application/screener-query";

describe("parseScreenerQuery", () => {
  it("parses a single comparison", () => {
    const { clauses, unparsed } = parseScreenerQuery("pe < 20");
    expect(unparsed).toEqual([]);
    expect(clauses).toEqual([{ field: "pe", operator: "<", value: 20 }]);
  });

  it("parses a conjunction across aliases and spacing", () => {
    const { clauses, unparsed } = parseScreenerQuery("market cap > 50000 AND dividend yield >= 1.5");
    expect(unparsed).toEqual([]);
    expect(clauses).toEqual([
      { field: "marketCap", operator: ">", value: 50000 },
      { field: "dividendYield", operator: ">=", value: 1.5 },
    ]);
  });

  it("reads >= as one operator rather than >", () => {
    expect(parseScreenerQuery("roe >= 15").clauses).toEqual([{ field: "roe", operator: ">=", value: 15 }]);
  });

  it("understands crore, lakh and k shorthand", () => {
    expect(parseScreenerQuery("market cap > 2cr").clauses[0].value).toBe(2);
    expect(parseScreenerQuery("market cap > 500 lakh").clauses[0].value).toBe(5);
    expect(parseScreenerQuery("volume > 100k").clauses[0].value).toBe(100_000);
  });

  it("strips thousands separators", () => {
    expect(parseScreenerQuery("market cap > 1,50,000").clauses[0].value).toBe(150000);
  });

  it("reports unrecognised fragments instead of dropping them silently", () => {
    const { clauses, unparsed } = parseScreenerQuery("pe < 20 and moat is wide");
    expect(clauses).toHaveLength(1);
    expect(unparsed).toEqual(["moat is wide"]);
  });

  it("treats an unknown field as unparsed", () => {
    expect(parseScreenerQuery("promoter pledge < 5").unparsed).toEqual(["promoter pledge < 5"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseScreenerQuery("   ")).toEqual({ clauses: [], unparsed: [] });
  });
});

describe("matchesQuery", () => {
  const row = { pe: 15, marketCap: 90000, dividendYield: 2, roe: null };

  it("passes a row satisfying every clause", () => {
    expect(matchesQuery(row, parseScreenerQuery("pe < 20 and market cap > 50000").clauses)).toBe(true);
  });

  it("fails a row breaching any clause", () => {
    expect(matchesQuery(row, parseScreenerQuery("pe < 20 and market cap > 100000").clauses)).toBe(false);
  });

  it("excludes rows whose filtered metric is null rather than treating it as a pass", () => {
    expect(matchesQuery(row, parseScreenerQuery("roe > 10").clauses)).toBe(false);
  });

  it("matches everything when there are no clauses", () => {
    expect(matchesQuery(row, [])).toBe(true);
  });
});
