import type { DashboardData } from "@/lib/types";

export const mockDashboard: DashboardData = {
  symbol: "HDFCBANK",
  companyName: "HDFC Bank Ltd",
  exchange: "NSE",
  sector: "Banks - Private Sector",
  profile: {
    incorporationYear: 1994,
    headquarters: "Mumbai",
    website: "https://www.hdfcbank.com",
    description: "Large private sector Indian bank with diversified lending and deposit franchise.",
    chairman: "N/A",
    previousName: "N/A"
  },
  price: {
    cmp: 1775.5,
    change: 19.7,
    changePercent: 1.12,
    currency: "INR",
    fiftyTwoWeekLow: 1350.2,
    fiftyTwoWeekHigh: 1925.6,
    aiTarget: 2140,
    history: Array.from({ length: 365 }, (_, idx) => ({
      date: new Date(Date.now() - (364 - idx) * 86400000).toISOString().slice(0, 10),
      open: 1500 + idx * 0.8,
      high: 1510 + idx * 0.8,
      low: 1492 + idx * 0.8,
      close: 1498 + idx * 0.8 + Math.sin(idx / 8) * 30,
      volume: 3000000 + ((idx % 10) * 120000)
    }))
  },
  metrics: {
    marketCap: 1336498,
    peRatio: 17.94,
    pbRatio: 2.38,
    roe: 13.71,
    roce: 15.8,
    debtToEquity: 0.8,
    eps: 48.41,
    dividendYield: 1.26,
    evToSales: 13.32,
    profitMargin: 17.1
  },
  smartScore: {
    score: 3.8,
    maxScore: 5,
    dimensions: { profitability: 3.4, growth: 3.2, valuation: 3.8, momentum: 4.1, financialHealth: 4.3 },
    label: "Moderate",
    explanation: "Composite of profitability, growth, valuation, momentum and financial health."
  },
  riskScore: {
    score: 2.1,
    maxScore: 5,
    components: { sentiment: 2.0, financialRisk: 1.8, narrativeRisk: 2.4, technicalRisk: 2.2 },
    label: "Medium",
    explanation: "Weighted from sentiment (25%), financial risk (25%), narrative (30%), technicals (20%)."
  },
  returnsSummary: [
    { label: "1 Week", value: -1.1 },
    { label: "1 Month", value: 2.4 },
    { label: "6 Months", value: 9.7 },
    { label: "1 Year", value: 12.8 },
    { label: "3 Years", value: 33.5 },
    { label: "5 Years", value: 77.4 }
  ],
  returnsHeatmap: [
    { year: 2026, "1": -2.1, "2": 1.5, "3": 2.2, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0, "11": 0, "12": 0 },
    { year: 2025, "1": -5.1, "2": 0.58, "3": 7.44, "4": 7.97, "5": 0.13, "6": 4.66, "7": 0.68, "8": -4.8, "9": -0.03, "10": 3.41, "11": 1.7, "12": -1.12 }
  ],
  technicals: {
    rsi14: 58.9,
    macd: 12.3,
    ema20: 1748,
    ema50: 1708,
    trend: "Bullish",
    pivotLevels: { s3: 1620, s2: 1660, s1: 1705, pivot: 1750, r1: 1790, r2: 1830, r3: 1870 }
  },
  financials: {
    growthSnapshot: {
      basis: "consolidated",
      periods: [
        {
          label: "1 Year CAGR",
          metrics: [
            { label: "Revenue Growth", value: 12.54 },
            { label: "Net Profit Growth", value: 12.21 },
            { label: "Financing Profit Growth", value: -22.79 },
            { label: "Dividend Growth", value: 12.82 },
            { label: "Stock Returns CAGR", value: -2.41 }
          ]
        },
        {
          label: "3 Year CAGR",
          metrics: [
            { label: "Revenue Growth", value: 35.26 },
            { label: "Net Profit Growth", value: 24.44 },
            { label: "Financing Profit Growth", value: null },
            { label: "Dividend Growth", value: 12.38 },
            { label: "Stock Returns CAGR", value: 2.02 }
          ]
        },
        {
          label: "5 Year CAGR",
          metrics: [
            { label: "Revenue Growth", value: 22.45 },
            { label: "Net Profit Growth", value: 21.89 },
            { label: "Financing Profit Growth", value: null },
            { label: "Dividend Growth", value: 54.49 },
            { label: "Stock Returns CAGR", value: 1.73 }
          ]
        }
      ]
    },
    quarterly: [
      { period: "Sep 24", revenue: 121456, profit: 18627 },
      { period: "Dec 24", revenue: 112193, profit: 18340 },
      { period: "Mar 25", revenue: 120268, profit: 19284 },
      { period: "Jun 25", revenue: 133054, profit: 17090 },
      { period: "Sep 25", revenue: 118560, profit: 20363 },
      { period: "Dec 25", revenue: 126927, profit: 20691 }
    ],
    yearly: [
      { period: "Mar 21", revenue: 155885, profit: 31856, assets: 97370, cashFlow: 42476 },
      { period: "Mar 22", revenue: 167695, profit: 38150, assets: 130030, cashFlow: 11959 },
      { period: "Mar 23", revenue: 204666, profit: 46148, assets: 117189, cashFlow: 20813 },
      { period: "Mar 24", revenue: 407994, profit: 65446, assets: 178718, cashFlow: 19069 },
      { period: "Mar 25", revenue: 470915, profit: 73440, assets: 144390, cashFlow: 127241 }
    ],
    incomeStatement: [{ particular: "Total Revenue", mar_2025: 470915 }, { particular: "Net Profit", mar_2025: 73440 }],
    balanceSheet: [{ particular: "Total Assets", mar_2025: 4392417 }],
    cashFlow: [{ particular: "Net Cash Flow", mar_2025: 21113 }]
  },
  corporateActions: {
    boardMeetings: [{ date: "2025-04-19", client: "HDFC Bank Ltd", orderType: "Board Meeting", quantity: "-", price: "-", exchange: "BSE" }],
    dividends: [{ date: "2025-06-27", client: "HDFC Bank Ltd", orderType: "Final", quantity: "-", price: 22, exchange: "NSE" }],
    bonusIssues: [{ date: "2025-07-24", client: "HDFC Bank Ltd", orderType: "1:1", quantity: "-", price: "-", exchange: "NSE" }],
    stockSplits: [],
    rightsIssues: [],
    agmEgm: [],
    deals: [
      { date: "2026-01-10", client: "Broker House", orderType: "Sell", dealType: "Block", quantity: 240000, price: 1789, exchange: "BSE" },
      { date: "2026-01-09", client: "Institutional Fund", orderType: "Buy", dealType: "Bulk", quantity: 560000, price: 1768, exchange: "NSE" }
    ],
    bulkDeals: [{ date: "2026-01-09", client: "Institutional Fund", orderType: "Buy", dealType: "Bulk", quantity: 560000, price: 1768, exchange: "NSE" }],
    blockDeals: [{ date: "2026-01-10", client: "Broker House", orderType: "Sell", dealType: "Block", quantity: 240000, price: 1789, exchange: "BSE" }],
    insiderTrades: [{ date: "2026-02-12", client: "Senior Executive", orderType: "Buy", quantity: 5000, price: 1752, exchange: "NSE" }]
  },
  documents: {
    annualReports: [{ title: "Annual Report FY2025", url: "#" }, { title: "Annual Report FY2024", url: "#" }],
    investorPresentations: [{ title: "Q3 FY26 Investor Presentation", url: "#" }],
    creditRatings: [{ title: "CRISIL Rating Update 2025", url: "#" }],
    exchangeFilings: [{ title: "NSE Filing Dec 2025", url: "#" }]
  },
  shareholding: {
    quarter: "Dec 2025",
    promoters: 25.44,
    fii: 48.17,
    dii: 17.25,
    public: 9.14,
    history: [
      { quarter: "Dec 2025", promoters: 25.44, fii: 48.17, dii: 17.25, public: 9.14 },
      { quarter: "Sep 2025", promoters: 25.44, fii: 47.02, dii: 17.88, public: 9.66 },
      { quarter: "Jun 2025", promoters: 25.44, fii: 46.51, dii: 18.42, public: 9.63 },
      { quarter: "Mar 2025", promoters: 25.44, fii: 45.96, dii: 18.91, public: 9.69 }
    ]
  },
  brokerageResearch: {
    source: "Trendlyne",
    sourceUrl: "https://trendlyne.com/research-reports/stock/533/HDFCBANK/hdfc-bank-ltd/",
    updatedAt: "2026-03-12T10:00:00Z",
    summary: { "1D": 1, "1W": 3, "1M": 8, buy: 5, hold: 2, sell: 1, total: 8 },
    reports: [
      {
        broker: "Geojit BNP Paribas",
        action: "hold",
        targetPrice: 1022,
        rating: 4.8,
        date: "2026-02-10",
        headline: "Latest research reports of HDFC Bank Ltd.",
        summary: "Geojit BNP Paribas decreased Hold price target of HDFC Bank Ltd. to 1022.0 on 10 Feb, 2026.",
        url: "https://trendlyne.com/posts/5523813/hdfc-bank-limited"
      }
    ]
  },
  competitors: [
    { name: "ICICI Bank", marketCap: 976659, pe: 18.44, pb: 2.85, roe: 16.17 },
    { name: "SBI", marketCap: 1084136, pe: 13.39, pb: 1.92, roe: 14.35 }
  ],
  news: [
    {
      title: "HDFC vs SBI: Which bank is ruling Indian banking?",
      source: "Moneycontrol",
      publishedAt: "2026-03-03",
      url: "#",
      sentimentScore: 0.62,
      summary: "Analysts highlight asset-quality improvements and stable margins."
    }
  ]
};
