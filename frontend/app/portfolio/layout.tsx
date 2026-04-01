import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Portfolio Tracker India - Track NSE and BSE Stock Returns",
  description:
    "Free portfolio tracker for Indian stocks. Track holdings, profit and loss, XIRR-style returns, allocation, alerts, and AI portfolio analysis for NSE and BSE investments.",
  path: "/portfolio",
  keywords: [
    "portfolio tracker India",
    "stock portfolio tracker NSE BSE",
    "track stock returns India",
    "portfolio analysis India",
    "free portfolio tracker",
    "stock holdings tracker",
  ],
});

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
