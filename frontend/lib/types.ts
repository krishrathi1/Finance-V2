export type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DashboardData = {
  symbol: string;
  companyName: string;
  exchange: string;
  sector: string;
  profile: {
    incorporationYear: number;
    headquarters: string;
    website: string;
    description: string;
    chairman: string;
    previousName: string;
    industry?: string;
  };
  price: {
    cmp: number;
    change: number;
    changePercent: number;
    currency: string;
    fiftyTwoWeekLow: number;
    fiftyTwoWeekHigh: number;
    aiTarget: number;
    history: PricePoint[];
    intraday?: PricePoint[];
  };
  metrics: Record<string, number | null>;
  smartScore: {
    score: number;
    maxScore: number;
    dimensions: Record<string, number>;
    label: string;
    explanation: string;
    aiExplanation?: string;
    methodology?: string;
    score10?: number;
    mlConfidence?: number;
    mlAdjustment?: number;
    modelVersion?: string;
    validation?: {
      samples?: number;
      horizonDays?: number;
      hitRate?: number | null;
      upProbability?: number;
    };
  };
  riskScore: {
    score: number;
    maxScore: number;
    components: Record<string, number>;
    label: string;
    explanation: string;
    aiExplanation?: string;
    methodology?: string;
    modelVersion?: string;
  };
  returnsSummary: Array<{ label: string; value: number | null }>;
  returnsHeatmap: Array<Record<string, number | null>>;
  technicals: {
    rsi14: number;
    macd: number;
    ema20: number;
    ema50: number;
    trend: string;
    pivotLevels: Record<string, number>;
  };
  financials: {
    quarterly: Array<{ period: string; revenue: number; profit: number }>;
    quarterlyStandalone?: Array<{ period: string; revenue: number; profit: number }>;
    quarterlyConsolidated?: Array<{ period: string; revenue: number; profit: number }>;
    quarterlyDetailedStandalone?: QuarterlyDetailedPoint[];
    quarterlyDetailedConsolidated?: QuarterlyDetailedPoint[];
    growthSnapshot?: FinancialGrowthSnapshot;
    keyRatioTrends?: KeyRatioTrends;
    yearly: Array<{ period: string; revenue: number; profit: number; assets: number; cashFlow: number }>;
    incomeStatement: Array<Record<string, string | number>>;
    balanceSheet: Array<Record<string, string | number>>;
    cashFlow: Array<Record<string, string | number>>;
  };
  corporateActions: {
    boardMeetings: ActionRow[];
    dividends: ActionRow[];
    bonusIssues: ActionRow[];
    stockSplits: ActionRow[];
    rightsIssues: ActionRow[];
    agmEgm: ActionRow[];
    deals: ActionRow[];
    bulkDeals: ActionRow[];
    blockDeals: ActionRow[];
    insiderTrades: ActionRow[];
  };
  documents: {
    annualReports: DocRow[];
    investorPresentations: DocRow[];
    creditRatings: DocRow[];
    exchangeFilings: DocRow[];
  };
  shareholding: {
    quarter: string;
    promoters: number;
    fii: number;
    dii: number;
    public: number;
    history?: ShareholdingPoint[];
    topHolders?: ShareholdingHolder[];
    sourceUrl?: string;
  };
  brokerageResearch?: {
    source: string;
    sourceUrl: string;
    updatedAt: string;
    summary: {
      "1D": number;
      "1W": number;
      "1M": number;
      buy: number;
      hold: number;
      sell: number;
      total: number;
    };
    reports: Array<{
      broker: string;
      action: string;
      targetPrice: number | null;
      rating: number | null;
      date: string;
      headline: string;
      summary: string;
      url: string;
    }>;
  };
  competitors: {
    table: Array<{ name: string; marketCap: number; pe: number; pb: number; roe: number }>;
    sectorName?: string;
    industryName?: string;
    sectorCompanies?: Array<{ symbol: string; name: string }>;
    industryCompanies?: Array<{ symbol: string; name: string }>;
  };
  news: NewsItem[];
};

export type ActionRow = {
  date: string;
  client: string;
  orderType: string;
  dealType?: string;
  agenda?: string;
  announcementDate?: string;
  type?: string;
  exDate?: string;
  recordDate?: string;
  dividendAmount?: number | null;
  dividendPercent?: number | null;
  bonusRatio?: string;
  splitRatio?: string;
  rightsRatio?: string;
  details?: string;
  quantity: string | number;
  price: string | number;
  exchange: string;
  transactionType?: string;
};

export type DocRow = { title: string; url: string };

export type NewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  sentimentScore: number;
  summary: string;
};

export type QuarterlyDetailedPoint = {
  period: string;
  totalRevenue?: number | null;
  totalRevenueGrowthPct?: number | null;
  operatingRevenue?: number | null;
  interestEarned?: number | null;
  otherIncome?: number | null;
  expenses?: number | null;
  interestExpended?: number | null;
  operatingExpenses?: number | null;
  netInterestIncome?: number | null;
  niGrowthPct?: number | null;
  operatingProfit?: number | null;
  opmPct?: number | null;
  depreciations?: number | null;
  profitBeforeTax?: number | null;
  tax?: number | null;
  taxPct?: number | null;
  netProfit?: number | null;
  netProfitGrowthPct?: number | null;
  netProfitMarginPct?: number | null;
  netProfitMarginGrowthPct?: number | null;
  epsAdjusted?: number | null;
  netProfitTtm?: number | null;
  basicEpsTtm?: number | null;
  basicEps?: number | null;
  dilutedEps?: number | null;
  grossNpa?: number | null;
  netNpa?: number | null;
  grossNpaIsPercent?: boolean;
  netNpaIsPercent?: boolean;
};

export type FinancialGrowthSnapshot = {
  basis: "consolidated" | "standalone";
  periods: Array<{
    label: string;
    metrics: Array<{
      label: string;
      value: number | null;
    }>;
  }>;
};

export type ShareholdingPoint = {
  quarter: string;
  promoters: number;
  fii: number;
  dii: number;
  public: number;
};

export type ShareholdingHolder = {
  name: string;
  value: number;
};

export type KeyRatioTrendPoint = {
  period: string;
  value: number | null;
};

export type KeyRatioTrendCard = {
  label: string;
  average3Y: number | null;
  series: KeyRatioTrendPoint[];
};

export type KeyRatioTrends = {
  profitability: KeyRatioTrendCard[];
  valuation: KeyRatioTrendCard[];
  liquidity: KeyRatioTrendCard[];
};
