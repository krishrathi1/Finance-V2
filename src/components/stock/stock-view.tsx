"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, ChevronRight, Heart, Plus, Search, SearchX } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useApp, usePolling } from "@/lib/store";
import { fmtInr, fmtPct, fmtVolume, timeAgo } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChangePill } from "@/components/shared/change-pill";
import { MarketStatusBadge } from "@/components/shared/market-status";
import { StockSearch } from "@/components/shared/stock-search";
import { StockAiPanel } from "@/components/ai/stock-ai-panel";
import { PriceChartCard } from "./price-chart";
import { MetricsGrid } from "./metrics-grid";
import { ScoreCards } from "./score-cards";
import { ForensicsSection } from "./forensics-section";
import { FinancialsSection } from "./financials-section";
import { ShareholdingSection } from "./shareholding-section";
import { TechnicalsSection } from "./technicals-section";
import { StockNewsSection } from "./news-section";
import { CompetitorsSection } from "./competitors-section";
import { clamp, pctClass } from "./helpers";

const SECTION_TABS = [
  { id: "overview", label: "Overview" },
  { id: "scores", label: "Scores" },
  { id: "forensics", label: "Forensics" },
  { id: "financials", label: "Financials" },
  { id: "shareholding", label: "Shareholding" },
  { id: "technicals", label: "Technicals" },
  { id: "news", label: "News" },
  { id: "ai", label: "AI Research" },
] as const;

/**
 * Stock detail view — hero quote, sticky sidebar (chart / 52W / day stats /
 * returns) and a tabbed section stack (fundamentals → AI research).
 * Renders an empty-search state when no symbol is active.
 */
export function StockView() {
  const symbol = useApp((s) => s.stockSymbol);
  const setView = useApp((s) => s.setView);

  if (!symbol) return <EmptyStockState />;

  // Keyed by symbol so navigating between stocks resets all fetch state.
  return <StockDetail key={symbol} symbol={symbol} onBackHome={() => setView("home")} />;
}

