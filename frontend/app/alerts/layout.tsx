import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Price Alerts India — NSE & BSE Price Notifications",
  description:
    "Set free price alerts for NSE & BSE stocks. Get notified when Indian stocks hit your target price. Monitor buy/sell levels for Nifty 50, midcap and smallcap stocks.",
  keywords: [
    "stock price alert India",
    "NSE BSE price alert",
    "stock notification India",
    "target price alert India",
    "stock buy sell alert",
    "price tracker India",
  ],
  alternates: { canonical: "https://mystockvision.com/alerts" },
  openGraph: {
    title: "Stock Price Alerts India — NSE & BSE Price Notifications",
    description: "Free price alerts for NSE & BSE stocks. Get notified at your target price.",
    url: "https://mystockvision.com/alerts",
    type: "website",
  },
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
