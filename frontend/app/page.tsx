import Link from "next/link";
import { Filter, GitCompareArrows, Heart, Wallet } from "lucide-react";

import { MarketHeatmap } from "@/components/market-heatmap";
import { MarketMoodIndex } from "@/components/market-mood-index";
import { MarketNews } from "@/components/market-news";
import { MarketStatsBar } from "@/components/market-stats-bar";
import { PopularStocks } from "@/components/popular-stocks";
import { StockSearch } from "@/components/stock-search";
import { TopMovers } from "@/components/top-movers";

const FEATURE_CARDS = [
  {
    href: "/screener",
    icon: Filter,
    gradient: "from-violet-500 to-indigo-500",
    glow: "bg-violet-500/10",
    label: "Stock Screener",
    desc: "Find stocks by filters",
  },
  {
    href: "/watchlist",
    icon: Heart,
    gradient: "from-rose-500 to-pink-500",
    glow: "bg-rose-500/10",
    label: "Watchlist",
    desc: "Track your favorites",
  },
  {
    href: "/compare",
    icon: GitCompareArrows,
    gradient: "from-cyan-500 to-sky-500",
    glow: "bg-cyan-500/10",
    label: "Compare",
    desc: "Side-by-side analysis",
  },
  {
    href: "/portfolio",
    icon: Wallet,
    gradient: "from-amber-500 to-orange-500",
    glow: "bg-amber-500/10",
    label: "Portfolio",
    desc: "Track your holdings & P&L",
  },
] as const;

export default function HomePage() {
  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      {/* Hero Section */}
      <section className="gradient-border relative z-20 overflow-visible rounded-2xl p-5 sm:rounded-[28px] sm:p-8">
        {/* Floating orbs */}
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />

        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-2 w-2 rounded-full bg-success" />
            <p className="text-[10px] uppercase tracking-[0.3em] text-accent sm:text-xs">
              Live Indian Equity Intelligence
            </p>
          </div>
          <h1 className="mt-3 font-[var(--font-space)] text-2xl font-bold leading-tight sm:mt-4 sm:text-4xl md:text-5xl">
            AI-Powered Stock Research
            <br />
            <span className="bg-gradient-to-r from-accent via-amber-500 to-orange-400 bg-clip-text text-transparent">
              For NSE and BSE
            </span>
          </h1>
          <p className="mt-2 max-w-2xl text-xs text-muted sm:mt-3 sm:text-sm md:text-base">
            Analyze fundamentals, risk scoring, sentiment, financial statements, corporate actions,
            and AI-driven returns projection &mdash; all in one unified workspace.
          </p>
          <StockSearch className="mt-4 max-w-3xl sm:mt-6" />

          {/* Quick feature tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {["Smart Score", "Risk Analysis", "AI Chat", "Brokerage Reports", "Live Heatmap"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/50 bg-bg/50 px-2.5 py-1 text-[10px] font-medium text-muted backdrop-blur sm:text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Stocks — client component, renders without blocking the page */}
      <PopularStocks />

      {/* Market Stats Bar */}
      <MarketStatsBar />

      {/* Feature Quick-Access Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FEATURE_CARDS.map(({ href, icon: Icon, gradient, glow, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="glow-card group flex items-center gap-4 rounded-2xl border border-border/70 bg-panel/70 p-4 transition hover:border-accent/40 sm:p-5"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} ${glow} shadow-lg`}
            >
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-[var(--font-space)] text-sm font-bold group-hover:text-accent">
                {label}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{desc}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* Market Mood + Top Movers */}
      <section className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <MarketMoodIndex />
        <TopMovers />
      </section>

      {/* Index Heatmap */}
      <section className="mt-2">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-6 w-1 rounded-full bg-gradient-to-b from-accent to-amber-400" />
          <div>
            <h2 className="text-lg font-bold font-[var(--font-space)] sm:text-xl">Index Heatmap</h2>
            <p className="text-xs text-muted sm:text-sm">All constituents by intraday move, with one-click access to each stock dashboard.</p>
          </div>
        </div>
        <MarketHeatmap />
      </section>

      {/* Market News */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <div className="h-6 w-1 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
          <h2 className="text-lg font-bold font-[var(--font-space)] sm:text-xl">Today&apos;s Market News</h2>
        </div>
        <MarketNews />
      </section>
    </div>
  );
}
