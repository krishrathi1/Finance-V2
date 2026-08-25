import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Filter,
  GitCompareArrows,
  Heart,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { MarketHeatmap } from "@/components/market-heatmap";
import { MarketStatusBadge } from "@/components/market-status-badge";
import { MarketMoodIndex } from "@/components/market-mood-index";
import { MarketNews } from "@/components/market-news";
import { MarketStatsBar } from "@/components/market-stats-bar";
import { FaqSection } from "@/components/seo/faq-section";
import { StockSearch } from "@/components/stock-search";
import { TopMovers } from "@/components/top-movers";
import { ViewportMotionSection } from "@/components/viewport-motion-section";
import { Badge } from "@/components/ui/badge";
import { SITE_NAME, SITE_URL } from "@/shared/seo";

const FEATURE_CARDS = [
  {
    href: "/screener",
    icon: Filter,
    gradient: "from-violet-500 via-fuchsia-500 to-indigo-500",
    surface: "from-violet-500/14 via-violet-500/8 to-transparent",
    label: "Stock Screener",
    desc: "Filter NSE and BSE stocks across valuation, growth, momentum, and quality in seconds.",
    badge: "50+ filters",
    points: ["Multi-factor scans", "Fast shortlist building"],
  },
  {
    href: "/watchlist",
    icon: Heart,
    gradient: "from-rose-500 via-pink-500 to-orange-400",
    surface: "from-rose-500/14 via-pink-500/7 to-transparent",
    label: "Watchlist",
    desc: "Monitor your highest-conviction names with live prices, alerts, and one-click review.",
    badge: "Live tracking",
    points: ["Instant alerts", "Priority monitoring"],
  },
  {
    href: "/compare",
    icon: GitCompareArrows,
    gradient: "from-cyan-500 via-sky-500 to-blue-500",
    surface: "from-cyan-500/14 via-sky-500/8 to-transparent",
    label: "Compare Stocks",
    desc: "Put profitability, valuations, and Smart Scores side by side before making a call.",
    badge: "AI context",
    points: ["Side-by-side metrics", "Faster decision making"],
  },
  {
    href: "/portfolio",
    icon: Wallet,
    gradient: "from-amber-500 via-orange-500 to-red-400",
    surface: "from-amber-500/14 via-orange-500/8 to-transparent",
    label: "Portfolio Doctor",
    desc: "Track holdings, portfolio risk, and AI commentary without leaving the dashboard.",
    badge: "Risk signals",
    points: ["P&L visibility", "Portfolio health check"],
  },
] as const;

const FEATURE_TAGS = [
  "Smart Score",
  "Risk Analysis",
  "Brokerage Reports",
  "Live Heatmap",
  "Earnings TL;DR",
  "Portfolio Doctor",
];

const HERO_PILLARS = [
  {
    icon: BarChart3,
    label: "Research Stack",
    value: "Fundamentals, technicals, news, and AI context in one workflow.",
  },
  {
    icon: ShieldCheck,
    label: "Decision Support",
    value: "Risk scoring, score validation, and scenario tools for faster conviction.",
  },
  {
    icon: Newspaper,
    label: "Live Surface",
    value: "Track market breadth, movers, and breaking news without context switching.",
  },
] as const;

const HERO_METRICS = [
  { label: "Coverage", value: "NSE + BSE", tone: "text-accent" },
  { label: "Research Modes", value: "8+", tone: "text-success" },
  { label: "Workflow", value: "Live + AI", tone: "text-sky-500" },
] as const;

