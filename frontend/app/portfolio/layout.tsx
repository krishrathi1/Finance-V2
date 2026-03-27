import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio Tracker India — Track NSE & BSE Stock Returns",
  description:
    "Free portfolio tracker for Indian stocks. Add your NSE & BSE holdings, track returns, P&L, XIRR, and get AI-powered portfolio health analysis. No login required.",
  keywords: [
    "portfolio tracker India",
    "stock portfolio tracker NSE BSE",
    "track stock returns India",
    "portfolio P&L India",
    "XIRR calculator India",
    "investment tracker India",
    "portfolio analysis India",
    "free portfolio tracker",
    "stock holdings tracker",
    "portfolio health check India",
  ],
  alternates: { canonical: "https://mystockvision.com/portfolio" },
  openGraph: {
    title: "Portfolio Tracker India — Track NSE & BSE Stock Returns",
    description: "Free stock portfolio tracker for Indian equities. Track returns, P&L & AI analysis.",
    url: "https://mystockvision.com/portfolio",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portfolio Tracker India — Track NSE & BSE Stock Returns",
    description: "Free stock portfolio tracker for Indian equities. Track returns, P&L & AI analysis.",
  },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
