import { describe, it, expect } from "vitest";
import { computeSmartScore, computeRiskScore } from "@/lib/backend/scoring";
import type { SmartScoreInput, RiskScoreInput } from "@/lib/backend/contracts";
import type { PricePoint } from "@/lib/types";

function flatHistory(days: number, close = 100): PricePoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

const strongMetrics = {
  roe: 22, roa: 9, roce: 27, profitMargin: 20,
  peRatio: 15, pbRatio: 3, evToSales: 4, pegRatio: 1,
  dividendYield: 2, debtToEquity: 0.3, currentRatio: 2.2,
};

const weakMetrics = {
  roe: 1, roa: 0.2, roce: 2, profitMargin: 1,
  peRatio: 60, pbRatio: 9, evToSales: 15, pegRatio: 4,
  dividendYield: 0, debtToEquity: 4, currentRatio: 0.6,
};

function smartInput(metrics: Record<string, number | null>, trend: string): SmartScoreInput {
  return {
    metrics,
    technicals: { rsi14: 55, macd: 0.5, ema20: 110, ema50: 100, trend } as unknown as SmartScoreInput["technicals"],
    financials: {} as unknown as SmartScoreInput["financials"],
    priceHistory: flatHistory(300),
    returnsSummary: [] as unknown as SmartScoreInput["returnsSummary"],
    news: [] as unknown as SmartScoreInput["news"],
    corporateActions: {} as unknown as SmartScoreInput["corporateActions"],
    shareholding: {} as unknown as SmartScoreInput["shareholding"],
  };
}

function riskInput(metrics: Record<string, number | null>, trend: string, newsItems: Array<Record<string, unknown>>): RiskScoreInput {
  return {
    news: newsItems as unknown as RiskScoreInput["news"],
    metrics,
    technicals: { rsi14: 50, macd: 0, trend } as unknown as RiskScoreInput["technicals"],
    priceHistory: flatHistory(300),
    financials: {} as unknown as RiskScoreInput["financials"],
  };
}

describe("computeSmartScore", () => {
  it("never throws and marks thin input as Unrated with score 0", () => {
    const result = computeSmartScore({
      metrics: {},
      technicals: {} as unknown as SmartScoreInput["technicals"],
      financials: {} as unknown as SmartScoreInput["financials"],
      priceHistory: [],
      returnsSummary: [] as unknown as SmartScoreInput["returnsSummary"],
      news: [] as unknown as SmartScoreInput["news"],
      corporateActions: {} as unknown as SmartScoreInput["corporateActions"],
      shareholding: {} as unknown as SmartScoreInput["shareholding"],
    });
    expect(result.label).toBe("Unrated");
    expect(result.score).toBe(0);
  });

  it("scores strong fundamentals higher than weak fundamentals", () => {
    const strong = computeSmartScore(smartInput(strongMetrics, "bullish"));
    const weak = computeSmartScore(smartInput(weakMetrics, "bearish"));
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("keeps the score within [0, maxScore]", () => {
    const result = computeSmartScore(smartInput(strongMetrics, "bullish"));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(result.maxScore);
  });
});

describe("computeRiskScore", () => {
  it("never throws and marks thin input as Unrated with score 0", () => {
    const result = computeRiskScore({
      news: [] as unknown as RiskScoreInput["news"],
      metrics: {},
      technicals: {} as unknown as RiskScoreInput["technicals"],
      priceHistory: [],
      financials: {} as unknown as RiskScoreInput["financials"],
    });
    expect(result.label).toBe("Unrated");
    expect(result.score).toBe(0);
  });

  it("scores a financially weak company with bad news as riskier than a strong one with good news", () => {
    const risky = computeRiskScore(
      riskInput(weakMetrics, "bearish", [
        { title: "Company under fraud probe", summary: "regulators raid offices", sentimentScore: 0.1 },
        { title: "Steep decline in revenue", summary: "profit miss", sentimentScore: 0.15 },
      ])
    );
    const safe = computeRiskScore(
      riskInput(strongMetrics, "bullish", [
        { title: "Company beats estimates", summary: "record profit growth", sentimentScore: 0.9 },
        { title: "Strong quarter", summary: "upgrade from analysts", sentimentScore: 0.85 },
      ])
    );
    expect(risky.score).toBeGreaterThan(safe.score);
  });

  it("keeps the score within [0, maxScore]", () => {
    const result = computeRiskScore(riskInput(weakMetrics, "bearish", []));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(result.maxScore);
  });
});
