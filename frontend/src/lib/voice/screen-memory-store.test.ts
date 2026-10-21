import { describe, it, expect, beforeEach } from "vitest";
import { screenMemoryStore } from "./screen-memory-store";
import { buildScreenSnapshot } from "./screen-chunker";

describe("screen-memory-store", () => {
  beforeEach(() => {
    screenMemoryStore.clearSession("sess-a");
    screenMemoryStore.clearSession("sess-b");
  });

  it("stores and maintains session isolation", () => {
    const snapA = buildScreenSnapshot({
      sessionId: "sess-a",
      route: "/stocks/RELIANCE",
      pageTitle: "Reliance Industries",
      stock: { symbol: "RELIANCE", price: "2950", pe: "26.1" },
    });

    const snapB = buildScreenSnapshot({
      sessionId: "sess-b",
      route: "/stocks/INFY",
      pageTitle: "Infosys Ltd",
      stock: { symbol: "INFY", price: "1850", pe: "24.2" },
    });

    screenMemoryStore.saveSnapshot(snapA);
    screenMemoryStore.saveSnapshot(snapB);

    const retrievedA = screenMemoryStore.getSnapshot("sess-a");
    const retrievedB = screenMemoryStore.getSnapshot("sess-b");

    expect(retrievedA?.stock?.symbol).toBe("RELIANCE");
    expect(retrievedB?.stock?.symbol).toBe("INFY");
    expect(retrievedA?.stock?.symbol).not.toBe(retrievedB?.stock?.symbol);
  });

  it("retrieves the most relevant chunks matching the user question", () => {
    const snap = buildScreenSnapshot({
      sessionId: "sess-a",
      route: "/stocks/HDFCBANK",
      pageTitle: "HDFC Bank Ltd",
      stock: {
        symbol: "HDFCBANK",
        price: "1680.00",
        pe: "19.5",
        smartScore: "88",
      },
      metrics: [
        { label: "Net Interest Margin", value: "3.6%" },
        { label: "Gross NPA", value: "1.24%" },
        { label: "P/E Ratio", value: "19.5" },
      ],
      sections: [
        {
          title: "Quarterly NPA Details",
          text: "Gross NPA stood at 1.24% and Net NPA improved to 0.33% reflecting asset quality resilience.",
        },
        {
          title: "Dividend History",
          text: "The bank announced a dividend payout of ₹19.5 per share with record date in June.",
        },
      ],
    });

    screenMemoryStore.saveSnapshot(snap);

    // Query 1: Asking about NPA
    const npaResults = screenMemoryStore.retrieveRelevant("sess-a", "What is the NPA status?");
    expect(npaResults.chunks.length).toBeGreaterThan(0);
    const hasNpaContent = npaResults.chunks.some((c) =>
      c.content.toLowerCase().includes("npa")
    );
    expect(hasNpaContent).toBe(true);

    // Query 2: Asking about stock price
    const priceResults = screenMemoryStore.retrieveRelevant("sess-a", "What is the current stock price?");
    expect(priceResults.stock?.price).toBe("1680.00");
    expect(priceResults.groundingContext).toContain("1680.00");
  });

  it("returns fallback message when querying an empty or nonexistent session", () => {
    const res = screenMemoryStore.retrieveRelevant("non-existent-session", "What is CMP?");
    expect(res.chunks).toEqual([]);
    expect(res.groundingContext).toContain("No active screen memory recorded");
  });
});