function StockDetail({ symbol, onBackHome }: { symbol: string; onBackHome: () => void }) {
  const setView = useApp((s) => s.setView);
  const watchlist = useApp((s) => s.watchlist);
  const addToWatchlist = useApp((s) => s.addToWatchlist);
  const removeFromWatchlist = useApp((s) => s.removeFromWatchlist);

  const [dash, setDash] = useState<StockDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>("overview");

  // Latest-fetcher ref so the 30s poll always uses the current symbol, plus a
  // small throttle to dedupe the mount-time fetch with usePolling's first tick.
  const fetchRef = useRef<() => void>(() => {});
  const lastFetchRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const doFetch = (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastFetchRef.current < 2000) return;
      lastFetchRef.current = now;
      apiGet<StockDashboard>(`/api/stocks/${encodeURIComponent(symbol)}`)
        .then((data) => {
          if (cancelled) return;
          setDash(data);
          setError(null);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to load stock");
          setLoading(false);
        });
    };

    fetchRef.current = () => doFetch(false);
    doFetch(true);
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Poll the dashboard every 30s (skips hidden tabs).
  usePolling(() => fetchRef.current(), 30000);

  // Highlight the section currently in view.
  useEffect(() => {
    if (!dash) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 }
    );
    for (const tab of SECTION_TABS) {
      const el = document.getElementById(tab.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [dash]);

  if (loading && !dash) return <StockViewSkeleton />;
  if (!dash) return <StockErrorState symbol={symbol} error={error} onBack={onBackHome} />;

  const watching = watchlist.some((w) => w.symbol === dash.symbol);

  const toggleWatchlist = () => {
    if (watching) {
      void removeFromWatchlist(dash.symbol);
    } else {
      void addToWatchlist(dash.symbol);
    }
  };

  const jumpTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="stagger-fade space-y-6" data-testid="stock-view">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        aria-label={`${dash.companyName} quote`}
        className="rounded-[28px] border border-border/50 bg-panel/60 p-5 backdrop-blur-sm sm:p-6"
      >
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setView("home")}
            className="rounded px-1.5 py-1 font-medium text-muted-foreground transition hover:text-brand"
          >
            Home
          </button>
          <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
          <button
            type="button"
            className="rounded px-1.5 py-1 font-medium text-muted-foreground transition hover:text-brand"
          >
            Stocks
          </button>
          <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
          <span className="px-1.5 py-1 text-xs font-semibold text-muted-foreground">{dash.symbol}</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
              {dash.exchange} EQUITY · {dash.sector}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
                {dash.companyName}
              </h1>
              <span className="rounded-md border border-border/60 bg-bg/60 px-2 py-0.5 text-sm font-semibold text-muted-foreground">
                {dash.symbol}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{dash.industry}</p>
          </div>

          <div className="text-right">
            <p className="font-display text-3xl font-bold tabular-nums text-text sm:text-4xl">
              {fmtInr(dash.quote.price)}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <ChangePill size="md" value={dash.quote.changePercent} withValue={dash.quote.change} />
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <span className="text-[10px] text-muted-foreground">
                as of {timeAgo(dash.quote.asOf)}
              </span>
              <MarketStatusBadge compact />
            </div>
          </div>
        </div>
      </section>

      {/* ── Action bar ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2" aria-label="Stock actions">
        <button
          type="button"
          onClick={toggleWatchlist}
          aria-pressed={watching}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
            watching
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border/60 text-muted-foreground hover:border-brand/40 hover:text-text"
          )}
        >
          <Heart className={cn("h-4 w-4", watching && "fill-current")} />
          {watching ? "Watching" : "Watchlist"}
        </button>
        <button
          type="button"
          onClick={() => setView("alerts")}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-brand/40 hover:text-text"
        >
          <Bell className="h-4 w-4" />
          Set Alert
        </button>
        <button
          type="button"
          onClick={() => setView("portfolio")}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-brand/40 hover:text-text"
        >
          <Plus className="h-4 w-4" />
          Add to Portfolio
        </button>
      </div>

      {/* ── Main grid ────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:gap-8">
        {/* Left sidebar */}
        <aside
          aria-label="Quote sidebar"
          className="space-y-4 self-start lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-2 lg:pr-1"
        >
          <PriceChartCard symbol={dash.symbol} />
          <Range52Card d={dash} />
          <TodayStatsCard d={dash} />
          <ReturnsStripCard d={dash} />
        </aside>

        {/* Right content */}
        <div className="min-w-0 space-y-10">
          {/* Sticky section tab nav */}
          <nav
            aria-label="Stock sections"
            className="sticky top-[4.6rem] z-20 -mx-1 rounded-2xl border border-border/40 bg-bg/80 px-1 py-2 backdrop-blur-xl"
          >
            <div className="flex gap-1 overflow-x-auto" role="tablist">
              {SECTION_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === tab.id}
                  onClick={() => jumpTo(tab.id)}
                  className={cn(
                    "min-h-9 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-medium transition",
                    activeSection === tab.id
                      ? "bg-brand text-white shadow-lg shadow-brand/20"
                      : "text-muted-foreground hover:bg-panel/70 hover:text-text"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <section id="overview" aria-label="Overview" className="scroll-mt-40">
            <MetricsGrid d={dash} />
            <div className="mt-8">
              <CompetitorsSection d={dash} />
            </div>
          </section>

          <section id="scores" aria-label="Scores" className="scroll-mt-40">
            <ScoreCards d={dash} />
          </section>

          <section id="forensics" aria-label="Forensics" className="scroll-mt-40">
            <ForensicsSection d={dash} />
          </section>

          <section id="financials" aria-label="Financials" className="scroll-mt-40">
            <FinancialsSection d={dash} />
          </section>

          <section id="shareholding" aria-label="Shareholding" className="scroll-mt-40">
            <ShareholdingSection d={dash} />
          </section>

          <section id="technicals" aria-label="Technicals" className="scroll-mt-40">
            <TechnicalsSection d={dash} />
          </section>

          <section id="news" aria-label="News" className="scroll-mt-40">
            <StockNewsSection d={dash} />
          </section>

          <section id="ai" aria-label="AI Research" className="scroll-mt-40">
            <StockAiPanel symbol={dash.symbol} />
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── Sidebar cards ─────────────────────────────────────────── */

function Range52Card({ d }: { d: StockDashboard }) {
  const { price, high52, low52 } = d.quote;
  const span = high52 - low52;
  const pos = span > 0 ? clamp(((price - low52) / span) * 100, 0, 100) : 50;

  return (
    <div
      className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
      aria-label="52-week range"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        52-Week Range
      </p>
      <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{fmtInr(low52)}</span>
        <span>{fmtInr(high52)}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-muted">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-amber-400 to-lime-400"
          style={{ width: `${pos}%` }}
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-panel bg-brand shadow"
          style={{ left: `calc(${pos}% - 7px)` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Now <span className="font-semibold tabular-nums text-text">{fmtInr(price)}</span>
      </p>
    </div>
  );
}

function TodayStatsCard({ d }: { d: StockDashboard }) {
  const q = d.quote;
  const cells: { label: string; value: string; valueClass?: string }[] = [
    { label: "Open", value: fmtInr(q.dayOpen) },
    { label: "Prev Close", value: fmtInr(q.prevClose) },
    { label: "Volume", value: fmtVolume(q.volume) },
    { label: "Day High", value: fmtInr(q.dayHigh), valueClass: "text-success" },
    { label: "Day Low", value: fmtInr(q.dayLow), valueClass: "text-danger" },
    {
      label: "Circuit Range",
      value: `${fmtInr(d.circuit.lower, 0)} – ${fmtInr(d.circuit.upper, 0)}`,
    },
  ];

  return (
    <div
      className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
      aria-label="Today's statistics"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Today
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 text-sm font-semibold tabular-nums", c.valueClass ?? "text-text")}>
              {c.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReturnsStripCard({ d }: { d: StockDashboard }) {
  return (
    <div
      className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
      aria-label="Returns"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Returns
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {d.returns.map((r) => (
          <div key={r.label}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{r.label}</p>
            <p className={cn("mt-1 text-sm font-semibold tabular-nums", pctClass(r.value))}>
              {fmtPct(r.value, 1)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── States ────────────────────────────────────────────────── */

function EmptyStockState() {
  return (
    <div
      data-testid="stock-empty"
      className="mx-auto max-w-xl rounded-[28px] border border-border/50 bg-panel/60 p-8 text-center backdrop-blur-sm sm:p-10"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-bg/60">
        <Search className="h-7 w-7 text-brand" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-text">Search a stock to begin</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Look up any NSE-listed company to see live quotes, AI scores, forensic checks, financials and
        an AI research brief.
      </p>
      <div className="mt-6">
        <StockSearch autoFocus />
      </div>
    </div>
  );
}

function StockErrorState({
  symbol,
  error,
  onBack,
}: {
  symbol: string;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div
      data-testid="stock-error"
      className="mx-auto max-w-lg rounded-[28px] border border-danger/30 bg-panel/60 p-8 text-center backdrop-blur-sm sm:p-10"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10">
        <SearchX className="h-7 w-7 text-danger" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-text">Stock {symbol} not found</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {error ?? "It is not part of the tracked NSE universe."}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:opacity-95 active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </button>
    </div>
  );
}

function StockViewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading stock data">
      <div className="shimmer h-44 rounded-[28px] border border-border/50" />
      <div className="flex gap-2">
        <div className="shimmer h-11 w-32 rounded-xl" />
        <div className="shimmer h-11 w-28 rounded-xl" />
        <div className="shimmer h-11 w-40 rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:gap-8">
        <div className="space-y-4">
          <div className="shimmer h-72 rounded-2xl" />
          <div className="shimmer h-32 rounded-2xl" />
          <div className="shimmer h-36 rounded-2xl" />
        </div>
        <div className="space-y-8">
          <div className="shimmer h-12 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer h-24 rounded-2xl" />
            ))}
          </div>
          <div className="shimmer h-56 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
