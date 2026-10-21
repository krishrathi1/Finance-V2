import { describe, it, expect } from "vitest";
import { buildScreenSnapshot } from "./screen-chunker";

describe("screen-chunker", () => {
  it("creates structured fact chunks from stock header", () => {
    const snapshot = buildScreenSnapshot({
      sessionId: "test-sess-1",
      route: "/stocks/TCS",
      pageTitle: "TCS - Tata Consultancy Services",
      stock: {
        symbol: "TCS",
        companyName: "Tata Consultancy Services Ltd",
        price: "3920.50",
        changePercent: "+1.25%",
        pe: "28.4",
        smartScore: "85",
        sector: "Information Technology",
      },
      metrics: [
        { label: "P/E Ratio", value: "28.4" },
        { label: "Market Cap", value: "₹14.2 Lakh Cr" },
        { label: "ROE", value: "48.2%" },
      ],
    });

    expect(snapshot.sessionId).toBe("test-sess-1");
    expect(snapshot.stock?.symbol).toBe("TCS");
    expect(snapshot.chunks.length).toBeGreaterThanOrEqual(2);

    const factChunk = snapshot.chunks.find((c) => c.type === "structured_fact");
    expect(factChunk).toBeDefined();
    expect(factChunk?.content).toContain("Active Stock: TCS");
    expect(factChunk?.content).toContain("₹3920.50");
    expect(factChunk?.keywords).toContain("tcs");
    expect(factChunk?.keywords).toContain("pe");
  });

  it("chunks tabular data with column associations", () => {
    const snapshot = buildScreenSnapshot({
      sessionId: "test-sess-2",
      route: "/screener",
      pageTitle: "High Growth Screener",
      tables: [
        {
          title: "Screener Results",
          rows: [
            { Symbol: "INFY", Price: "1850", PE: "24.5" },
            { Symbol: "WIPRO", Price: "520", PE: "20.1" },
          ],
        },
      ],
    });

    const tableChunk = snapshot.chunks.find((c) => c.type === "table_row");
    expect(tableChunk).toBeDefined();
    expect(tableChunk?.content).toContain("Table [Screener Results]");
    expect(tableChunk?.content).toContain("INFY");
    expect(tableChunk?.content).toContain("WIPRO");
  });

  it("chunks long narrative text with overlapping boundaries", () => {
    const longText =
      "Tata Consultancy Services reported strong quarterly earnings driven by digital transformation contracts and high margin cloud migrations. Operating margin expanded by 50 basis points year on year despite currency headwinds. Management expressed confidence in double digit order book growth across banking and retail verticals.";

    const snapshot = buildScreenSnapshot({
      sessionId: "test-sess-3",
      route: "/stocks/TCS",
      pageTitle: "TCS Earnings Analysis",
      sections: [{ title: "Management Commentary", text: longText }],
    });

    const textChunks = snapshot.chunks.filter((c) => c.type === "section_text");
    expect(textChunks.length).toBeGreaterThan(0);
    expect(textChunks[0].content).toContain("Management Commentary");
    expect(textChunks[0].metadata.section).toBe("Management Commentary");
  });
});
