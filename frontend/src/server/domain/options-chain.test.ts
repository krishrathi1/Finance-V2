import { describe, expect, it } from "vitest";
import { generateOptionChain } from "./options-chain";

describe("Options Chain & Greeks Engine", () => {
  it("generates 21 strikes ladder around spot with ATM identified", () => {
    const chain = generateOptionChain("NIFTY", 24200);

    expect(chain.symbol).toBe("NIFTY");
    expect(chain.underlyingPrice).toBe(24200);
    expect(chain.strikes).toHaveLength(21);

    const atmRow = chain.strikes.find((s) => s.isAtm);
    expect(atmRow).toBeDefined();
    expect(atmRow?.strikePrice).toBe(24200);
  });

  it("calculates positive Option Greeks within theoretical bounds", () => {
    const chain = generateOptionChain("RELIANCE", 2950);
    const atmRow = chain.strikes.find((s) => s.isAtm);

    expect(atmRow).toBeDefined();
    if (atmRow) {
      // Call delta for ATM should be ~0.50
      expect(atmRow.calls.delta).toBeGreaterThanOrEqual(0.4);
      expect(atmRow.calls.delta).toBeLessThanOrEqual(0.65);

      // Put delta for ATM should be ~-0.50
      expect(atmRow.puts.delta).toBeLessThanOrEqual(-0.35);
      expect(atmRow.puts.delta).toBeGreaterThanOrEqual(-0.65);

      // Gamma > 0, Vega > 0
      expect(atmRow.calls.gamma).toBeGreaterThan(0);
      expect(atmRow.calls.vega).toBeGreaterThan(0);
    }
  });

  it("computes Max Pain and PCR properly", () => {
    const chain = generateOptionChain("TATAMOTORS", 850);

    expect(chain.maxPainStrike).toBeGreaterThan(0);
    expect(chain.pcr).toBeGreaterThan(0);
    expect(["Extremely Bullish", "Bullish", "Neutral", "Bearish", "Extremely Bearish"]).toContain(
      chain.pcrSentiment
    );
  });

  it("handles edge cases: zero spot, extreme prices, and microcap", () => {
    // zero spot falls back to 2400
    const zeroSpotChain = generateOptionChain("UNKNOWN", 0);
    expect(zeroSpotChain.underlyingPrice).toBe(2400);

    // penny stock
    const pennyChain = generateOptionChain("PENNY", 5.5);
    expect(pennyChain.strikes.length).toBeGreaterThan(0);

    // high value stock (e.g. MRF 130,000)
    const mrfChain = generateOptionChain("MRF", 135000);
    expect(mrfChain.strikes.length).toBeGreaterThan(0);
  });
});
