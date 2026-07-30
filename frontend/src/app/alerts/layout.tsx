import type { Metadata } from "next";

import { buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Stock Price Alerts India - NSE and BSE Price Notifications",
  description:
    "Set free stock price alerts for NSE and BSE stocks. Track target prices, entry levels, and exit levels for Indian equities with browser-based notifications.",
  path: "/alerts",
  keywords: [
    "stock price alert India",
    "NSE BSE price alert",
    "target price alert India",
    "stock notification India",
  ],
});

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
