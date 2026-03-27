import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Screener India — Filter NSE & BSE Stocks by Fundamentals",
  description:
    "Free NSE & BSE stock screener. Filter Indian stocks by PE ratio, market cap, sector, dividend yield, revenue growth, debt-to-equity and 50+ more fundamental filters. Find the best stocks to invest in India.",
  keywords: [
    "stock screener India",
    "NSE stock screener",
    "BSE stock screener",
    "filter stocks India",
    "best stocks to buy India",
    "fundamental analysis screener",
    "PE ratio screener India",
    "market cap filter India",
    "dividend yield screener",
    "smallcap midcap screener",
    "Nifty 50 screener",
    "value stocks India",
    "growth stocks India",
    "free stock screener",
  ],
  alternates: { canonical: "https://mystockvision.com/screener" },
  openGraph: {
    title: "Stock Screener India — Filter NSE & BSE Stocks",
    description: "Filter Indian stocks by 50+ fundamental metrics. Free NSE & BSE stock screener.",
    url: "https://mystockvision.com/screener",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stock Screener India — Filter NSE & BSE Stocks",
    description: "Filter Indian stocks by 50+ fundamental metrics. Free NSE & BSE stock screener.",
  },
};

export default function ScreenerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
