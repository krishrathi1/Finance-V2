import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreSentiment } from "@/server/infrastructure/providers/news-rss";

const getTextMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/infrastructure/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/infrastructure/http")>();
  return { ...actual, getText: getTextMock };
});

describe("scoreSentiment", () => {
  it("is neutral (0.5) for text with no sentiment keywords", () => {
    expect(scoreSentiment("The company held its annual meeting today")).toBe(0.5);
  });

  it("scores positive keywords above neutral", () => {
    expect(scoreSentiment("Profit surge drives record growth")).toBeGreaterThan(0.5);
  });

  it("scores negative keywords below neutral", () => {
    expect(scoreSentiment("Sharp decline in profit amid fraud probe")).toBeLessThan(0.5);
  });

  it("flips a positive word to negative when negated nearby", () => {
    // "No profit growth" should NOT read as positive just because "profit"/"growth" appear.
    const negated = scoreSentiment("No profit growth this quarter");
    const plain = scoreSentiment("Profit growth this quarter");
    expect(negated).toBeLessThan(plain);
    expect(negated).toBeLessThanOrEqual(0.5);
  });

  it("amplifies rather than cancels when an intensifier precedes a negative word", () => {
    // "Strong decline" must not net out neutral (strong=+, decline=- cancelling).
    const score = scoreSentiment("Strong decline in revenue");
    expect(score).toBeLessThan(0.5);
    // The intensified negative should score at least as negative as the bare word.
    const bare = scoreSentiment("Decline in revenue");
    expect(score).toBeLessThanOrEqual(bare);
  });

  it("clamps to [0, 1]", () => {
    const veryNegative = scoreSentiment("fraud fraud fraud probe probe probe lawsuit lawsuit lawsuit penalty penalty penalty raid raid raid");
    expect(veryNegative).toBeGreaterThanOrEqual(0);
    const veryPositive = scoreSentiment("surge surge surge jump jump jump gain gain gain rise rise rise profit profit profit");
    expect(veryPositive).toBeLessThanOrEqual(1);
  });
});

describe("getGoogleNews", () => {
  beforeEach(() => {
    getTextMock.mockReset();
  });

  it("parses CDATA titles without corrupting embedded angle-bracket text", async () => {
    getTextMock.mockResolvedValue(`<?xml version="1.0"?><rss><channel>
      <item>
        <title><![CDATA[Firm <XYZ> reports record profit]]></title>
        <link>https://example.com/a</link>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <source>Example News</source>
        <description><![CDATA[Details about <XYZ> here]]></description>
      </item>
    </channel></rss>`);
    const { getGoogleNews } = await import("@/server/infrastructure/providers/news-rss");
    const items = await getGoogleNews("XYZ stock");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Firm <XYZ> reports record profit");
    expect(items[0].source).toBe("Example News");
  });

  it("tolerates a namespaced/attributed <item> tag", async () => {
    getTextMock.mockResolvedValue(`<rss><channel>
      <item rdf:about="https://example.com/b">
        <title>Quarterly results beat estimates</title>
        <link>https://example.com/b</link>
      </item>
    </channel></rss>`);
    const { getGoogleNews } = await import("@/server/infrastructure/providers/news-rss");
    const items = await getGoogleNews("query");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Quarterly results beat estimates");
  });

  it("returns [] (not a crash) for a non-RSS response", async () => {
    getTextMock.mockResolvedValue("<html><body>Rate limited</body></html>");
    const { getGoogleNews } = await import("@/server/infrastructure/providers/news-rss");
    expect(await getGoogleNews("query")).toEqual([]);
  });

  it("returns [] when the upstream fetch fails", async () => {
    getTextMock.mockResolvedValue(null);
    const { getGoogleNews } = await import("@/server/infrastructure/providers/news-rss");
    expect(await getGoogleNews("query")).toEqual([]);
  });
});
