import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Stocks India — Side-by-Side NSE & BSE Stock Comparison",
  description:
    "Compare two or more Indian stocks side by side. Analyze PE ratio, revenue, profit, debt, dividends, Smart Score, and risk rating for NSE & BSE companies. Free stock comparison tool.",
  keywords: [
    "compare stocks India",
    "stock comparison India",
    "NSE stock comparison",
    "side by side stock analysis",
    "which stock is better India",
    "TCS vs Infosys",
    "HDFC vs ICICI",
    "Reliance vs Tata",
    "compare PE ratio India",
    "stock vs stock India",
    "fundamental comparison India",
  ],
  alternates: { canonical: "https://mystockvision.com/compare" },
  openGraph: {
    title: "Compare Stocks India — Side-by-Side NSE & BSE Analysis",
    description: "Compare Indian stocks side by side — PE, revenue, profit, Smart Score & more.",
    url: "https://mystockvision.com/compare",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare Stocks India — Side-by-Side NSE & BSE Analysis",
    description: "Compare Indian stocks side by side — PE, revenue, profit, Smart Score & more.",
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