export default function HomePage() {
  const homeFaqs = [
    {
      question: "What can I research on MyStockVision?",
      answer:
        "You can research Indian stocks with live price context, Smart Scores, risk ratings, financial statements, peer comparison, IPO tracking, portfolio analysis, and stock screener workflows for NSE and BSE companies.",
    },
    {
      question: "Does MyStockVision cover NSE and BSE stocks?",
      answer:
        "Yes. The platform is built for Indian equity research and supports NSE and BSE market workflows, including stock pages, screening, comparison, IPO tracking, alerts, and portfolio analysis.",
    },
    {
      question: "Can I use MyStockVision for stock screening and comparison?",
      answer:
        "Yes. The screener page helps you filter stocks by valuation, market cap, dividend yield, and sector, while the compare page helps you review two stocks side by side using price, profitability, Smart Score, and risk views.",
    },
    {
      question: "Is MyStockVision free to use?",
      answer:
        "The current web application is positioned as a free research platform for investors who want faster stock analysis, market monitoring, and portfolio review workflows.",
    },
  ];

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${SITE_NAME} home`,
        url: SITE_URL,
        description:
          "Home page for AI-powered Indian stock analysis, stock screener tools, portfolio tracking, and IPO research.",
      },
      {
        "@type": "ItemList",
        name: "Core stock market tools",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Stock Screener", url: `${SITE_URL}/screener` },
          { "@type": "ListItem", position: 2, name: "Compare Stocks", url: `${SITE_URL}/compare` },
          { "@type": "ListItem", position: 3, name: "Portfolio Tracker", url: `${SITE_URL}/portfolio` },
          { "@type": "ListItem", position: 4, name: "IPO Calendar", url: `${SITE_URL}/ipo` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: homeFaqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <div className="stagger-fade space-y-8 py-4 sm:space-y-10 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <ViewportMotionSection
        className="gradient-border relative z-30 overflow-visible rounded-[28px] px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="absolute inset-x-[18%] top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        </div>

        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,440px)] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-bg/60 px-3 py-1.5 backdrop-blur">
              <span className="pulse-dot h-2 w-2 rounded-full bg-success" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent sm:text-[11px]">
                Live Indian Equity Intelligence
              </span>
            </div>

            <div className="mt-5 max-w-4xl">
              <h1 className="font-[var(--font-space)] text-[clamp(2.4rem,6vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.04em] text-balance">
                Institutional-grade
                <span className="block bg-gradient-to-r from-accent via-amber-400 to-orange-400 bg-clip-text text-transparent">
                  stock research
                </span>
                <span className="block text-text/92">for Indian markets.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">
                Screen, compare, validate, and monitor NSE and BSE ideas with a faster workflow:
                live market context, AI-assisted research, and compact financial intelligence built for
                daily use.
              </p>
            </div>

            <div className="mt-6 max-w-3xl">
              <StockSearch className="max-w-3xl" />
              <p className="mt-2 text-[11px] text-muted/75 sm:text-xs">
                Search by symbol or company name, then jump straight into score, risk, and financial views.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {FEATURE_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="border-border/55 bg-bg/65 px-3 py-1 text-[10px] font-semibold tracking-[0.08em] text-muted backdrop-blur sm:text-[11px]"
                >
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {HERO_METRICS.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-border/50 bg-panel/55 px-4 py-3 backdrop-blur-sm"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{metric.label}</p>
                  <p className={`mt-2 font-[var(--font-space)] text-xl font-bold ${metric.tone}`}>{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-spotlight rounded-[26px] border border-border/55 bg-panel/58 p-4 backdrop-blur-xl sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Command Center</p>
                <h2 className="mt-2 font-[var(--font-space)] text-xl font-bold">Move from signal to conviction.</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-amber-400/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {HERO_PILLARS.map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="group rounded-2xl border border-border/45 bg-bg/48 px-4 py-3.5 transition hover:border-accent/30 hover:bg-bg/62"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white/8 to-transparent text-accent shadow-inner shadow-white/5">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">{value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/screener"
                className="shine-btn inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:opacity-95 active:scale-[0.98]"
              >
                Open Screener
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-2 rounded-full border border-border/55 bg-bg/62 px-4 py-2 text-sm font-semibold text-text transition hover:border-accent/35 hover:text-accent active:scale-[0.98]"
              >
                Portfolio View
              </Link>
            </div>
          </div>
        </div>
      </ViewportMotionSection>

      <section className="sticky top-[5.4rem] z-20 rounded-2xl border border-border/40 bg-bg/75 p-2 backdrop-blur-xl sm:top-[6.2rem]">
        <MarketStatsBar />
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Quick Access</p>
            <h2 className="mt-1 font-[var(--font-space)] text-base font-bold sm:text-lg">Research Shortcuts</h2>
          </div>
          <span className="hidden rounded-full border border-border/50 bg-panel/60 px-3 py-1 text-[11px] font-medium text-muted sm:block">4 modules</span>
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {FEATURE_CARDS.map(({ href, icon: Icon, gradient, surface, label, desc, badge, points }) => (
            <Link
              key={href}
              href={href}
              className={`feature-card group relative isolate overflow-hidden rounded-[24px] border border-border/60 bg-panel/68 p-5 backdrop-blur-sm`}
            >
              <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${surface}`} />
              <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-70" />

              <div className="flex items-start justify-between gap-4">
                <div
                  className={`feature-card-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-xl`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-border/50 bg-bg/62 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted backdrop-blur">
                  {badge}
                </span>
              </div>

              <div className="mt-7">
                <p className="font-[var(--font-space)] text-lg font-bold tracking-tight text-text transition group-hover:text-accent">
                  {label}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">{desc}</p>
              </div>

              <div className="mt-5 space-y-2">
                {points.map((point) => (
                  <div key={point} className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/85" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Open Module</span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent transition duration-200 group-hover:translate-x-1">
                  Explore
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
        <MarketMoodIndex />
        <TopMovers />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-panel/70">
              <BarChart3 className="h-4 w-4 text-accent" />
            </div>
            <h2 className="font-[var(--font-space)] text-base font-bold sm:text-lg">Index Heatmap</h2>
          </div>
          <MarketStatusBadge compact />
        </div>
        <MarketHeatmap />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-[var(--font-space)] text-base font-bold sm:text-lg">Market News</h2>
            <p className="mt-0.5 text-[11px] text-muted">Curated from NSE, BSE and financial publications</p>
          </div>
          <time className="hidden text-[11px] tabular-nums text-muted sm:block">
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </time>
        </div>
        <MarketNews />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[28px] border border-border/45 bg-panel/40 p-5 backdrop-blur-sm sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            Built For Search Intent
          </p>
          <h2 className="mt-3 font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
            Research Indian stocks faster with one finance workflow.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted sm:text-base">
            {SITE_NAME} is built for the terms real investors search for every day:
            stock analysis, share price today, IPO calendar, stock screener, stock comparison,
            portfolio tracker, and risk analysis for Indian equities. Instead of forcing users to
            jump across disconnected tools, the app keeps price, quality, valuation, and AI context
            in the same workflow.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted sm:text-base">
            That makes the site stronger for both users and search engines. Each major page has a
            dedicated purpose, internal links to related tools, structured metadata, and crawlable
            copy around high-intent finance topics for NSE and BSE stocks.
          </p>
        </article>

        <article className="rounded-[28px] border border-border/45 bg-panel/40 p-5 backdrop-blur-sm sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            Popular Workflows
          </p>
          <div className="mt-4 grid gap-3">
            {[
              {
                href: "/screener",
                title: "Find undervalued or high-dividend stocks",
                body: "Use the stock screener to filter Indian stocks by sector, valuation, market cap, dividend yield, and price range.",
              },
              {
                href: "/compare",
                title: "Compare two stocks side by side",
                body: "Check which stock looks stronger on profitability, Smart Score, risk, and pricing without opening multiple tabs.",
              },
              {
                href: "/portfolio",
                title: "Review your holdings and portfolio risk",
                body: "Track P and L, allocation, watch targets, and AI portfolio risk commentary in one place.",
              },
              {
                href: "/ipo",
                title: "Track upcoming and recent IPOs in India",
                body: "Monitor IPO dates, listing details, and quick AI takes for new public issues.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-border/40 bg-bg/45 p-4 transition hover:border-accent/35 hover:bg-bg/55"
              >
                <h3 className="text-base font-semibold text-text">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{item.body}</p>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <FaqSection
        title="FAQs"
        intro="These answers target the main search questions users have when looking for stock market analysis tools in India."
        items={homeFaqs}
      />
    </div>
  );
}
