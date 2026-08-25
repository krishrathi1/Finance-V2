import { describe, expect, it } from "vitest";

import {
  LONG_TERM_HOLDING_DAYS,
  daysBetween,
  matchFifo,
  portfolioCashFlows,
  xirr,
  type Transaction,
} from "./portfolio-returns";

function txn(overrides: Partial<Transaction> & Pick<Transaction, "side" | "quantity" | "price" | "tradedOn">): Transaction {
  return {
    id: `${overrides.side}-${overrides.tradedOn}-${overrides.price}`,
    symbol: "TCS",
    fees: 0,
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("is negative when the range runs backwards", () => {
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
  });

  it("crosses a DST-shifting month without drifting", () => {
    // Parsed as UTC precisely so a local-timezone DST jump can't turn 31 days
    // into 30.96 and round wrong.
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("returns 0 for unparseable dates rather than NaN", () => {
    expect(daysBetween("not-a-date", "2026-01-01")).toBe(0);
  });
});

describe("matchFifo", () => {
  it("matches a simple buy then sell", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "sell", quantity: 10, price: 150, tradedOn: "2026-02-01" }),
    ]);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].realisedPnl).toBe(500);
    expect(result.lots[0].realisedPnlPercent).toBe(50);
    expect(result.totalRealisedPnl).toBe(500);
  });

  it("consumes the oldest lot first", () => {
    // The whole point of FIFO: the ₹100 lot must be matched, not the ₹200 one.
    const result = matchFifo([
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "buy", quantity: 10, price: 200, tradedOn: "2026-02-01" }),
      txn({ side: "sell", quantity: 10, price: 300, tradedOn: "2026-03-01" }),
    ]);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].buyPrice).toBe(100);
    expect(result.lots[0].realisedPnl).toBe(2000);
  });

  it("splits one sale across several buy lots", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "buy", quantity: 10, price: 200, tradedOn: "2026-02-01" }),
      txn({ side: "sell", quantity: 15, price: 300, tradedOn: "2026-03-01" }),
    ]);

    expect(result.lots).toHaveLength(2);
    // 10 @ 100 -> 2000, then 5 @ 200 -> 500
    expect(result.totalRealisedPnl).toBe(2500);
    expect(result.lots.map((lot) => lot.quantity).sort((a, b) => a - b)).toEqual([5, 10]);
  });

  it("leaves an unsold remainder open", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "sell", quantity: 4, price: 150, tradedOn: "2026-02-01" }),
    ]);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].quantity).toBe(4);
    expect(result.totalRealisedPnl).toBe(200);
    expect(result.unmatchedSellQuantity).toBe(0);
  });

  it("reports a sale with nothing to match against instead of hiding it", () => {
    const result = matchFifo([
      txn({ side: "sell", quantity: 5, price: 150, tradedOn: "2026-02-01" }),
    ]);

    expect(result.lots).toHaveLength(0);
    expect(result.unmatchedSellQuantity).toBe(5);
  });

  it("reports the leftover when a sale only partly matches", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: 3, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "sell", quantity: 10, price: 150, tradedOn: "2026-02-01" }),
    ]);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].quantity).toBe(3);
    expect(result.unmatchedSellQuantity).toBe(7);
  });

  it("keeps symbols independent", () => {
    // A sale of INFY must never consume a TCS lot.
    const result = matchFifo([
      txn({ symbol: "TCS", side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ symbol: "INFY", side: "sell", quantity: 10, price: 150, tradedOn: "2026-02-01" }),
    ]);

    expect(result.lots).toHaveLength(0);
    expect(result.unmatchedSellQuantity).toBe(10);
  });

  it("matches symbols case-insensitively", () => {
    const result = matchFifo([
      txn({ symbol: "tcs", side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ symbol: "TCS", side: "sell", quantity: 10, price: 150, tradedOn: "2026-02-01" }),
    ]);
    expect(result.lots).toHaveLength(1);
  });

  it("orders by trade date, not array order", () => {
    // Ledger rows arrive in insertion order, which need not be trade order.
    const result = matchFifo([
      txn({ side: "sell", quantity: 10, price: 300, tradedOn: "2026-03-01" }),
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
    ]);

    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].realisedPnl).toBe(2000);
  });

  describe("holding-period classification", () => {
    it("treats a sale inside 12 months as short-term", () => {
      const result = matchFifo([
        txn({ side: "buy", quantity: 1, price: 100, tradedOn: "2026-01-01" }),
        txn({ side: "sell", quantity: 1, price: 200, tradedOn: "2026-06-01" }),
      ]);
      expect(result.lots[0].term).toBe("short");
      expect(result.shortTermPnl).toBe(100);
      expect(result.longTermPnl).toBe(0);
    });

    it("treats exactly 365 days as short-term — long-term needs more than 12 months", () => {
      const result = matchFifo([
        txn({ side: "buy", quantity: 1, price: 100, tradedOn: "2025-01-01" }),
        txn({ side: "sell", quantity: 1, price: 200, tradedOn: "2026-01-01" }),
      ]);
      expect(result.lots[0].holdingDays).toBe(LONG_TERM_HOLDING_DAYS);
      expect(result.lots[0].term).toBe("short");
    });

    it("treats a day past the threshold as long-term", () => {
      const result = matchFifo([
        txn({ side: "buy", quantity: 1, price: 100, tradedOn: "2025-01-01" }),
        txn({ side: "sell", quantity: 1, price: 200, tradedOn: "2026-01-02" }),
      ]);
      expect(result.lots[0].term).toBe("long");
      expect(result.longTermPnl).toBe(100);
      expect(result.shortTermPnl).toBe(0);
    });
  });

  describe("fees", () => {
    it("adds the buy fee to cost and subtracts the sell fee from proceeds", () => {
      const result = matchFifo([
        txn({ side: "buy", quantity: 10, price: 100, fees: 50, tradedOn: "2026-01-01" }),
        txn({ side: "sell", quantity: 10, price: 150, fees: 70, tradedOn: "2026-02-01" }),
      ]);

      expect(result.lots[0].costBasis).toBe(1050);
      expect(result.lots[0].proceeds).toBe(1430);
      expect(result.lots[0].realisedPnl).toBe(380);
    });

    it("apportions fees across a partial match rather than charging them all at once", () => {
      const result = matchFifo([
        txn({ side: "buy", quantity: 10, price: 100, fees: 100, tradedOn: "2026-01-01" }),
        txn({ side: "sell", quantity: 5, price: 100, fees: 50, tradedOn: "2026-02-01" }),
      ]);

      // Half the units sold, so half of each side's fee applies: cost 5*(100+10)
      // = 550, proceeds 5*(100-10) = 450.
      expect(result.lots[0].costBasis).toBe(550);
      expect(result.lots[0].proceeds).toBe(450);
      expect(result.lots[0].realisedPnl).toBe(-100);
    });
  });

  it("handles fractional quantities without leaving a phantom open lot", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: 0.3, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "buy", quantity: 0.6, price: 100, tradedOn: "2026-01-02" }),
      txn({ side: "sell", quantity: 0.9, price: 200, tradedOn: "2026-02-01" }),
    ]);

    // 0.3 + 0.6 is 0.8999999999999999 in binary floating point; without an
    // epsilon the last sliver would be reported as an unmatched sale.
    expect(result.unmatchedSellQuantity).toBe(0);
    expect(result.totalRealisedPnl).toBeCloseTo(90, 6);
  });

  it("ignores unusable rows instead of producing NaN totals", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: Number.NaN, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "not-a-date" }),
      txn({ side: "buy", quantity: -5, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "sell", quantity: 10, price: 150, tradedOn: "2026-02-01" }),
    ]);

    expect(result.totalRealisedPnl).toBe(500);
    expect(Number.isNaN(result.totalRealisedPnl)).toBe(false);
  });

  it("returns zeroed totals for an empty ledger", () => {
    expect(matchFifo([])).toEqual({
      lots: [],
      totalRealisedPnl: 0,
      totalCostBasis: 0,
      totalProceeds: 0,
      shortTermPnl: 0,
      longTermPnl: 0,
      unmatchedSellQuantity: 0,
    });
  });

  it("sorts realised lots newest sale first", () => {
    const result = matchFifo([
      txn({ side: "buy", quantity: 2, price: 100, tradedOn: "2026-01-01" }),
      txn({ side: "sell", quantity: 1, price: 150, tradedOn: "2026-02-01" }),
      txn({ side: "sell", quantity: 1, price: 150, tradedOn: "2026-05-01" }),
    ]);

    expect(result.lots.map((lot) => lot.sellDate)).toEqual(["2026-05-01", "2026-02-01"]);
  });
});

