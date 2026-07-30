import { describe, expect, it } from "vitest";

import { parseNseMarketStatus } from "@/server/infrastructure/providers/nse";
import { getExchangeBackedMarketStatus, getIndianMarketStatus } from "@/shared/market-status";

describe("market status", () => {
  it("handles the NSE cash-session boundaries in IST", () => {
    expect(getIndianMarketStatus(new Date("2026-07-30T03:44:00.000Z")).isOpen).toBe(false);
    expect(getIndianMarketStatus(new Date("2026-07-30T03:45:00.000Z")).isOpen).toBe(true);
    expect(getIndianMarketStatus(new Date("2026-07-30T10:00:00.000Z")).isOpen).toBe(false);
  });

  it("treats the global badge as live when another NSE segment remains open", () => {
    const snapshot = {
      capitalMarketOpen: false,
      anyMarketOpen: true,
      openMarkets: ["Currency", "Commodity", "Debt"],
    };

    expect(getExchangeBackedMarketStatus(snapshot, "all").label).toBe("Live");
    expect(getExchangeBackedMarketStatus(snapshot, "capital").label).toBe("Closed");
  });

  it("parses and deduplicates the official NSE market-state response", () => {
    const snapshot = parseNseMarketStatus({
      marketState: [
        { market: "Capital Market", marketStatus: "Closed", tradeDate: "30-Jul-2026 15:30" },
        { market: "Currency", marketStatus: "Open", tradeDate: "30-Jul-2026" },
        { market: "currencyfuture", marketStatus: "Open", tradeDate: "30-Jul-2026" },
        { market: "Commodity", marketStatus: "Open", tradeDate: "30-Jul-2026" },
      ],
    });

    expect(snapshot).toEqual({
      capitalMarketOpen: false,
      anyMarketOpen: true,
      openMarkets: ["Currency", "Commodity"],
      asOf: "30-Jul-2026 15:30",
    });
  });
});