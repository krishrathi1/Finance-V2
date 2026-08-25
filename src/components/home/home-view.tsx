"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  GitCompareArrows,
  Heart,
  Newspaper,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { useApp, usePolling } from "@/lib/store";
import {
  fmtInr,
  fmtPct,
  timeAgo,
  type IndexQuote,
  type MarketOverview,
  type NewsItem,
  type ViewKey,
} from "@/lib/types";
import { ChangePill } from "@/components/shared/change-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { StockSearch } from "@/components/shared/stock-search";
import { cn } from "@/lib/utils";

// ── local payload types ──────────────────────────────────────────────────

type MoverRow = MarketOverview["movers"]["gainers"][number];
type MoodState = MarketOverview["mood"];

interface HeatmapRow {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  marketCapCr: number;
}

interface HeatmapPayload {
  index: IndexQuote | null;
  rows: HeatmapRow[];
  indexName?: string;
  updatedAt?: string;
}

// ── static content ───────────────────────────────────────────────────────

const HERO_TAGS = [
  "Smart Score",
  "Forensic M-Score",
  "Portfolio Doctor",
  "Live Heatmap",
  "AI Reports",
  "Earnings TL;DR",
];

const SPOTLIGHT_PILLARS = [
  {
    icon: BarChart3,
    title: "Research Stack",
    desc: "Fundamentals, technicals, news and AI context in one workflow.",
  },
  {
    icon: ShieldCheck,
    title: "Decision Support",
    desc: "Risk scoring, forensic flags and scenario tools.",
  },
  {
    icon: Newspaper,
    title: "Live Surface",
    desc: "Breadth, movers and breaking news without context switching.",
  },
];

const FEATURE_CARDS: {
  view: ViewKey;
  icon: React.ElementType;
  title: string;
  desc: string;
  badge: string;
  gradient: string;
  surface: string;
  points: string[];
}[] = [
  {
    view: "screener",
    icon: SlidersHorizontal,
    title: "Stock Screener",
    desc: "Scan the full NSE universe by fundamentals, risk and momentum.",
    badge: "50+ filters",
    gradient: "from-violet-500 via-fuchsia-500 to-orange-400",
    surface: "from-violet-500/10 via-fuchsia-500/10 to-orange-400/10",
    points: ["Multi-factor scans", "Fast shortlist building"],
  },
  {
    view: "watchlist",
    icon: Heart,
    title: "Watchlist",
    desc: "Track the stocks you care about with live prices and notes.",
    badge: "Live tracking",
    gradient: "from-rose-500 via-pink-500 to-orange-400",
    surface: "from-rose-500/10 via-pink-500/10 to-orange-400/10",
    points: ["Instant alerts", "Priority monitoring"],
  },
  {
    view: "compare",
    icon: GitCompareArrows,
    title: "Compare Stocks",
    desc: "Head-to-head fundamentals, risk scores and AI context.",
    badge: "AI context",
    gradient: "from-cyan-500 via-teal-400 to-emerald-400",
    surface: "from-cyan-500/10 via-teal-400/10 to-emerald-400/10",
    points: ["Side-by-side metrics", "Faster decisions"],
  },
  {
    view: "portfolio",
    icon: Wallet,
    title: "Portfolio Doctor",
    desc: "Health-check your holdings with live P&L and risk signals.",
    badge: "Risk signals",
    gradient: "from-amber-500 via-orange-500 to-red-400",
    surface: "from-amber-500/10 via-orange-500/10 to-red-400/10",
    points: ["P&L visibility", "Portfolio health check"],
  },
];

const INDEX_TABS: { value: string; label: string }[] = [
  { value: "NIFTY50", label: "NIFTY 50" },
  { value: "SENSEX", label: "SENSEX" },
  { value: "NIFTYBANK", label: "BANK" },
  { value: "NIFTYIT", label: "IT" },
  { value: "NIFTYFMCG", label: "FMCG" },
  { value: "NIFTYPSE", label: "PSU" },
];

