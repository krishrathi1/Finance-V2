import Link from "next/link";
import { ArrowRight, Filter, GitCompareArrows, Heart, Wallet } from "lucide-react";

import { MarketHeatmap } from "@/components/market-heatmap";
import { MarketMoodIndex } from "@/components/market-mood-index";
import { MarketNews } from "@/components/market-news";
import { MarketStatsBar } from "@/components/market-stats-bar";
import { PopularStocks } from "@/components/popular-stocks";
import { StockSearch } from "@/components/stock-search";
import { TopMovers } from "@/components/top-movers";
import { ViewportMotionSection } from "@/components/viewport-motion-section";
import { Badge } from "@/components/ui/badge";

const FEATURE_CARDS = [
  {
    href: "/screener",
    icon: Filter,
    gradient: "from-violet-500 to-indigo-500",
    shadow: "shadow-violet-500/25",
    bg: "from-violet-500/8 to-indigo-500/5",
    label: "Stock Screener",
    desc: "Filter NSE & BSE stocks by PE, market cap, sector, and 30+ metrics instantly.",
    badge: "50+ filters",
  },
  {
    href: "/watchlist",
    icon: Heart,
    gradient: "from-rose-500 to-pink-500",
    shadow: "shadow-rose-500/25",
    bg: "from-rose-500/8 to-pink-500/5",
    label: "Watchlist",
    desc: "Track your favourite stocks with live prices and instant alerts.",
    badge: "Live prices",
  },
  {
    href: "/compare",
    icon: GitCompareArrows,
    gradient: "from-cyan-500 to-sky-500",
    shadow: "shadow-cyan-500/25",
    bg: "from-cyan-500/8 to-sky-500/5",
    label: "Compare",
    desc: "Side-by-side valuation, profitability and Smart Score comparison.",
    badge: "AI analysis",
  },
  {
    href: "/portfolio",
    icon: Wallet,
    gradient: "from-amber-500 to-orange-500",
    shadow: "shadow-amber-500/25",
    bg: "from-amber-500/8 to-orange-500/5",
    label: "Portfolio",
    desc: "Track holdings, monitor P&L, and get AI risk assessment of your portfolio.",
    badge: "AI risk score",
  },
] as const;

const FEATURE_TAGS = [
  "Smart Score™",
  "Risk Analysis",
  "AI Chat",
  "Brokerage Reports",
  "Live Heatmap",
  "Earnings TL;DR",
  "Portfolio Doctor",
];

export default function HomePage() {
  return (
    <div className="stagger-fade space-y-8 py-4 sm:space-y-10 sm:py-8">

      {/* ── Hero ── */}
      <ViewportMotionSection
        className="gradient-border relative z-30 rounded-2xl p-6 sm:rounded-[28px] sm:p-10 md:p-14"
        style={{ overflow: "visible" }}
      >
        {/* Decorative orbs clipped inside hero */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>

        <div className="relative z-10 max-w-3xl">
          {/* Live badge */}
          <div className="mb-4 flex items-center gap-2">
            <span className="pulse-dot h-2 w-2 rounded-full bg-success" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent sm:text-xs">
              Live Indian Equity Intelligence
            </p>
          </div>

          {/* Headline */}
          <h1 className="font-[var(--font-space)] text-3xl font-bold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl">
            AI-Powered Stock Research
            <br />
            <span className="bg-gradient-to-r from-accent via-amber-400 to-orange-400 bg-clip-text text-transparent">
              For NSE &amp; BSE
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-7 text-muted sm:text-base">
            Analyse fundamentals, risk scores, AI sentiment, financial statements, brokerage reports,
            and returns projections — all in one unified workspace.
          </p>

          {/* Search */}
          <div className="mt-6 sm:mt-8">
            <StockSearch className="max-w-2xl" />
            <p className="mt-2 text-[11px] text-muted/70">
              Search any NSE / BSE stock — e.g. RELIANCE, HDFCBANK, INFY
            </p>
          </div>

          {/* Feature tags */}
          <div className="mt-5 flex flex-wrap gap-2">
            {FEATURE_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="border-border/50 bg-bg/60 text-[10px] font-semibold backdrop-blur sm:text-xs"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </ViewportMotionSection>

      {/* ── Popular Stocks ── */}
      <PopularStocks />

      {/* ── Sticky Market Stats Bar ── */}
      <section className="sticky top-[5.4rem] z-20 rounded-2xl border border-border/40 bg-bg/75 p-2 backdrop-blur-xl sm:top-[6.2rem]">
        <MarketStatsBar />
      </section>

      {/* ── Feature Quick-Access Cards ── */}
      <section>
        <div className="mb-5 flex items-center gap-3">
          <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-accent to-amber-400" />
          <h2 className="font-[var(--font-space)] text-base font-bold sm:text-lg">Quick Access</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURE_CARDS.map(({ href, icon: Icon, gradient, shadow, bg, label, desc, badge }) => (
            <Link
              key={href}
              href={href}
              className={`feature-card group flex flex-col gap-4 rounded-2xl border border-border/60 bg-gradient-to-br ${bg} bg-panel/60 p-5 backdrop-blur-sm`}
            >
              {/* Icon + badge row */}
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg ${shadow}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-semibold text-muted backdrop-blur">
                  {badge}
                </span>
              </div>

              {/* Label + desc */}
              <div className="flex-1">
                <p className="font-[var(--font-space)] text-sm font-bold group-hover:text-accent sm:text-base">
                  {label}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">{desc}</p>
              </div>

              {/* CTA arrow */}
              <div className="flex items-center gap-1 text-xs font-semibold text-accent opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100">
                Explore <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Market Mood + Top Movers ── */}
      <section className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <MarketMoodIndex />
        <TopMovers />
      </section>

      {/* ── Index Heatmap ── */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-accent to-amber-400" />
          <div>
            <h2 className="font-[var(--font-space)] text-base font-bold sm:text-lg">Index Heatmap</h2>
            <p className="text-xs text-muted">All constituents by intraday move — click any cell to open the stock dashboard.</p>
          </div>
        </div>
        <MarketHeatmap />
      </section>

      {/* ── Market News ── */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
          <h2 className="font-[var(--font-space)] text-base font-bold sm:text-lg">
            Today&apos;s Market News
          </h2>
        </div>
        <MarketNews />
      </section>
    </div>
  );
}
