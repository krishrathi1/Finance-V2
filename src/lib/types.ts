// Shared client-side types mirroring the server payloads.

export interface TickerRow {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  sector: string;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface MarketOverview {
  indices: IndexQuote[];
  stats: {
    advancing: number;
    declining: number;
    unchanged: number;
    averageChange: number;
    universeCount: number;
  };
  mood: {
    value: number;
    level: "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";
    breadthScore: number;
    momentumScore: number;
    advancing: number;
    declining: number;
  };
  movers: {
    gainers: { symbol: string; name: string; price: number; changePercent: number }[];
    losers: { symbol: string; name: string; price: number; changePercent: number }[];
  };
  heatmap: {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    marketCapCr: number;
  }[];
  marketOpen: boolean;
  updatedAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
  sentiment: number;
  symbols: string[];
  category: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
}

/** One row in the Stocks A–Z directory (NSE + BSE). */
export interface DirectoryRow {
  symbol: string;
  name: string;
  sector: string;
  exchange: "NSE" | "BSE";
  price: number;
  change: number;
  changePercent: number;
  marketCapCr: number;
}

/** Payload of GET /api/stocks/directory. */
export interface DirectoryData {
  rows: DirectoryRow[];
  /** total rows matching the current filters (pre-pagination). */
  total: number;
  /** rows per first-letter ("A"…"Z", "#") for the current exchange/sector/q filters. */
  letterCounts: Record<string, number>;
  exchangeCounts: { NSE: number; BSE: number; total: number };
  /** distinct sectors available for the current exchange filter. */
  sectors: string[];
}

export interface PricePoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  change: number;
  changePercent: number;
  high52: number;
  low52: number;
  asOf: string;
}

export interface SmartScore {
  score: number;
  score10: number;
  dimensions: {
    profitability: number;
    growth: number;
    valuation: number;
    momentum: number;
    financialHealth: number;
  };
  label: string;
  explanation: string;
  rated: boolean;
}

export interface RiskScore {
  score: number;
  components: {
    sentiment: number;
    financialRisk: number;
    narrativeRisk: number;
    technicalRisk: number;
  };
  label: string;
  explanation: string;
  rated: boolean;
}

export interface Forensics {
  mScore: number;
  mScoreRisk: "Low" | "Moderate" | "High";
  components: {
    DSRI: number;
    GMI: number;
    AQI: number;
    SGI: number;
    DEPI: number;
    SGAI: number;
    TATA: number;
    LVGI: number;
  };
  zScore: number;
  zZone: "Safe" | "Grey" | "Distress";
  fScore: number;
  fScoreMax: number;
  fStrength: "Weak" | "Moderate" | "Strong";
  governanceFlags: string[];
  overallHealth: "Pristine" | "Healthy" | "Caution" | "Distress";
}

export interface Technicals {
  rsi14: number;
  macd: number;
  macdSignal: number;
  ema20: number;
  ema50: number;
  sma200: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  volatility3M: number;
  drawdown1Y: number;
  return1M: number;
  return3M: number;
  return6M: number;
  return1Y: number;
  pivot: number;
  r1: number;
  s1: number;
}

export interface YearlyFinancial {
  year: number;
  revenue: number;
  ebitda: number;
  netProfit: number;
  opm: number;
  netMargin: number;
  eps: number;
  roe: number;
}

export interface QuarterlyFinancial {
  quarter: string;
  revenue: number;
  netProfit: number;
  opm: number;
  eps: number;
  growthYoY: number;
}

export interface ShareholdingQuarter {
  quarter: string;
  promoters: number;
  fii: number;
  dii: number;
  public: number;
}

export interface CompetitorRow {
  symbol: string;
  name: string;
  marketCapCr: number;
  pe: number | null;
  pb: number;
  roe: number;
  price: number;
  changePercent: number;
}

export interface KeyRatios {
  valuation: {
    pe: number | null;
    pb: number;
    peg: number;
    evEbitda: number;
    evSales: number;
    dividendYield: number;
  };
  profitability: {
    roe: number;
    roce: number;
    roa: number;
    grossMargin: number;
    opm: number;
    npm: number;
  };
  leverage: {
    debtEquity: number;
    currentRatio: number;
    quickRatio: number;
    interestCoverage: number;
  };
  efficiency: {
    assetTurnover: number;
    inventoryDays: number;
    receivableDays: number;
  };
}

export interface DividendYear {
  year: string;
  dps: number;
  payout: number;
  yield: number;
}