describe("xirr", () => {
  it("solves a clean one-year double", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 2000 },
    ]);
    expect(rate).toBeCloseTo(1, 4);
  });

  it("annualises a short holding period upward", () => {
    // 10% in roughly a month is a very large annualised rate — the point of
    // XIRR over a flat percentage gain.
    const rate = xirr([
      { date: "2026-01-01", amount: -1000 },
      { date: "2026-02-01", amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeGreaterThan(2);
  });

  it("returns a negative rate for a loss", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 500 },
    ]);
    expect(rate).toBeCloseTo(-0.5, 4);
  });

  it("handles staggered contributions", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-07-01", amount: -1000 },
      { date: "2026-01-01", amount: 2200 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeGreaterThan(0);
    expect(rate as number).toBeLessThan(1);
  });

  it("returns null when there is no return to solve for", () => {
    // All one direction: money went in and never came back, or vice versa.
    expect(xirr([{ date: "2026-01-01", amount: -1000 }])).toBeNull();
    expect(
      xirr([
        { date: "2026-01-01", amount: -1000 },
        { date: "2026-06-01", amount: -500 },
      ])
    ).toBeNull();
    expect(
      xirr([
        { date: "2026-01-01", amount: 1000 },
        { date: "2026-06-01", amount: 500 },
      ])
    ).toBeNull();
  });

  it("returns null for an empty or single-flow series", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2026-01-01", amount: 100 }])).toBeNull();
  });

  it("ignores zero and unparseable flows", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-06-01", amount: 0 },
      { date: "bad-date", amount: 500 },
      { date: "2026-01-01", amount: 2000 },
    ]);
    expect(rate).toBeCloseTo(1, 4);
  });

  it("is not fooled by flow ordering", () => {
    const forward = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 2000 },
    ]);
    const reversed = xirr([
      { date: "2026-01-01", amount: 2000 },
      { date: "2025-01-01", amount: -1000 },
    ]);
    expect(forward).toBeCloseTo(reversed as number, 8);
  });
});

