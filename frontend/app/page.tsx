import { MarketHeatmap } from "@/components/market-heatmap";
import { MarketMoodIndex } from "@/components/market-mood-index";
import { MarketNews } from "@/components/market-news";
import { MarketStatsBar } from "@/components/market-stats-bar";
import { StockSearch } from "@/components/stock-search";
import { TopMovers } from "@/components/top-movers";

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

      {/* Market Stats Bar */}
      <MarketStatsBar />

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