export interface CorporateAction {
  date: string;
  type: "Bonus" | "Split" | "Buyback" | "Dividend" | "Rights";
  detail: string;
}

export interface RiskProfile {
  beta: number;
  alpha: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  volatilityAnn: number;
  var95: number;
  rSquared: number;
}

export interface PeerValuationRow {
  symbol: string;
  name: string;
  marketCapCr: number;
  pe: number | null;
  pb: number;
  evEbitda: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  price: number;
  changePercent: number;
}

export interface PeerMedian {
  pe: number | null;
  pb: number;
  evEbitda: number;
  roe: number;
  expensive: "Cheap" | "Fair" | "Expensive";
}

export interface FundamentalSignal {
  label: string;
  pass: boolean;
  detail: string;
}

export interface BrokerReport {
  broker: string;
  rating: string;
  target: number;
  date: string;
  summary: string;
}

export interface BrokerageSummary {
  consensus: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensusTarget: number;
  upsidePct: number;
  reports: BrokerReport[];
}

export interface QuarterlyRow {
  quarter: string;
  revenue: number;
  ebitda: number;
  ebitdaMargin: number;
  pat: number;
  patMargin: number;
  eps: number;
  yoyGrowth: number;
  estimate: number;
  surprisePct: number;
}

export interface StockDashboard {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  exchange: string;
  quote: Quote;
  profile: {
    incorporationYear: number;
    headquarters: string;
    website: string;
    description: string;
    chairman: string;
    employees: number;
    listedSharesCr: number;
  };
  metrics: {
    marketCapCr: number;
    pe: number | null;
    pb: number;
    roe: number;
    roce: number;
    eps: number;
    bookValue: number;
    dividendYield: number;
    debtEquity: number;
    revenueCr: number;
    netProfitCr: number;
    faceValue: number;
    salesGrowth: number;
    profitGrowth: number;
  };
  smartScore: SmartScore;
  riskScore: RiskScore;
  forensics: Forensics;
  technicals: Technicals;
  yearly: YearlyFinancial[];
  quarterly: QuarterlyFinancial[];
  shareholding: ShareholdingQuarter[];
  news: NewsItem[];
  competitors: CompetitorRow[];
  returns: { label: string; value: number }[];
  aiTarget: number;
  circuit: { upper: number; lower: number };
  keyRatios: KeyRatios;
  dividendHistory: DividendYear[];
  corporateActions: CorporateAction[];
  riskProfile: RiskProfile;
  peerValuation: PeerValuationRow[];
  peerMedian: PeerMedian;
  fundamentalSignals: FundamentalSignal[];
  brokerage: BrokerageSummary;
  quarterlyExtended: QuarterlyRow[];
  updatedAt: string;
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  marketCapCr: number;
  pe: number | null;
  pb: number;
  roe: number;
  dividendYield: number;
  salesGrowth: number;
  profitGrowth: number;
  smartScore: number;
  riskScore: number;
}

export interface IpoItem {
  symbol: string;
  company: string;
  sector: string;
  date: string;
  priceRange: string;
  issueSizeCr: number;
  totalSharesLakh: number;
  status: "Upcoming" | "Open" | "Listed";
  listingGain?: number;
  listingPrice?: number;
  issuePrice?: number;
  gmp?: number;
  subscription?: string;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  note: string | null;
  name: string;
  price: number | null;
  changePercent: number | null;
}

export interface Holding {
  id: string;
  symbol: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string | null;
  targetPrice: number | null;
  notes: string | null;
  currentPrice: number;
  changePercent: number | null;
  currentValue: number;
  invested: number;
  pnl: number;
  pnlPercent: number;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  condition: "above" | "below";
  note: string | null;
  armed: boolean;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  currentPrice: number | null;
  currentChangePercent: number | null;
}

export type ViewKey =
  | "home"
  | "stock"
  | "directory"
  | "screener"
  | "watchlist"
  | "portfolio"
  | "compare"
  | "ipo"
  | "alerts";

// ── formatting helpers (shared by all views) ────────────────────────────

export function fmtInr(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function fmtCr(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L Cr`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(2)}K Cr`;
  return `₹${Math.round(v)} Cr`;
}

export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

export function fmtVolume(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v >= 10000000) return `${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(Math.round(v));
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export const upDownClass = (v: number | null | undefined) =>
  v === null || v === undefined ? "text-muted" : v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted";
