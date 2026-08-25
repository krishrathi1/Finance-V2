"use client";

import Link from "next/link";

const TOP_SEO_STOCKS = [
  { symbol: "RELIANCE", name: "Reliance Industries" },
  { symbol: "TCS", name: "Tata Consultancy Services" },
  { symbol: "HDFCBANK", name: "HDFC Bank" },
  { symbol: "INFY", name: "Infosys" },
  { symbol: "ICICIBANK", name: "ICICI Bank" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel" },
  { symbol: "ITC", name: "ITC Limited" },
  { symbol: "SBIN", name: "State Bank of India" },
  { symbol: "TATAMOTORS", name: "Tata Motors" },
  { symbol: "TATASTEEL", name: "Tata Steel" },
  { symbol: "LTIM", name: "LTIMindtree" },
  { symbol: "HAL", name: "Hindustan Aeronautics" },
  { symbol: "BEL", name: "Bharat Electronics" },
  { symbol: "ZOMATO", name: "Zomato Limited" },
  { symbol: "IRCTC", name: "IRCTC" },
  { symbol: "SUZLON", name: "Suzlon Energy" },
  { symbol: "IREDA", name: "IREDA" },
  { symbol: "RVNL", name: "Rail Vikas Nigam" },
  { symbol: "JIOFIN", name: "Jio Financial Services" },
  { symbol: "MAZDOCK", "name": "Mazagon Dock" },
];

export function PopularStocksSeoMesh({ currentSymbol }: { currentSymbol?: string }) {
  const filtered = TOP_SEO_STOCKS.filter((s) => s.symbol !== currentSymbol?.toUpperCase()).slice(0, 16);

  return (
    <div className="rounded-2xl border border-border/50 bg-panel/60 p-4 sm:p-5 backdrop-blur-sm space-y-3">
      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
          Trending Indian Stock Researches &amp; Live Prices
        </h4>
        <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">NSE &amp; BSE Index</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {filtered.map((stock) => (
          <Link
            key={stock.symbol}
            href={`/stocks/${stock.symbol}`}
            className="flex items-center justify-between rounded-xl border border-border/40 bg-bg/50 px-3 py-2 text-muted transition hover:border-accent/50 hover:bg-bg hover:text-text"
          >
            <span className="font-semibold text-fg">{stock.symbol}</span>
            <span className="truncate text-[11px] text-muted-fg">{stock.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
