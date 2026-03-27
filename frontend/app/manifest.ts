import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyStockVision — AI Stock Analysis India",
    short_name: "StockVision",
    description: "AI-powered NSE & BSE stock analysis — Smart Scores, risk analysis, financials, IPO calendar, and live market data for Indian equities.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#f59e0b",
    orientation: "portrait-primary",
    categories: ["finance", "business", "utilities"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    shortcuts: [
      {
        name: "Stock Screener",
        url: "/screener",
        description: "Filter NSE & BSE stocks by fundamentals",
      },
      {
        name: "IPO Calendar",
        url: "/ipo",
        description: "Upcoming and recent IPOs in India",
      },
      {
        name: "Compare Stocks",
        url: "/compare",
        description: "Side-by-side stock comparison",
      },
    ],
  };
}
