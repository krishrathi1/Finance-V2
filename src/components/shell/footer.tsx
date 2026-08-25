"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";
import type { ViewKey } from "@/lib/types";
import { MarketStatusBadge } from "@/components/shared/market-status";
import { BrandMark } from "./header";

const TOOL_LINKS: { label: string; view: ViewKey }[] = [
  { label: "Stock Screener", view: "screener" },
  { label: "Watchlist", view: "watchlist" },
  { label: "Portfolio Doctor", view: "portfolio" },
  { label: "Compare Stocks", view: "compare" },
  { label: "IPO Tracker", view: "ipo" },
  { label: "Price Alerts", view: "alerts" },
];

const MARKET_LINKS: { symbol: string; name: string }[] = [
  { symbol: "RELIANCE", name: "Reliance Industries" },
  { symbol: "TCS", name: "Tata Consultancy Services" },
  { symbol: "HDFCBANK", name: "HDFC Bank" },
  { symbol: "INFY", name: "Infosys" },
  { symbol: "ICICIBANK", name: "ICICI Bank" },
  { symbol: "SBIN", name: "State Bank of India" },
];

const AI_FEATURES = [
  "Forensic Copilot",
  "AI Research Reports",
  "SWOT Analysis",
  "Portfolio Risk Scan",
  "Watchlist Digest",
];

const linkClass =
  "text-left text-sm text-muted-foreground transition hover:text-brand min-h-9 py-1";

export function Footer() {
  const setView = useApp((s) => s.setView);
  const openStock = useApp((s) => s.openStock);

  return (
    <footer className="mt-12 border-t border-border/40 bg-panel/30 backdrop-blur">
      <div className="h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" aria-hidden="true" />

      <div className="mx-auto grid max-w-[1640px] gap-8 px-4 py-10 md:grid-cols-4">
        {/* Brand */}
        <div className="space-y-4">
          <BrandMark subtitle={false} />
          <p className="text-sm leading-6 text-muted-foreground">
            Institutional-grade research for Indian markets.
          </p>
          <MarketStatusBadge />
        </div>

        {/* Research tools */}
        <nav aria-label="Research tools">
          <h3 className="font-display text-sm font-bold text-text">Research Tools</h3>
          <ul className="mt-3 space-y-1">
            {TOOL_LINKS.map((link) => (
              <li key={link.view}>
                <button type="button" onClick={() => setView(link.view)} className={linkClass}>
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Popular markets */}
        <nav aria-label="Popular stocks">
          <h3 className="font-display text-sm font-bold text-text">Markets</h3>
          <ul className="mt-3 space-y-1">
            {MARKET_LINKS.map((stock) => (
              <li key={stock.symbol}>
                <button
                  type="button"
                  onClick={() => openStock(stock.symbol)}
                  aria-label={`Open ${stock.name}`}
                  className={linkClass}
                >
                  {stock.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* AI features */}
        <div>
          <h3 className="font-display text-sm font-bold text-text">AI Features</h3>
          <ul className="mt-3 space-y-2">
            {AI_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom row */}
      <div className="mx-auto max-w-[1640px] px-4">
        <div className="mt-2 flex flex-col justify-between gap-2 border-t border-border/30 pb-6 pt-4 sm:flex-row sm:items-center">
          <p className="text-xs leading-5 text-muted-foreground">
            © 2025 MyStockVision — Educational research demo. Market data is simulated. Not investment
            advice.
          </p>
          <Badge variant="outline" className="border-brand/40 bg-brand/10 text-brand">
            Beta V3
          </Badge>
        </div>
      </div>
    </footer>
  );
}
