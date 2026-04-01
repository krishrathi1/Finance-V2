import type { Metadata } from "next";

export const SITE_NAME = "MyStockVision";
export const SITE_URL = "https://mystockvision.com";
export const SITE_TITLE = "MyStockVision - AI Stock Analysis India for NSE and BSE";
export const SITE_DESCRIPTION =
  "AI-powered stock market analysis for India. Research NSE and BSE stocks with Smart Scores, risk ratings, financial statements, stock screener tools, IPO tracking, portfolio analysis, and live market data.";
export const OG_IMAGE_PATH = "/opengraph-image";
export const TWITTER_IMAGE_PATH = "/twitter-image";

export const POPULAR_STOCK_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "HINDUNILVR",
  "BHARTIARTL",
  "ITC",
  "KOTAKBANK",
  "LT",
  "SBIN",
  "AXISBANK",
  "BAJFINANCE",
  "ASIANPAINT",
  "MARUTI",
  "TITAN",
  "WIPRO",
  "ONGC",
  "NTPC",
  "POWERGRID",
  "SUNPHARMA",
  "HCLTECH",
  "TECHM",
  "NESTLEIND",
  "BAJAJFINSV",
  "ULTRACEMCO",
  "INDUSINDBK",
  "TATAMOTORS",
  "TATASTEEL",
  "JSWSTEEL",
  "COALINDIA",
  "ADANIPORTS",
  "ADANIENT",
  "ADANIGREEN",
  "CIPLA",
  "DRREDDY",
  "DIVISLAB",
  "APOLLOHOSP",
  "FORTIS",
  "EICHERMOT",
  "HEROMOTOCO",
  "BAJAJ-AUTO",
  "M&M",
  "TVSMOTOR",
  "HINDALCO",
  "VEDL",
  "NMDC",
  "SAIL",
  "APLAPOLLO",
  "PIDILITIND",
  "BERGEPAINT",
  "AKZONOBEL",
  "IRCTC",
  "DMART",
  "NYKAA",
  "ZOMATO",
  "PAYTM",
  "POLICYBZR",
  "CARTRADE",
  "EASEMYTRIP",
  "TATAPOWER",
  "TORNTPOWER",
  "CESC",
  "JSPL",
  "BANKBARODA",
  "PNB",
  "CANARABANK",
  "FEDERALBNK",
  "IDFCFIRSTB",
  "RECLTD",
  "PFC",
  "IRFC",
  "HAL",
  "BEL",
  "BHEL",
  "BEML",
  "CHOLAFIN",
  "MUTHOOTFIN",
  "MANAPPURAM",
  "JUBLFOOD",
  "WESTLIFE",
  "DEVYANI",
  "MOTHERSON",
  "BOSCHLTD",
  "EXIDEIND",
  "GODREJCP",
  "MARICO",
  "DABUR",
  "EMAMILTD",
  "COLPAL",
  "GRASIM",
  "AMBUJACEM",
  "SHREECEM",
  "ACC",
  "BIOCON",
  "AUROPHARMA",
  "LUPIN",
  "ALKEM",
  "TORNTPHARM",
  "MPHASIS",
  "LTTS",
  "COFORGE",
  "PERSISTENT",
  "KPITTECH",
  "TRENT",
  "ABFRL",
  "PAGEIND",
  "SUPREMEIND",
] as const;

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

export function absoluteUrl(path = "/") {
  return path.startsWith("http") ? path : `${SITE_URL}${path}`;
}

export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const url = absoluteUrl(input.path);

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      locale: "en_IN",
      title: input.title,
      description: input.description,
      images: [
        {
          url: absoluteUrl(OG_IMAGE_PATH),
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} preview image`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      site: "@mystockvision",
      creator: "@mystockvision",
      images: [absoluteUrl(TWITTER_IMAGE_PATH)],
    },
  };
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; path: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
