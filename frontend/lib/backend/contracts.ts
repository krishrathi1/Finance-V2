/**
 * Shared internal contracts for the Node backend port.
 *
 * Provider modules implement the function SIGNATURES documented here and return
 * these loosely-typed structured objects (mirroring the dynamically-typed Python
 * providers). The dashboard orchestrator consumes the documented fields
 * defensively, so providers may omit any field they cannot source.
 *
 * GOLDEN RULE for every provider function: never throw. Return `null` (or an
 * empty structure) on any failure/timeout so the orchestrator keeps the
 * neutral skeleton default for that section.
 */

import type {
  DashboardData,
  PricePoint,
  ActionRow,
  QuarterlyDetailedPoint,
  KeyRatioTrends,
  FinancialGrowthSnapshot,
  ShareholdingHolder,
  ShareholdingPoint,
} from "@/lib/types";

export type Candle = PricePoint; // { date, open, high, low, close, volume }

/** A live price quote from any provider. All numeric fields nullable. */
export interface RawQuote {
  cmp: number | null;
  change: number | null;
  changePercent: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  faceValue?: number | null;
  /** Outstanding shares in CRORE. */
  outstandingShares?: number | null;
  industryPe?: number | null;
  peRatio?: number | null;
  /** Market cap in CRORE. */
  marketCap?: number | null;
  /** Dividend yield as a PERCENT (e.g. 1.26 == 1.26%). */
  dividendYield?: number | null;
  companyName?: string | null;
  currency?: string;
}

/** Quarterly result row (summary). */
export interface QuarterPoint {
  period: string;
  revenue: number | null;
  profit: number | null;
}

export interface QuarterlyResults {
  quarterly?: QuarterPoint[];
  quarterlyStandalone?: QuarterPoint[];
  quarterlyConsolidated?: QuarterPoint[];
  quarterlyDetailedStandalone?: QuarterlyDetailedPoint[];
  quarterlyDetailedConsolidated?: QuarterlyDetailedPoint[];
}

/** The "bundle" a Yahoo/yfinance-style provider returns (everything it can scrape at once). */
export interface ProviderBundle {
  candles?: Candle[];
  intraday?: Candle[];
  quote?: RawQuote;
  metrics?: Record<string, number | null>;
  financials?: {
    quarterly?: QuarterPoint[];
    yearly?: Array<{ period: string; revenue: number | null; profit: number | null; assets: number | null; cashFlow: number | null }>;
    incomeStatement?: Array<Record<string, string | number | null>>;
    balanceSheet?: Array<Record<string, string | number | null>>;
    cashFlow?: Array<Record<string, string | number | null>>;
  };
  profile?: Partial<DashboardData["profile"]> & { companyName?: string; sector?: string };
  shareholding?: {
    promoters?: number;
    fii?: number;
    dii?: number;
    public?: number;
    quarter?: string;
    topHolders?: ShareholdingHolder[];
    history?: ShareholdingPoint[];
    sourceUrl?: string;
  };
  news?: Array<{ title: string; url: string; publishedAt?: string; source?: string; summary?: string }>;
}

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
  imageUrl?: string | null;
  sentimentScore?: number;
}

// ---------------------------------------------------------------------------
// Provider function signatures (each implemented in lib/backend/providers/*).
// ---------------------------------------------------------------------------

export interface NseProviderApi {
  getNseQuote(base: string): Promise<RawQuote | null>;
  getNseCorporateEvents(base: string): Promise<DashboardData["corporateActions"] | null>;
  getNseQuarterlyResults(base: string): Promise<QuarterlyResults | null>;
}

export interface YahooProviderApi {
  getYahooQuote(marketSymbol: string): Promise<RawQuote | null>;
  getYahooCandles(base: string, days: number): Promise<Candle[] | null>;
  /** yfinance-equivalent: profile, metrics, statements, shareholding, news, intraday, candles. */
  getYahooBundle(marketSymbol: string, days: number): Promise<ProviderBundle | null>;
}

export interface FmpProviderApi {
  getFmpQuote(marketSymbol: string): Promise<RawQuote | null>;
  getFmpCandles(marketSymbol: string, timeframe: string): Promise<Candle[] | null>;
  getFmpQuarterlyResults(marketSymbol: string): Promise<QuarterPoint[] | null>;
  getFmpProfile(marketSymbol: string): Promise<(Partial<DashboardData["profile"]> & { companyName?: string; sector?: string }) | null>;
  getFmpKeyMetrics(marketSymbol: string): Promise<Array<Record<string, number | string | null>> | null>;
  getFmpFinancialGrowth(marketSymbol: string): Promise<Array<Record<string, number | string | null>> | null>;
  getFmpAnalystEstimates(marketSymbol: string): Promise<Array<Record<string, number | string | null>> | null>;
  /** For search + screener reuse. */
  searchFmp?(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>>;
}

// ---------------------------------------------------------------------------
// Scoring signatures (lib/backend/scoring.ts).
// ---------------------------------------------------------------------------

export interface SmartScoreInput {
  metrics: Record<string, number | null>;
  technicals: DashboardData["technicals"];
  financials: DashboardData["financials"];
  priceHistory: PricePoint[];
  returnsSummary: DashboardData["returnsSummary"];
  news: DashboardData["news"];
  corporateActions: DashboardData["corporateActions"];
  shareholding: DashboardData["shareholding"];
}

export interface RiskScoreInput {
  news: DashboardData["news"];
  metrics: Record<string, number | null>;
  technicals: DashboardData["technicals"];
  priceHistory: PricePoint[];
  financials: DashboardData["financials"];
  brokerageResearch?: DashboardData["brokerageResearch"];
}

// ---------------------------------------------------------------------------
// Re-exports for convenience.
// ---------------------------------------------------------------------------
export type { DashboardData, PricePoint, ActionRow, KeyRatioTrends, FinancialGrowthSnapshot };
