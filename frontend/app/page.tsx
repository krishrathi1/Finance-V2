import { MarketHeatmap } from "@/components/market-heatmap";
import { MarketNews } from "@/components/market-news";
import { StockSearch } from "@/components/stock-search";

export default function HomePage() {
  return (
    <div className="space-y-8 py-8">
      <section className="rounded-[28px] border border-border/70 bg-panel/70 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Indian Equity Intelligence</p>
        <h1 className="mt-3 font-[var(--font-space)] text-4xl font-bold md:text-5xl">AI Stock Research For NSE and BSE</h1>
        <p className="mt-3 max-w-3xl text-sm text-muted md:text-base">
          Analyze fundamentals, risk, sentiment, financial statements, corporate actions, and returns projection with one integrated fintech workspace.
        </p>
        <StockSearch className="mt-6 max-w-3xl" />
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
