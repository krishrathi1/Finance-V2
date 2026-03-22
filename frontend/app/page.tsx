import { MarketHeatmap } from "@/components/market-heatmap";
import { MarketNews } from "@/components/market-news";
import { StockSearch } from "@/components/stock-search";

export default function HomePage() {
  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      <section className="relative z-20 overflow-visible rounded-2xl border border-border/70 bg-panel/70 p-4 sm:rounded-[28px] sm:p-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-accent sm:text-xs">Indian Equity Intelligence</p>
        <h1 className="mt-2 font-[var(--font-space)] text-2xl font-bold sm:mt-3 sm:text-4xl md:text-5xl">AI Stock Research For NSE and BSE</h1>
        <p className="mt-2 max-w-3xl text-xs text-muted sm:mt-3 sm:text-sm md:text-base">
          Analyze fundamentals, risk, sentiment, financial statements, corporate actions, and returns projection with one integrated fintech workspace.
        </p>
        <StockSearch className="mt-4 max-w-3xl sm:mt-6" />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xl font-bold font-[var(--font-space)]">Index Heatmap</h2>
        <p className="mb-4 text-sm text-muted">All constituents by intraday move, with one-click access to each stock dashboard.</p>
        <MarketHeatmap />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold font-[var(--font-space)]">Today&apos;s Market News</h2>
        <MarketNews />
      </section>
    </div>
  );
}
