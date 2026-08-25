import type { Metadata } from "next";

import { buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Stock Watchlist India - Track NSE and BSE Stocks",
  description:
    "Create and manage a stock watchlist for Indian markets. Track NSE and BSE stocks with live prices, notes, alerts, Smart Scores, and risk ratings.",
  path: "/watchlist",
  keywords: [
    "stock watchlist India",
    "NSE BSE watchlist",
    "track stocks India",
    "monitor stocks India",
  ],
});

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
