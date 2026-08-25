import type { Metadata } from "next";

import { buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Stock Screener India - Filter NSE and BSE Stocks by Fundamentals",
  description:
    "Free NSE and BSE stock screener for India. Filter stocks by PE ratio, market cap, sector, dividend yield, revenue growth, debt-to-equity, and other key stock market filters.",
  path: "/screener",
  keywords: [
    "stock screener India",
    "NSE stock screener",
    "BSE stock screener",
    "filter stocks India",
    "fundamental analysis screener",
    "PE ratio screener India",
    "dividend yield screener",
    "free stock screener",
  ],
});

export default function ScreenerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