const HEAT_LEGEND: { label: string; swatch: string }[] = [
  { label: ">+5%", swatch: "bg-success" },
  { label: "+2–5%", swatch: "bg-success/85" },
  { label: "+0.4–2%", swatch: "bg-success/65" },
  { label: "±0.4%", swatch: "border border-border/60 bg-panel" },
  { label: "-0.4–2%", swatch: "bg-danger/60" },
  { label: "-2–5%", swatch: "bg-danger/80" },
  { label: "<-5%", swatch: "bg-danger" },
];

const NEWS_STYLES = [
  "from-orange-500/30 via-amber-500/20",
  "from-emerald-500/30 via-teal-500/20",
  "from-rose-500/30 via-pink-500/20",
  "from-violet-500/30 via-fuchsia-500/20",
  "from-lime-500/30 via-emerald-500/20",
  "from-amber-500/30 via-orange-400/20",
];

function newsStyle(category: string): string {
  const hash = category.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return NEWS_STYLES[hash % NEWS_STYLES.length];
}

function sentimentDot(sentiment: number): string {
  if (sentiment > 0.65) return "bg-success";
  if (sentiment < 0.4) return "bg-danger";
  return "bg-warn";
}

function heatTileClass(pct: number): string {
  if (pct > 5) return "bg-success";
  if (pct > 2) return "bg-success/85";
  if (pct > 0.4) return "bg-success/65";
  if (pct > -0.4) return "border border-border/60 bg-panel";
  if (pct > -2) return "bg-danger/60";
  if (pct > -5) return "bg-danger/80";
  return "bg-danger";
}

// ── main view ────────────────────────────────────────────────────────────

export function HomeView() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await apiGet<MarketOverview>("/api/market/overview"));
    } catch {
      // keep last snapshot
    }
  }, []);

  const loadNews = useCallback(async () => {
    try {
      setNews(await apiGet<NewsItem[]>("/api/market/news"));
    } catch {
      // keep last snapshot
    }
  }, []);

  usePolling(loadOverview, 30000);
  usePolling(loadNews, 120000);

  if (!overview) {
    return <HomeSkeleton />;
  }

  const newestNews = news.length
    ? news.reduce((a, b) => (new Date(a.publishedAt) > new Date(b.publishedAt) ? a : b))
    : null;

  return (
    <div className="stagger-fade space-y-8 sm:space-y-10">
      <HeroSection overview={overview} />

      {/* b) Market stats bar */}
      <section aria-label="Index snapshot">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {overview.indices.map((idx) => (
            <article
              key={idx.symbol}
              className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
            >
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {idx.name}
              </p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums text-text">
                {idx.price.toLocaleString("en-IN")}
              </p>
              <div className="mt-1">
                <ChangePill value={idx.changePercent} size="xs" withValue={idx.change} />
              </div>
            </article>
          ))}
          <article className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Market Breadth
            </p>
            <p className="mt-1.5 text-sm font-semibold tabular-nums">
              <span className="text-success">{overview.stats.advancing} ▲</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-danger">{overview.stats.declining} ▼</span>
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Avg {fmtPct(overview.stats.averageChange)}
            </p>
          </article>
        </div>
      </section>

      {/* c) Feature cards */}
      <section aria-label="Research shortcuts">
        <SectionHeading kicker="Quick Access" title="Research Shortcuts" />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {FEATURE_CARDS.map((card) => (
            <FeatureCard key={card.view} card={card} />
          ))}
        </div>
      </section>

      {/* d) Mood + movers */}
      <section className="grid gap-4 lg:grid-cols-[320px_1fr]" aria-label="Market mood and top movers">
        <MarketMoodCard mood={overview.mood} updatedAt={overview.updatedAt} />
        <TopMoversCard movers={overview.movers} />
      </section>

      {/* e) Heatmap */}
      <HeatmapSection />

      {/* f) News */}
      <section aria-label="Market news">
        <SectionHeading
          kicker="Market News"
          title="Breaking Market Context"
          right={
            newestNews ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                Updated {timeAgo(newestNews.publishedAt)}
              </span>
            ) : undefined
          }
        />
        {news.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-[24px] border border-border/50 bg-panel/60 shimmer"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : (
          <div className="news-grid-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.slice(0, 6).map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* g) Closing / SEO */}
      <ClosingSection />
    </div>
  );
}

