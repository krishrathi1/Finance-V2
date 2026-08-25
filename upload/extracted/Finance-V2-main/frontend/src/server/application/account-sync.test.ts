import { describe, expect, it } from "vitest";

import {
  MAX_DECIMAL_VALUE,
  cleanClientId,
  cleanSymbol,
  cleanText,
  decimalToNumber,
  parseCondition,
  parseIsoDate,
  parseOptionalPositiveNumber,
  parsePositiveNumber,
} from "./account-sync";

describe("cleanSymbol", () => {
  it("trims, upper-cases and truncates to the column width", () => {
    expect(cleanSymbol("  tcs  ")).toBe("TCS");
    expect(cleanSymbol("A".repeat(50))).toHaveLength(20);
  });

  it("returns an empty string for unusable input", () => {
    expect(cleanSymbol(undefined)).toBe("");
    expect(cleanSymbol(null)).toBe("");
    expect(cleanSymbol("   ")).toBe("");
  });
});

describe("cleanClientId", () => {
  it("preserves case — client ids are opaque keys, not symbols", () => {
    expect(cleanClientId("TCS_1700000000000_ab12")).toBe("TCS_1700000000000_ab12");
  });

  it("truncates to the column width", () => {
    expect(cleanClientId("x".repeat(200))).toHaveLength(64);
  });
});

describe("cleanText", () => {
  it("returns null for blank or non-string input, so the column stores NULL", () => {
    // "" would be indistinguishable from a real empty note downstream and
    // defeats COALESCE-based merge logic.
    expect(cleanText("   ", 100)).toBeNull();
    expect(cleanText(undefined, 100)).toBeNull();
    expect(cleanText(42, 100)).toBeNull();
  });

  it("trims and truncates", () => {
    expect(cleanText("  hold long  ", 100)).toBe("hold long");
    expect(cleanText("y".repeat(600), 500)).toHaveLength(500);
  });
});

describe("parsePositiveNumber", () => {
  it("accepts numbers and numeric strings", () => {
    expect(parsePositiveNumber(10)).toBe(10);
    expect(parsePositiveNumber("2450.75")).toBe(2450.75);
  });

  it("keeps fractional quantities the UI allows", () => {
    // The add/edit form uses step="0.001"; rounding these away corrupts
    // invested value and P&L.
    expect(parsePositiveNumber(0.125)).toBe(0.125);
    expect(parsePositiveNumber("0.001")).toBe(0.001);
  });

  it("rounds to the DECIMAL(18,4) scale so reads match writes", () => {
    expect(parsePositiveNumber(1.23456789)).toBe(1.2346);
  });

  it("rejects values a positive money column can't hold", () => {
    expect(parsePositiveNumber(0)).toBeNull();
    expect(parsePositiveNumber(-5)).toBeNull();
    expect(parsePositiveNumber(Number.NaN)).toBeNull();
    expect(parsePositiveNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parsePositiveNumber("not a number")).toBeNull();
    expect(parsePositiveNumber(null)).toBeNull();
    expect(parsePositiveNumber({})).toBeNull();
    expect(parsePositiveNumber([])).toBeNull();
  });

  it("rejects values that would overflow DECIMAL(18,4)", () => {
    // Would otherwise fail at INSERT time as a 500 instead of a clean 400.
    expect(parsePositiveNumber(MAX_DECIMAL_VALUE)).toBeNull();
    expect(parsePositiveNumber(MAX_DECIMAL_VALUE * 10)).toBeNull();
    expect(parsePositiveNumber(MAX_DECIMAL_VALUE - 1)).toBe(MAX_DECIMAL_VALUE - 1);
  });
});

describe("parseOptionalPositiveNumber", () => {
  it("treats absent and blank as null rather than invalid", () => {
    expect(parseOptionalPositiveNumber(undefined)).toBeNull();
    expect(parseOptionalPositiveNumber(null)).toBeNull();
    expect(parseOptionalPositiveNumber("")).toBeNull();
  });

  it("still rejects a present but nonsensical value", () => {
    expect(parseOptionalPositiveNumber(-1)).toBeNull();
    expect(parseOptionalPositiveNumber("abc")).toBeNull();
  });

  it("accepts a real value", () => {
    expect(parseOptionalPositiveNumber("3000")).toBe(3000);
  });
});

describe("parseCondition", () => {
  it("recognises 'below' regardless of casing or padding", () => {
    expect(parseCondition("below")).toBe("below");
    expect(parseCondition(" BELOW ")).toBe("below");
  });

  it("defaults anything else to 'above'", () => {
    expect(parseCondition("above")).toBe("above");
    expect(parseCondition("sideways")).toBe("above");
    expect(parseCondition(undefined)).toBe("above");
    expect(parseCondition(null)).toBe("above");
  });
});

describe("parseIsoDate", () => {
  it("accepts a well-formed calendar date", () => {
    expect(parseIsoDate("2026-08-09")).toBe("2026-08-09");
    expect(parseIsoDate("  2026-08-09  ")).toBe("2026-08-09");
  });

  it("rejects a date that doesn't exist", () => {
    // MySQL would otherwise roll this forward and store a different day than
    // the user picked.
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(parseIsoDate("2024-02-29")).toBe("2024-02-29");
    expect(parseIsoDate("2026-02-29")).toBeNull();
  });

  it("rejects other formats and non-strings", () => {
    expect(parseIsoDate("09/08/2026")).toBeNull();
    expect(parseIsoDate("2026-8-9")).toBeNull();
    expect(parseIsoDate(new Date().toISOString())).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate(20260809)).toBeNull();
  });
});

describe("decimalToNumber", () => {
  it("converts the strings mysql2 returns for DECIMAL columns", () => {
    expect(decimalToNumber("2450.7500")).toBe(2450.75);
    expect(decimalToNumber(10)).toBe(10);
  });

  it("keeps NULL as null instead of collapsing it to zero", () => {
    // Number(null) is 0, which would turn "no target price" into a ₹0 target.
    expect(decimalToNumber(null)).toBeNull();
    expect(decimalToNumber(undefined)).toBeNull();
  });

  it("returns null for unparseable values", () => {
    expect(decimalToNumber("not a number")).toBeNull();
  });

  it("preserves a genuine zero", () => {
    expect(decimalToNumber("0.0000")).toBe(0);
  });
});
