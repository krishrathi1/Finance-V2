import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Watchlist India — Track NSE & BSE Stocks",
  description:
    "Create and manage your Indian stock watchlist. Monitor live prices, changes, Smart Scores and risk ratings for NSE & BSE stocks — all in one place.",
  keywords: [
    "stock watchlist India",
    "NSE BSE watchlist",
    "track stocks India",
    "stock price alert India",
    "monitor stocks India",
    "favourite stocks India",
  ],
  alternates: { canonical: "https://mystockvision.com/watchlist" },
  openGraph: {
    title: "Stock Watchlist India — Track NSE & BSE Stocks",
    description: "Monitor live NSE & BSE stock prices, Smart Scores and risk ratings in one watchlist.",
    url: "https://mystockvision.com/watchlist",
    type: "website",
  },
};

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