describe("portfolioCashFlows", () => {
  it("signs buys negative and sells positive", () => {
    const flows = portfolioCashFlows(
      [
        txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" }),
        txn({ side: "sell", quantity: 5, price: 150, tradedOn: "2026-02-01" }),
      ],
      0,
      "2026-03-01"
    );

    expect(flows).toEqual([
      { date: "2026-01-01", amount: -1000 },
      { date: "2026-02-01", amount: 750 },
    ]);
  });

  it("charges fees against the investor on both sides", () => {
    const flows = portfolioCashFlows(
      [
        txn({ side: "buy", quantity: 10, price: 100, fees: 20, tradedOn: "2026-01-01" }),
        txn({ side: "sell", quantity: 10, price: 100, fees: 20, tradedOn: "2026-02-01" }),
      ],
      0,
      "2026-03-01"
    );

    expect(flows[0].amount).toBe(-1020);
    expect(flows[1].amount).toBe(980);
  });

  it("appends today's holding value as a closing inflow", () => {
    const flows = portfolioCashFlows(
      [txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" })],
      1500,
      "2026-06-01"
    );

    expect(flows).toHaveLength(2);
    expect(flows[1]).toEqual({ date: "2026-06-01", amount: 1500 });
  });

  it("omits the closing flow when nothing is still held", () => {
    const flows = portfolioCashFlows(
      [txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2026-01-01" })],
      0,
      "2026-06-01"
    );
    expect(flows).toHaveLength(1);
  });

  it("feeds a usable series into xirr", () => {
    const flows = portfolioCashFlows(
      [txn({ side: "buy", quantity: 10, price: 100, tradedOn: "2025-01-01" })],
      2000,
      "2026-01-01"
    );
    expect(xirr(flows)).toBeCloseTo(1, 4);
  });
});
