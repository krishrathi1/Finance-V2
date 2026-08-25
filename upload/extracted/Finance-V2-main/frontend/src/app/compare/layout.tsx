import type { Metadata } from "next";

import { buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Compare Stocks India - Side-by-Side NSE and BSE Stock Comparison",
  description:
    "Compare Indian stocks side by side. Review PE ratio, revenue, profit, debt, dividends, Smart Score, and risk rating for NSE and BSE companies with a free stock comparison tool.",
  path: "/compare",
  keywords: [
    "compare stocks India",
    "stock comparison India",
    "NSE stock comparison",
    "side by side stock analysis",
    "which stock is better India",
    "compare PE ratio India",
    "stock vs stock India",
  ],
});

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