// ── a) hero ──────────────────────────────────────────────────────────────

function HeroSection({ overview }: { overview: MarketOverview }) {
  const setView = useApp((s) => s.setView);

  const moodClass =
    overview.mood.level === "Extreme Greed" || overview.mood.level === "Greed"
      ? "text-success"
      : "text-warn";

  return (
    <section className="gradient-border relative z-30 overflow-visible rounded-[28px] px-5 py-6 sm:px-8 sm:py-10 lg:px-10">
      {/* backdrop orbs */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>
      <div
        className="absolute inset-x-[18%] top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent"
        aria-hidden="true"
      />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,420px)] lg:items-end">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-bg/60 px-3 py-1.5 backdrop-blur">
            <span className="pulse-dot h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">
              Live Indian Equity Intelligence
            </span>
          </span>

          <h1 className="mt-5 font-display text-[clamp(2.2rem,5.5vw,4.8rem)] font-bold leading-[0.98] tracking-[-0.04em] text-text">
            Institutional-grade
            <span className="block bg-gradient-to-r from-brand via-amber-400 to-orange-400 bg-clip-text text-transparent">
              stock research
            </span>
            <span className="block text-text/90">for Indian markets.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Screen, compare, validate and monitor NSE and BSE ideas with live market context, forensic
            accounting flags, and AI-assisted research built for daily use.
          </p>

          <StockSearch className="mt-6 max-w-3xl" />

          <div className="mt-6 flex flex-wrap gap-2">
            {HERO_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="border-border/55 bg-bg/65 text-muted-foreground"
              >
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Coverage
              </p>
              <p className="mt-1.5 font-display text-lg font-bold text-brand">
                {overview.stats.universeCount} NSE stocks
              </p>
            </div>
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Research Modes
              </p>
              <p className="mt-1.5 font-display text-lg font-bold text-success">8+</p>
            </div>
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Market
              </p>
              <p className={cn("mt-1.5 font-display text-lg font-bold", moodClass)}>
                {overview.mood.level}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Right spotlight panel */}
        <motion.aside
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
          className="rounded-[26px] border border-border/55 bg-panel/60 p-4 backdrop-blur-xl sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Command Center
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-text">
                Move from signal to conviction.
              </h2>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/30 bg-brand/10">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {SPOTLIGHT_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="rounded-2xl border border-border/45 bg-bg/50 px-4 py-3.5 transition hover:border-brand/30"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white/10 to-transparent text-brand">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{pillar.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{pillar.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setView("screener")}
              className="shine-btn inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:opacity-95 active:scale-95"
            >
              Open Screener
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setView("portfolio")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-bg/50 px-4 py-2 text-sm font-semibold text-text transition hover:border-brand/40"
            >
              Portfolio View
            </button>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}

// ── c) feature card ──────────────────────────────────────────────────────

function FeatureCard({
  card,
}: {
  card: (typeof FEATURE_CARDS)[number];
}) {
  const setView = useApp((s) => s.setView);
  const Icon = card.icon;

  return (
    <button
      type="button"
      onClick={() => setView(card.view)}
      className="feature-card group relative isolate w-full cursor-pointer overflow-hidden rounded-[24px] border border-border/60 bg-panel/70 p-5 text-left backdrop-blur-sm"
    >
      <span
        className={cn("absolute inset-0 -z-10 bg-gradient-to-br", card.surface)}
        aria-hidden="true"
      />
      <span className="absolute right-4 top-4 rounded-full border border-border/60 bg-bg/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
        {card.badge}
      </span>

      <span
        className={cn(
          "feature-card-icon flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-xl",
          card.gradient
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <h3 className="mt-4 font-display text-lg font-bold text-text transition group-hover:text-brand">
        {card.title}
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.desc}</p>

      <ul className="mt-3 space-y-1.5">
        {card.points.map((point) => (
          <li key={point} className="flex items-center gap-2 text-xs text-text/80">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Open Module
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
          Explore
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </div>
    </button>
  );
}

// ── d) mood + movers ─────────────────────────────────────────────────────

function MarketMoodCard({ mood, updatedAt }: { mood: MoodState; updatedAt: string }) {
  const angle = -90 + (mood.value / 100) * 180;

  const levelClass =
    mood.level === "Extreme Greed" || mood.level === "Greed"
      ? "border-success/40 bg-success/10 text-success"
      : mood.level === "Neutral"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-danger/40 bg-danger/10 text-danger";

  return (
    <article className="rounded-[28px] border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Sentiment
      </p>
      <h2 className="mt-0.5 font-display text-base font-bold text-text sm:text-lg">
        Market Mood Index
      </h2>

      <svg
        viewBox="0 0 200 110"
        className="mt-3 w-full"
        role="img"
        aria-label={`Market mood ${mood.value} out of 100 — ${mood.level}`}
      >
        <defs>
          <linearGradient id="moodGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--danger))" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="hsl(var(--success))" />
          </linearGradient>
        </defs>
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#moodGrad)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="34"
          stroke="hsl(var(--text))"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 100px" }}
        />
        <circle cx="100" cy="100" r="5.5" fill="hsl(var(--text))" />
        <circle cx="100" cy="100" r="2" fill="hsl(var(--panel))" />
      </svg>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-display text-3xl font-bold tabular-nums text-text">
          {mood.value}
          <span className="text-base font-semibold text-muted-foreground">/100</span>
        </p>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold",
            levelClass
          )}
        >
          {mood.level}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <MoodChip label={`Breadth ${mood.advancing}/${mood.declining}`} />
        <MoodChip label={`Score ${mood.breadthScore}`} />
        <MoodChip label={`Momentum ${mood.momentumScore}`} />
        <MoodChip label={timeAgo(updatedAt)} />
      </div>
    </article>
  );
}

function MoodChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border/50 bg-bg/50 px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted-foreground">
      {label}
    </span>
  );
}

function TopMoversCard({ movers }: { movers: MarketOverview["movers"] }) {
  const openStock = useApp((s) => s.openStock);

  return (
    <article className="rounded-[28px] border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Live Action
          </p>
          <h2 className="mt-0.5 font-display text-base font-bold text-text sm:text-lg">
            Top Movers
          </h2>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">Refreshed every 30s</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-5">
        <MoverList
          title="Top Gainers"
          icon={TrendingUp}
          iconClass="text-success"
          rows={movers.gainers}
          onOpen={openStock}
        />
        <MoverList
          title="Top Losers"
          icon={TrendingDown}
          iconClass="text-danger"
          rows={movers.losers}
          onOpen={openStock}
        />
      </div>
    </article>
  );
}

function MoverList({
  title,
  icon: Icon,
  iconClass,
  rows,
  onOpen,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  rows: MoverRow[];
  onOpen: (symbol: string) => void;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className={cn("h-4 w-4", iconClass)} aria-hidden="true" />
        {title}
      </h3>
      <ul className="mt-2 space-y-1">
        {rows.map((row, i) => (
          <li key={row.symbol}>
            <button
              type="button"
              onClick={() => onOpen(row.symbol)}
              aria-label={`Open ${row.name} (${row.symbol})`}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition hover:bg-brand/8"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{row.symbol}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.name}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmtInr(row.price)}
                </span>
                <ChangePill value={row.changePercent} size="xs" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── e) heatmap ───────────────────────────────────────────────────────────

function HeatmapSection() {
  const [indexKey, setIndexKey] = useState("NIFTY50");
  const [data, setData] = useState<HeatmapPayload | null>(null);
  const openStock = useApp((s) => s.openStock);

  // Fetcher keyed explicitly so tab clicks can fetch the new index directly
  // (event handlers) while polling keeps hitting the latest selection via ref.
  const loadRef = useRef<() => void>(() => {});
  const selectedRef = useRef(indexKey);

  const loadFor = useCallback(async (key: string) => {
    try {
      const res = await apiGet<HeatmapPayload>(`/api/market/heatmap?index=${key}`);
      if (selectedRef.current === key) setData(res);
    } catch {
      // keep last snapshot
    }
  }, []);

  const load = useCallback(() => loadFor(indexKey), [indexKey, loadFor]);

  useEffect(() => {
    loadRef.current = load;
    selectedRef.current = indexKey;
  }, [load, indexKey]);

  usePolling(() => {
    loadRef.current();
  }, 30000);

  const selectIndex = (next: string) => {
    setIndexKey(next);
    selectedRef.current = next;
    loadFor(next);
  };

  return (
    <section aria-label="Index heatmap">
      <SectionHeading
        icon={BarChart3}
        kicker="Index Heatmap"
        title="Live Sector Heatmap"
        right={
          <div className="flex flex-wrap justify-end gap-1.5">
            {INDEX_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => selectIndex(tab.value)}
                aria-pressed={indexKey === tab.value}
                className={cn(
                  "min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                  indexKey === tab.value
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-border/60 bg-panel/60 text-muted-foreground hover:border-brand/30 hover:text-text"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="rounded-[28px] border border-border/50 bg-panel/50 p-4 backdrop-blur-sm sm:p-5">
        {/* legend + index quote */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5" aria-label="Heatmap color legend">
            {HEAT_LEGEND.map((step) => (
              <span key={step.label} className="flex items-center gap-1">
                <span className={cn("h-2.5 w-2.5 rounded-[3px]", step.swatch)} aria-hidden="true" />
                <span className="text-[10px] tabular-nums text-muted-foreground">{step.label}</span>
              </span>
            ))}
          </div>
          {data?.index && (
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {data.indexName ?? data.index.name}
              </span>
              <span className="font-display text-sm font-bold tabular-nums text-text">
                {data.index.price.toLocaleString("en-IN")}
              </span>
              <ChangePill value={data.index.changePercent} size="xs" />
            </span>
          )}
        </div>

        {/* tiles */}
        {!data ? (
          <div className="mt-4 grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="h-[62px] rounded-xl shimmer"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
            {data.rows.map((row) => {
              const neutral = row.changePercent >= -0.4 && row.changePercent <= 0.4;
              return (
                <button
                  key={row.symbol}
                  type="button"
                  onClick={() => openStock(row.symbol)}
                  aria-label={`${row.name} ${fmtPct(row.changePercent)}`}
                  className={cn(
                    "rounded-xl p-2.5 text-left transition hover:scale-[1.03] hover:ring-2 hover:ring-white/40",
                    heatTileClass(row.changePercent),
                    neutral ? "text-text" : "text-white"
                  )}
                >
                  <span className="block truncate text-[11px] font-bold">{row.symbol}</span>
                  <span className="block text-[11px] font-semibold tabular-nums">
                    {fmtPct(row.changePercent)}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-[10px] tabular-nums",
                      neutral ? "text-muted-foreground" : "text-white/80"
                    )}
                  >
                    {fmtInr(row.price, 0)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── f) news ──────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  const openStock = useApp((s) => s.openStock);

  return (
    <article className="group overflow-hidden rounded-[24px] border border-border/50 bg-panel/60 backdrop-blur-sm transition hover:border-brand/30">
      <div className={cn("relative h-32 bg-gradient-to-br", newsStyle(item.category))}>
        <span
          className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold text-white/40"
          aria-hidden="true"
        >
          {item.category.charAt(0).toUpperCase()}
        </span>
        <span
          className={cn("absolute right-3 top-3 h-2 w-2 rounded-full", sentimentDot(item.sentiment))}
          role="img"
          aria-label={
            item.sentiment > 0.65
              ? "Positive sentiment"
              : item.sentiment < 0.4
                ? "Negative sentiment"
                : "Neutral sentiment"
          }
        />
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border/60 bg-bg/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.category}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-brand">
            {item.source}
          </span>
        </div>

        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-text transition group-hover:text-brand">
          {item.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{timeAgo(item.publishedAt)}</span>
          {item.symbols.length > 0 && (
            <button
              type="button"
              onClick={() => openStock(item.symbols[0])}
              aria-label={`Open ${item.symbols[0]} research view`}
              className="rounded-md border border-border/60 bg-bg/60 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground transition hover:border-brand/40 hover:text-brand"
            >
              {item.symbols[0]}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ── g) closing / SEO ─────────────────────────────────────────────────────

const WORKFLOWS: { title: string; desc: string; view: ViewKey }[] = [
  {
    title: "Find undervalued or high-dividend stocks",
    desc: "Filter the NSE universe by valuation, yield and quality in seconds.",
    view: "screener",
  },
  {
    title: "Compare two stocks side by side",
    desc: "Metrics, risk scores and AI context in a single view.",
    view: "compare",
  },
  {
    title: "Review your holdings and portfolio risk",
    desc: "Track P&L, concentration and health signals as the market moves.",
    view: "portfolio",
  },
  {
    title: "Track upcoming and recent IPOs",
    desc: "GMP, subscription status and listing gains in one place.",
    view: "ipo",
  },
];

function ClosingSection() {
  const setView = useApp((s) => s.setView);

  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="About MyStockVision">
      <article className="rounded-[28px] border border-border/45 bg-panel/40 p-6 backdrop-blur-sm sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">
          Why MyStockVision
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-text">
          Research Indian stocks faster with one finance workflow.
        </h2>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Every stock brings price action, quality, valuation and AI context into the same workflow —
          so you research an idea once, with everything you need on one page instead of six browser
          tabs.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Move between modules without friction: screen the universe, save ideas to your watchlist,
          compare head-to-head, stress-test your portfolio, track IPOs and arm price alerts — all
          against live NSE and BSE market data.
        </p>
      </article>

      <article className="rounded-[28px] border border-border/45 bg-panel/40 p-6 backdrop-blur-sm sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">
          Guided Paths
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-text">Popular Workflows</h2>
        <div className="mt-5 space-y-2.5">
          {WORKFLOWS.map((flow) => (
            <button
              key={flow.view}
              type="button"
              onClick={() => setView(flow.view)}
              className="flex min-h-9 w-full items-center justify-between gap-3 rounded-2xl border border-border/45 bg-bg/50 px-4 py-3 text-left transition hover:border-brand/30"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">{flow.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {flow.desc}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

// ── loading skeleton ─────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="stagger-fade space-y-8 sm:space-y-10" aria-busy="true" aria-label="Loading market data">
      <section className="rounded-[28px] border border-border/50 bg-panel/40 px-5 py-6 sm:px-8 sm:py-10 lg:px-10">
        <div className="shimmer h-7 w-64 rounded-full" />
        <div className="mt-6 shimmer h-12 w-4/5 rounded-xl sm:h-16" />
        <div className="mt-3 shimmer h-12 w-3/5 rounded-xl sm:h-16" />
        <div className="mt-6 shimmer h-11 max-w-3xl rounded-2xl" />
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="shimmer h-20 rounded-2xl" />
          <div className="shimmer h-20 rounded-2xl" />
          <div className="shimmer h-20 rounded-2xl" />
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="shimmer h-24 rounded-2xl" />
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="shimmer h-80 rounded-[28px]" />
        <div className="shimmer h-80 rounded-[28px]" />
      </section>
    </div>
  );
}
