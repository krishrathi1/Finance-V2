/**
 * Regression tests for symbol normalisation.
 *
 * Every symbol a user can supply — typed into search, pasted from
 * TradingView, imported from a broker CSV, or stored in an old holding —
 * passes through here before it can be matched to a listed security. A
 * symbol that fails to normalise resolves to nothing, and the visible
 * symptom is not an error but a holding that silently never gets a price.
 */

import { describe, expect, it } from "vitest";

import { normalizeSymbol } from "@/lib/market/indian-market";

describe("exchange prefixes", () => {
  it("strips a colon-separated prefix", () => {
    // normalizeKey replaces ':' with a space before the old prefix regex ever
    // ran, so "NSE:TCS" came out as "NSETCS" and matched no listed security.
    // This is the format TradingView copies to the clipboard.
    expect(normalizeSymbol("NSE:TCS")).toBe("TCS");
    expect(normalizeSymbol("BSE:RELIANCE")).toBe("RELIANCE");
  });

  it("strips a dot-separated prefix", () => {
    expect(normalizeSymbol("NSE.TCS")).toBe("TCS");
    expect(normalizeSymbol("BSE.RELIANCE")).toBe("RELIANCE");
  });

  it("is case-insensitive about the prefix", () => {
    expect(normalizeSymbol("nse:infy")).toBe("INFY");
    expect(normalizeSymbol("Bse:Tcs")).toBe("TCS");
  });

  it("tolerates space around the separator", () => {
    expect(normalizeSymbol("NSE : TCS")).toBe("TCS");
    expect(normalizeSymbol("NSE: TCS")).toBe("TCS");
  });

  it("does not eat a real symbol that merely starts with an exchange name", () => {
    // NSEIT is a genuine NSE listing. Requiring a separator is what keeps an
    // over-eager prefix strip from turning it into "IT".
    expect(normalizeSymbol("NSEIT")).toBe("NSEIT");
    expect(normalizeSymbol("BSELTD")).toBe("BSELTD");
  });
});

describe("exchange suffixes", () => {
  it("strips the Yahoo-style suffix", () => {
    expect(normalizeSymbol("TCS.NS")).toBe("TCS");
    expect(normalizeSymbol("RELIANCE.BO")).toBe("RELIANCE");
  });

  it("is case-insensitive about the suffix", () => {
    expect(normalizeSymbol("tcs.ns")).toBe("TCS");
  });

  it("handles a prefix and a suffix together", () => {
    expect(normalizeSymbol("NSE:TCS.NS")).toBe("TCS");
  });
});

describe("ordinary symbols", () => {
  it("upper-cases and trims", () => {
    expect(normalizeSymbol("  tcs  ")).toBe("TCS");
    expect(normalizeSymbol("infy")).toBe("INFY");
  });

  it("keeps the characters real NSE symbols use", () => {
    // Ampersands and hyphens are load-bearing: M&M and BAJAJ-AUTO are both
    // listed exactly that way.
    expect(normalizeSymbol("M&M")).toBe("M&M");
    expect(normalizeSymbol("BAJAJ-AUTO")).toBe("BAJAJ-AUTO");
  });

  it("decodes an HTML-escaped ampersand", () => {
    // Provider feeds and scraped pages hand these over still escaped.
    expect(normalizeSymbol("M&amp;M")).toBe("M&M");
  });

  it("returns an empty string for nothing usable", () => {
    expect(normalizeSymbol("")).toBe("");
    expect(normalizeSymbol("   ")).toBe("");
    expect(normalizeSymbol(null as unknown as string)).toBe("");
    expect(normalizeSymbol(undefined as unknown as string)).toBe("");
  });

  it("is idempotent — normalising twice changes nothing", () => {
    for (const input of ["NSE:TCS", "TCS.NS", "  m&m  ", "BAJAJ-AUTO"]) {
      const once = normalizeSymbol(input);
      expect(normalizeSymbol(once)).toBe(once);
    }
  });
});
