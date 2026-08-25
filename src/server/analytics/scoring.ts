// Smart Score (factor-v3) & Risk Score (risk-v2) — ported from the original
// platform's scoring engine: median-normalised dimensions, weighted blend,
// deterministic and never-throwing.

import { StockSeed } from "../market/universe";
import { getLiveQuote } from "../market/engine";
import { computeTechnicals } from "./technicals";
import { getYearlyFinancials } from "./financials";
import { norm, invNorm, median, clamp } from "../market/rng";
import { computeNewsForStock, sentimentOf } from "../market/news";

export interface ScoreDimension {
  profitability: number;
  growth: number;
  valuation: number;
  momentum: number;
  financialHealth: number;
}

export interface SmartScore {
  score: number; // out of 5
  score10: number; // out of 10
  dimensions: ScoreDimension;
  label: string;
  explanation: string;
  rated: boolean;
}

export interface RiskComponents {
  sentiment: number;
  financialRisk: number;
  narrativeRisk: number;
  technicalRisk: number;
}

export interface RiskScore {
  score: number; // out of 5
  components: RiskComponents;
  label: string;
  explanation: string;
  rated: boolean;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function computeSmartScore(seed: StockSeed): SmartScore {
  try {
    const quote = getLiveQuote(seed.s);
    const tech = computeTechnicals(seed.s);
    const fin = getYearlyFinancials(seed);
    const latest = fin[fin.length - 1];
    const prevFin = fin[fin.length - 2] ?? latest;

    const epsGrowth = latest.eps && prevFin.eps ? ((latest.eps - prevFin.eps) / Math.abs(prevFin.eps)) * 100 : null;
    const peg = seed.pe && seed.pe > 0 && epsGrowth && epsGrowth > 0 ? seed.pe / epsGrowth : null;

    const profitability = median([
      norm(seed.roe, 5, 30),
      norm(seed.roe / 2.4, 1, 12),
      norm(seed.roce, 8, 35),
      norm(latest.netMargin, 4, 26),
    ]);

    const growth = median([
      norm(seed.rg, 0, 25),
      norm(seed.pg, 0, 30),
      norm(epsGrowth, -5, 30),
      norm(tech.return1Y, -15, 40),
    ]);

    const valuation = median([
      invNorm(seed.pe, 8, 55),
      invNorm(seed.pb, 1, 12),
      invNorm(peg, 0.5, 4),
      norm(seed.dy, 0, 4),
    ]);

    const rsiScore = clamp(1 - Math.abs(tech.rsi14 - 55) / 45, 0, 1);
    const macdScore = sigmoid(tech.macd / Math.max(0.01, quote?.price ?? 100) * 40);
    const emaScore = tech.ema20 >= tech.ema50 ? 1 : 0.25;
    const trendScore = tech.trend === "Bullish" ? 0.7 : tech.trend === "Bearish" ? 0.35 : 0.5;
    const momentum = median([
      rsiScore,
      macdScore,
      emaScore,
      trendScore,
      norm(tech.return3M, -15, 35),
      norm(tech.return6M, -20, 50),
    ]);

    const interestCoverage = seed.de < 0.1 ? 24 : seed.de < 0.4 ? 12 : seed.de < 0.8 ? 6 : seed.de < 1.5 ? 3 : 1.2;
    const currentRatio = 1.9 - seed.de * 0.5;
    const altmanZ = seed.de < 0.3 ? 4.2 : seed.de < 0.8 ? 3.1 : seed.de < 1.4 ? 2.1 : 1.3;
    const financialHealth = median([
      invNorm(seed.de, 0, 2.2),
      norm(currentRatio, 0.8, 3),
      norm(interestCoverage, 1.5, 12),
      norm(altmanZ, 1.5, 4.2),
      norm(seed.ph === 0 ? 45 : seed.ph, 20, 65),
    ]);

    const dims: ScoreDimension = {
      profitability,
      growth,
      valuation,
      momentum,
      financialHealth,
    };

    const base =
      0.25 * profitability +
      0.2 * growth +
      0.2 * valuation +
      0.2 * momentum +
      0.15 * financialHealth;

    // Deterministic "ML-style" adjustment from momentum persistence & earnings quality
    const mlAdjustment = clamp((momentum - 0.5) * 0.16 + (growth - 0.5) * 0.08, -0.08, 0.08);
    const finalScore01 = clamp(base + mlAdjustment, 0.05, 0.98);

    const score = Math.round(finalScore01 * 5 * 100) / 100;
    const label = score >= 4 ? "Strong" : score >= 2.5 ? "Moderate" : "Weak";

    return {
      score,
      score10: Math.round(score * 2 * 10) / 10,
      dimensions: {
        profitability: Math.round(profitability * 5 * 100) / 100,
        growth: Math.round(growth * 5 * 100) / 100,
        valuation: Math.round(valuation * 5 * 100) / 100,
        momentum: Math.round(momentum * 5 * 100) / 100,
        financialHealth: Math.round(financialHealth * 5 * 100) / 100,
      },
      label,
      rated: true,
      explanation:
        `Smart Score blends five normalised dimensions — profitability (25%), growth (20%), ` +
        `valuation (20%), momentum (20%) and financial health (15%) — with a deterministic ` +
        `walk-forward adjustment for trend persistence and earnings quality.`,
    };
  } catch {
    return {
      score: 0,
      score10: 0,
      dimensions: { profitability: 0, growth: 0, valuation: 0, momentum: 0, financialHealth: 0 },
      label: "Unrated",
      explanation: "Insufficient data to rate this stock.",
      rated: false,
    };
  }
}

export function computeRiskScore(seed: StockSeed): RiskScore {
  try {
    const tech = computeTechnicals(seed.s);
    const news = computeNewsForStock(seed.s).slice(0, 12);

    const sentiments = news.map((n) => sentimentOf(n.title));
    const sentimentRisk = sentiments.length
      ? clamp(1 - sentiments.reduce((a, b) => a + b, 0) / sentiments.length, 0, 1)
      : 0.5;

    const riskKeywords = [
      "probe", "lawsuit", "insolvency", "raid", "restatement", "forensic",
      "fall", "pledge", "regulatory", "volatility", "outflow", "slump", "fraud", "penalty",
    ];
    const narrativeWeights = news.map((n) => {
      const lower = n.title.toLowerCase();
      const hits = riskKeywords.filter((k) => lower.includes(k)).length;
      const base = 0.34 + seed.v * 0.13; // structurally volatile names carry hotter narratives
      return hits > 0 ? Math.min(0.95, base + 0.25 + Math.min(0.2, hits * 0.08)) : base;
    });
    const narrativeRisk = narrativeWeights.length
      ? narrativeWeights.reduce((a, b) => a + b, 0) / narrativeWeights.length
      : 0.45;

    const interestCoverage = seed.de < 0.1 ? 24 : seed.de < 0.4 ? 12 : seed.de < 0.8 ? 6 : seed.de < 1.5 ? 3 : 1.2;
    const currentRatio = 1.9 - seed.de * 0.5;
    const altmanZ = seed.de < 0.3 ? 4.2 : seed.de < 0.8 ? 3.1 : seed.de < 1.4 ? 2.1 : 1.3;
    const financialRisk = median([
      norm(seed.de, 0.4, 2.2),
      1 - norm(currentRatio, 0.8, 3),
      1 - norm(seed.roe / 2.4, 1, 12),
      1 - norm(interestCoverage, 1.5, 12),
      1 - norm(altmanZ, 1.5, 4.2),
    ]);

    const technicalRisk = median([
      norm(Math.abs(tech.rsi14 - 50), 0, 35),
      norm(tech.volatility3M, 14, 55),
      norm(Math.abs(tech.drawdown1Y), 6, 45),
      tech.trend === "Bullish" ? 0.3 : tech.trend === "Bearish" ? 0.72 : 0.5,
      tech.macd >= 0 ? 0.35 : 0.65,
      norm(seed.v, 0.7, 2.2),
    ]);

    const weighted =
      0.25 * sentimentRisk + 0.25 * financialRisk + 0.3 * narrativeRisk + 0.2 * technicalRisk;

    const score = Math.round(clamp(weighted, 0.05, 0.95) * 5 * 100) / 100;
    const label = score < 2 ? "Low" : score < 3.5 ? "Medium" : "High";

    return {
      score,
      label,
      rated: true,
      components: {
        sentiment: Math.round(sentimentRisk * 5 * 100) / 100,
        financialRisk: Math.round(financialRisk * 5 * 100) / 100,
        narrativeRisk: Math.round(narrativeRisk * 5 * 100) / 100,
        technicalRisk: Math.round(technicalRisk * 5 * 100) / 100,
      },
      explanation:
        `Risk Score weighs narrative risk (30%) heaviest, then sentiment and financial risk ` +
        `(25% each), and technical risk (20%). Scores near 5 signal elevated danger; near 1 is calm.`,
    };
  } catch {
    return {
      score: 0,
      label: "Unrated",
      rated: false,
      components: { sentiment: 0, financialRisk: 0, narrativeRisk: 0, technicalRisk: 0 },
      explanation: "Insufficient data to rate risk.",
    };
  }
}
