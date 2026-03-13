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
    previousName: "N/A",
    industry: "Private Sector Bank"
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
    industryPe: 17.17,
    pegRatio: 2.77,
    pbRatio: 2.38,
    bookValue: 478.43,
    roe: 13.71,
    roce: 15.8,
    roa: 1.61,
    ebitdaMargin: 85.28,
    casaRatio: 38.4,
    debtToEquity: 0.8,
    eps: 48.41,
    dividendYield: 1.26,
    faceValue: 2,
    outstandingShares: 715.81,
    netInterestMargin: 3.47,
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
            { label: "Dividend Growth", value: 12.82 },
            { label: "Stock Returns CAGR", value: -2.41 }
          ]
        },
        {
          label: "3 Year CAGR",
          metrics: [
            { label: "Revenue Growth", value: 35.26 },
            { label: "Net Profit Growth", value: 24.44 },
            { label: "Dividend Growth", value: 12.38 },
            { label: "Stock Returns CAGR", value: 2.02 }
          ]
        },
        {
          label: "5 Year CAGR",
          metrics: [
            { label: "Revenue Growth", value: 22.45 },
            { label: "Net Profit Growth", value: 21.89 },
            { label: "Dividend Growth", value: 54.49 },
            { label: "Stock Returns CAGR", value: 1.73 }
          ]
        }
      ]
    },
    keyRatioTrends: {
      profitability: [
        { label: "ROE", average3Y: 14.49, series: [{ period: "2021", value: 15.17 }, { period: "2022", value: 15.38 }, { period: "2023", value: 15.89 }, { period: "2024", value: 14.03 }, { period: "2025", value: 13.56 }] },
        { label: "ROCE", average3Y: 6.64, series: [{ period: "2021", value: 7.02 }, { period: "2022", value: 6.27 }, { period: "2023", value: 6.3 }, { period: "2024", value: 6.63 }, { period: "2025", value: 7.0 }] },
        { label: "ROA", average3Y: 1.67, series: [{ period: "2021", value: 1.76 }, { period: "2022", value: 1.79 }, { period: "2023", value: 1.81 }, { period: "2024", value: 1.58 }, { period: "2025", value: 1.61 }] },
        { label: "NPM", average3Y: 24.31, series: [{ period: "2021", value: 24.78 }, { period: "2022", value: 28.06 }, { period: "2023", value: 27.02 }, { period: "2024", value: 23.07 }, { period: "2025", value: 21.83 }] }
      ],
      valuation: [
        { label: "P/E Ratio", average3Y: 18.38, series: [{ period: "2021", value: 25.82 }, { period: "2022", value: 21.38 }, { period: "2023", value: 19.47 }, { period: "2024", value: 16.0 }, { period: "2025", value: 19.67 }] },
        { label: "EV/EBITDA", average3Y: 0, series: [{ period: "2021", value: 0 }, { period: "2022", value: 0 }, { period: "2023", value: 0 }, { period: "2024", value: 0 }, { period: "2025", value: 0 }] },
        { label: "Price to Book Value", average3Y: 1.41, series: [{ period: "2021", value: 2.19 }, { period: "2022", value: 1.87 }, { period: "2023", value: 1.61 }, { period: "2024", value: 1.39 }, { period: "2025", value: 1.23 }] },
        { label: "Price to Cash Flow", average3Y: 0, series: [{ period: "2021", value: 0 }, { period: "2022", value: 0 }, { period: "2023", value: 0 }, { period: "2024", value: 0 }, { period: "2025", value: 0 }] }
      ],
      liquidity: [
        { label: "NET NPA", average3Y: 0, series: [{ period: "2021", value: 0 }, { period: "2022", value: 0 }, { period: "2023", value: 0 }, { period: "2024", value: 0 }, { period: "2025", value: 0 }] },
        { label: "CASA Ratio", average3Y: 39.08, series: [{ period: "2021", value: 46.07 }, { period: "2022", value: 48.13 }, { period: "2023", value: 44.37 }, { period: "2024", value: 38.13 }, { period: "2025", value: 34.74 }] },
        { label: "Advance Growth", average3Y: 24.59, series: [{ period: "2021", value: 14.47 }, { period: "2022", value: 19.88 }, { period: "2023", value: 16.96 }, { period: "2024", value: 54.39 }, { period: "2025", value: 6.2 }] },
        { label: "Net Interest Margin", average3Y: 3.45, series: [{ period: "2021", value: 3.85 }, { period: "2022", value: 3.64 }, { period: "2023", value: 3.67 }, { period: "2024", value: 3.21 }, { period: "2025", value: 3.47 }] }
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
    sourceUrl: "https://trendlyne.com/equity/share-holding/533/HDFCBANK/hdfc-bank-ltd/",
    topHolders: [
      { name: "Sbi Nifty 50 Etf", value: 7.28 },
      { name: "Life Insurance Corporation Of India", value: 4.77 },
      { name: "Icici Prudential Large Cap Fund", value: 3.45 },
      { name: "Hdfc Trustee Company Limited-hdfc Flexi Cap Fund", value: 2.87 }
    ],
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
  competitors: {
    table: [
      { name: "ICICI Bank", marketCap: 976659, pe: 18.44, pb: 2.85, roe: 16.17 },
      { name: "SBI", marketCap: 1084136, pe: 13.39, pb: 1.92, roe: 14.35 }
    ],
    sectorName: "Financial Services",
    industryName: "Private Sector Bank",
    sectorCompanies: [
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd" },
      { symbol: "SBIN", name: "State Bank of India" },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd" },
      { symbol: "AXISBANK", name: "Axis Bank Ltd" }
    ],
    industryCompanies: [
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd" },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd" },
      { symbol: "AXISBANK", name: "Axis Bank Ltd" },
      { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd" }
    ]
  },
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
