import { describe, expect, it } from "vitest";

import { parseTrendlyneDocuments, parseTrendlyneRatioTrends } from "@/server/infrastructure/providers/trendlyne";

describe("parseTrendlyneRatioTrends", () => {
  it("maps annual consolidated ratio history into the dashboard groups", () => {
    const body = {
      annualOrder: ["Mar 2025", "Mar 2024", "Mar 2023", "Mar 2022"],
      annualDataDump: {
        consolidated: {
          "Mar 2025": { ROE_A: "18.5", ROCE_A: 15, PE_A: "22.4", Advances_A: 140 },
          "Mar 2024": { ROE_A: "17.5", ROCE_A: 14, PE_A: "20.4", Advances_A: 120 },
          "Mar 2023": { ROE_A: "16.5", ROCE_A: 13, PE_A: "18.4", Advances_A: 100 },
          "Mar 2022": { ROE_A: "15.5", ROCE_A: 12, PE_A: "16.4", Advances_A: 80 },
        },
      },
    };

    const trends = parseTrendlyneRatioTrends(body, "consolidated");

    expect(trends.profitability.find((card) => card.label === "ROE")?.series).toEqual([
      { period: "2022", value: 15.5 },
      { period: "2023", value: 16.5 },
      { period: "2024", value: 17.5 },
      { period: "2025", value: 18.5 },
    ]);
    expect(trends.valuation.find((card) => card.label === "P/E Ratio")?.average3Y).toBeCloseTo(20.4);
    expect(trends.liquidity.find((card) => card.label === "Advance Growth")?.series.at(-1)?.value).toBeCloseTo(16.67);
  });
});

describe("parseTrendlyneDocuments", () => {
  it("extracts each tab independently, resolves URLs, and removes duplicate action links", () => {
    const html = `
      <div class="tab-pane" data-targetid="annualreport">
        <div class="annual-reports-card"><div class="title">Annual Report &amp; Accounts 2025</div><div><a href="/get-document/uploadeddocuments/pdf/1/">pdf</a></div></div>
        <div class="annual-reports-card"><div class="title">Annual Report &amp; Accounts 2025</div><a href="/get-document/uploadeddocuments/pdf/1/">pdf</a></div>
      </div>
      <div class="tab-pane" data-targetid="creditrating">
        <div><div><a href="/get-document/post/pdf/2/">CRISIL Rating Update</a></div></div>
      </div>
      <div class="tab-pane" data-targetid="investorpresentation">
        <div><a href="/get-document/post/pdf/3/">Q4 Investor Presentation</a></div>
        <a href="/get-document/post/pdf/3/">pdf</a>
      </div>
    `;
    const filings = `
      <div><a href="/get-document/post/pdf/4/">Exchange Filing - Board Meeting</a></div>
      <a href="/posts/4/example">Copy Link</a>
    `;

    const documents = parseTrendlyneDocuments(html, filings);

    expect(documents.annualReports).toEqual([
      { title: "Annual Report & Accounts 2025", url: "https://trendlyne.com/get-document/uploadeddocuments/pdf/1/" },
    ]);
    expect(documents.creditRatings[0]?.title).toBe("CRISIL Rating Update");
    expect(documents.investorPresentations).toHaveLength(1);
    expect(documents.exchangeFilings).toEqual([
      { title: "Exchange Filing - Board Meeting", url: "https://trendlyne.com/get-document/post/pdf/4/" },
    ]);
  });
});