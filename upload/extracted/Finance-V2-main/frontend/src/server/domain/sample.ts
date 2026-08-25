/**
 * Neutral, symbol-specific dashboard skeleton (port of sample_data.get_sample_dashboard).
 * Used both as the seed that providers fill in, and as the last-resort fallback
 * payload when every live provider fails. All numbers are zero/null and all
 * lists are empty so the UI renders an honest "no data" state rather than
 * another symbol's figures.
 */

import type { DashboardData } from "@/shared/types";

export function getSampleDashboard(symbol: string): DashboardData {
  const sym = String(symbol || "").trim().toUpperCase().replace(/\.(NS|BO)$/i, "");
  return {
    symbol: sym,
    companyName: sym,
    exchange: "NSE",
    sector: "",
    profile: {
      incorporationYear: 0,
      headquarters: "",
      website: "",
      description: "",
      chairman: "N/A",
      previousName: "N/A",
      industry: "",
    },
    price: {
      cmp: 0,
      change: 0,
      changePercent: 0,
      currency: "INR",
      fiftyTwoWeekLow: 0,
      fiftyTwoWeekHigh: 0,
      aiTarget: 0,
      history: [],
    },
    metrics: {
      marketCap: null,
      peRatio: null,
      industryPe: null,
      pegRatio: null,
      pbRatio: null,
      bookValue: null,
      roe: null,
      roce: null,
      roa: null,
      ebitdaMargin: null,
      casaRatio: null,
      netInterestMargin: null,
      debtToEquity: null,
      totalDebt: null,
      dividendYield: null,
      eps: null,
      faceValue: null,
      outstandingShares: null,
      currentRatio: null,
      evToSales: null,
      profitMargin: null,
    },
    smartScore: {
      score: 0,
      maxScore: 5,
      dimensions: {},
      label: "Unrated",
      explanation: "",
    },
    riskScore: {
      score: 0,
      maxScore: 5,
      components: {},
      label: "Unrated",
      explanation: "",
    },
    returnsSummary: [],
    returnsHeatmap: [],
    technicals: {
      rsi14: 0,
      macd: 0,
      ema20: 0,
      ema50: 0,
      trend: "Neutral",
      pivotLevels: {},
    },
    financials: {
      quarterly: [],
      yearly: [],
      incomeStatement: [],
      balanceSheet: [],
      cashFlow: [],
      growthSnapshot: { basis: "consolidated", periods: [] },
      keyRatioTrends: { profitability: [], valuation: [], liquidity: [] },
    },
    corporateActions: {
      boardMeetings: [],
      dividends: [],
      bonusIssues: [],
      stockSplits: [],
      rightsIssues: [],
      agmEgm: [],
      deals: [],
      bulkDeals: [],
      blockDeals: [],
      insiderTrades: [],
    },
    documents: {
      annualReports: [],
      investorPresentations: [],
      creditRatings: [],
      exchangeFilings: [],
    },
    shareholding: {
      quarter: "",
      promoters: 0,
      fii: 0,
      dii: 0,
      public: 0,
      history: [],
      topHolders: [],
    },
    brokerageResearch: {
      source: "",
      sourceUrl: "",
      updatedAt: "",
      summary: { "1D": 0, "1W": 0, "1M": 0, buy: 0, hold: 0, sell: 0, total: 0 },
      reports: [],
    },
    competitors: {
      table: [],
      sectorName: "",
      industryName: "",
      sectorCompanies: [],
      industryCompanies: [],
    },
    news: [],
  };
}
