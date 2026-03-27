import type { MetadataRoute } from "next";

// Most-searched NSE/BSE large-caps and popular stocks in India
const POPULAR_STOCKS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR",
  "BHARTIARTL", "ITC", "KOTAKBANK", "LT", "SBIN", "AXISBANK",
  "BAJFINANCE", "ASIANPAINT", "MARUTI", "TITAN", "WIPRO", "ONGC",
  "NTPC", "POWERGRID", "SUNPHARMA", "HCLTECH", "TECHM", "NESTLEIND",
  "BAJAJFINSV", "ULTRACEMCO", "INDUSINDBK", "TATAMOTORS", "TATASTEEL",
  "JSWSTEEL", "COALINDIA", "ADANIPORTS", "ADANIENT", "ADANIGREEN",
  "CIPLA", "DRREDDY", "DIVISLAB", "APOLLOHOSP", "FORTIS",
  "EICHERMOT", "HEROMOTOCO", "BAJAJ-AUTO", "M&M", "TVSMOTOR",
  "HINDALCO", "VEDL", "NMDC", "SAIL", "APLAPOLLO",
  "PIDILITIND", "BERGEPAINT", "AKZONOBEL",
  "IRCTC", "DMART", "NYKAA", "ZOMATO", "PAYTM",
  "POLICYBZR", "CARTRADE", "EASEMYTRIP",
  "TATAPOWER", "TORNTPOWER", "CESC", "JSPL",
  "BANKBARODA", "PNB", "CANARABANK", "FEDERALBNK", "IDFCFIRSTB",
  "RECLTD", "PFC", "IRFC",
  "HAL", "BEL", "BHEL", "BEML",
  "CHOLAFIN", "MUTHOOTFIN", "MANAPPURAM",
  "JUBLFOOD", "WESTLIFE", "DEVYANI",
  "MOTHERSON", "BOSCHLTD", "EXIDEIND",
  "GODREJCP", "MARICO", "DABUR", "EMAMILTD", "COLPAL",
  "GRASIM", "AMBUJACEM", "SHREECEM", "ACC",
  "BIOCON", "AUROPHARMA", "LUPIN", "ALKEM", "TORNTPHARM",
  "MPHASIS", "LTTS", "COFORGE", "PERSISTENT", "KPITTECH",
  "TRENT", "ABFRL", "PAGEIND",
  "PIDILITIND", "SUPREMEIND",
];

const BASE_URL = "https://mystockvision.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/screener`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/ipo`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/compare`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/portfolio`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/watchlist`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/alerts`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  // Dynamic stock pages
  const stockPages: MetadataRoute.Sitemap = POPULAR_STOCKS.map((symbol) => ({
    url: `${BASE_URL}/stocks/${symbol}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.85,
  }));

  return [...staticPages, ...stockPages];
}
