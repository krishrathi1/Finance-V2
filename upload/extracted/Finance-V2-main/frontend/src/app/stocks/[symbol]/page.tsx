import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StockSearch } from "@/components/stock-search";
import { PageHero } from "@/components/page-hero";
import { DashboardAutoRefresh } from "@/components/sections/dashboard-auto-refresh";
import { LiveStockDetails } from "@/components/sections/live-stock-details";
import { StockSectionTabs } from "@/components/sections/stock-section-tabs";
// Server-side data access, not the HTTP client in lib/api.ts. This page runs
// on the server, so it calls the dashboard builder directly instead of making
// the app issue an HTTP request to its own API — that round trip broke
// whenever INTERNAL_API_BASE wasn't reachable from inside the app (during
// `next build`, on a non-default port, or in a container), surfacing as
// "TypeError: fetch failed" on a page whose data layer was perfectly healthy.
import { loadDashboardEnvelope } from "@/server/application/dashboard-envelope";
import { POPULAR_STOCK_SYMBOLS, SITE_NAME, SITE_URL, buildBreadcrumbJsonLd, buildStockFaqJsonLd } from "@/shared/seo";
import type { DashboardData } from "@/shared/types";

const PriceSidebar = dynamic(() => import("@/components/sections/price-sidebar").then((m) => m.PriceSidebar), { ssr: false });

type Props = {
  params: { symbol: string };
  searchParams?: { exchange?: string };
};

export function generateStaticParams() {
  return POPULAR_STOCK_SYMBOLS.map((symbol) => ({ symbol }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const symbol = params.symbol.toUpperCase();
  const exchange = String(searchParams?.exchange || "NSE").toUpperCase();
  const canonicalPath = exchange === "NSE" ? `/stocks/${symbol}` : `/stocks/${symbol}?exchange=${exchange}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  try {
    const envelope = await loadDashboardEnvelope(symbol, { exchange });
    const raw = envelope.data as Record<string, unknown>;
    const companyName = String(raw?.companyName || symbol);
    const sector = String(raw?.sector || "Equity");
    const profile = (raw?.profile as Record<string, unknown>) ?? {};
    const description = String(profile?.description || "").slice(0, 120);
    const priceObj = (raw?.price as Record<string, unknown>) ?? {};
    const currentPrice = priceObj?.cmp ? `₹${priceObj.cmp}` : "";

    const title = `${companyName} (${symbol}) Share Price Today ${currentPrice} | AI Smart Score & Financials`;
    const metaDesc = `Track live ${companyName} (${symbol}) share price today ${currentPrice} on ${exchange}. View AI Smart Score, P/E ratio, 50/200 DMA charts, quarterly results, dividend history, and target price on ${SITE_NAME}.`;

    return {
      title,
      description: metaDesc.slice(0, 160),
      keywords: [
        `${companyName} share price`,
        `${symbol} stock analysis`,
        `${companyName} NSE`,
        `${symbol} BSE`,
        `${symbol} share price today`,
        `${companyName} financial results`,
        `${symbol} smart score`,
        `${companyName} annual report`,
        `${symbol} brokerage report`,
        `${companyName} PE ratio`,
        `${companyName} ${sector} stock`,
        `${symbol} target price`,
        `buy or sell ${companyName}`,
        `${companyName} quarterly results`,
        `${symbol} dividend history`,
      ],
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        type: "website",
        url: canonicalUrl,
        title,
        description: metaDesc.slice(0, 160),
        siteName: SITE_NAME,
        locale: "en_IN",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: metaDesc.slice(0, 160),
        site: "@mystockvision",
      },
    };
  } catch {
    return {
      title: `${symbol} Share Price and Stock Analysis`,
      description: `View ${symbol} live share price, AI Smart Score, financial statements, key ratios, and analyst reports on ${SITE_NAME}.`,
      alternates: { canonical: canonicalUrl },
    };
  }
}

type BrokerageResearch = NonNullable<DashboardData["brokerageResearch"]>;

function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function ensureObject<T extends Record<string, unknown>>(value: T | undefined | null): T | Record<string, never> {
  return value && typeof value === "object" ? value : {};
}

function normalizeDashboardData(raw: DashboardData | Record<string, unknown>, symbol: string): DashboardData {
  const root = ensureObject(raw);
  const profile = ensureObject(root.profile as Record<string, unknown> | undefined);
  const price = ensureObject(root.price as Record<string, unknown> | undefined);
  const financials = ensureObject(root.financials as Record<string, unknown> | undefined);
  const documents = ensureObject(root.documents as Record<string, unknown> | undefined);
  const shareholding = ensureObject(root.shareholding as Record<string, unknown> | undefined);
  const smartScore = ensureObject(root.smartScore as Record<string, unknown> | undefined);
  const riskScore = ensureObject(root.riskScore as Record<string, unknown> | undefined);
  const technicals = ensureObject(root.technicals as Record<string, unknown> | undefined);
  const corporateActions = ensureObject(root.corporateActions as Record<string, unknown> | undefined);
  const brokerageResearch = ensureObject(root.brokerageResearch as Record<string, unknown> | undefined);

  return {
    ...(root as DashboardData),
    symbol: String(root.symbol || symbol).toUpperCase(),
    companyName: String(root.companyName || symbol).toUpperCase(),
    exchange: String(root.exchange || "NSE"),
    sector: String(root.sector || ""),
    profile: {
      incorporationYear: Number(profile.incorporationYear || 0),
      headquarters: String(profile.headquarters || ""),
      website: String(profile.website || ""),
      description: String(profile.description || ""),
      chairman: String(profile.chairman || "N/A"),
      previousName: String(profile.previousName || "N/A"),
      industry: profile.industry ? String(profile.industry) : undefined,
      ceo: profile.ceo ? String(profile.ceo) : undefined,
      employees: typeof profile.employees === "number" || typeof profile.employees === "string" ? profile.employees : undefined,
      ipoDate: profile.ipoDate ? String(profile.ipoDate) : undefined,
      country: profile.country ? String(profile.country) : undefined,
    },
    price: {
      cmp: Number(price.cmp || 0),
      change: Number(price.change || 0),
      changePercent: Number(price.changePercent || 0),
      currency: String(price.currency || "INR"),
      fiftyTwoWeekLow: Number(price.fiftyTwoWeekLow || 0),
      fiftyTwoWeekHigh: Number(price.fiftyTwoWeekHigh || 0),
      aiTarget: Number(price.aiTarget || 0),
      history: ensureArray(price.history as DashboardData["price"]["history"]),
      intraday: ensureArray(price.intraday as DashboardData["price"]["intraday"])
    },
    metrics: ensureObject(root.metrics as Record<string, number | null> | undefined),
    smartScore: {
      score: Number(smartScore.score || 0),
      maxScore: Number(smartScore.maxScore || 5),
      dimensions: ensureObject(smartScore.dimensions as Record<string, number> | undefined),
      label: String(smartScore.label || "Unavailable"),
      explanation: String(smartScore.explanation || "Smart Score is unavailable right now."),
      aiExplanation: smartScore.aiExplanation ? String(smartScore.aiExplanation) : undefined,
      methodology: smartScore.methodology ? String(smartScore.methodology) : undefined,
      score10: typeof smartScore.score10 === "number" ? smartScore.score10 : undefined,
      mlConfidence: typeof smartScore.mlConfidence === "number" ? smartScore.mlConfidence : undefined,
      mlAdjustment: typeof smartScore.mlAdjustment === "number" ? smartScore.mlAdjustment : undefined,
      modelVersion: smartScore.modelVersion ? String(smartScore.modelVersion) : undefined,
      validation: smartScore.validation && typeof smartScore.validation === "object" ? (smartScore.validation as DashboardData["smartScore"]["validation"]) : undefined
    },
    riskScore: {
      score: Number(riskScore.score || 0),
      maxScore: Number(riskScore.maxScore || 5),
      components: ensureObject(riskScore.components as Record<string, number> | undefined),
      label: String(riskScore.label || "Unavailable"),
      explanation: String(riskScore.explanation || "Risk Score is unavailable right now."),
      aiExplanation: riskScore.aiExplanation ? String(riskScore.aiExplanation) : undefined,
      methodology: riskScore.methodology ? String(riskScore.methodology) : undefined,
      modelVersion: riskScore.modelVersion ? String(riskScore.modelVersion) : undefined
    },
    returnsSummary: ensureArray(root.returnsSummary as DashboardData["returnsSummary"]),
    returnsHeatmap: ensureArray(root.returnsHeatmap as DashboardData["returnsHeatmap"]),
    technicals: {
      rsi14: Number(technicals.rsi14 || 0),
      macd: Number(technicals.macd || 0),
      ema20: Number(technicals.ema20 || 0),
      ema50: Number(technicals.ema50 || 0),
      trend: String(technicals.trend || "Neutral"),
      pivotLevels: ensureObject(technicals.pivotLevels as Record<string, number> | undefined)
    },
    financials: {
      quarterly: ensureArray(financials.quarterly as DashboardData["financials"]["quarterly"]),
      quarterlyStandalone: ensureArray(financials.quarterlyStandalone as DashboardData["financials"]["quarterlyStandalone"]),
      quarterlyConsolidated: ensureArray(financials.quarterlyConsolidated as DashboardData["financials"]["quarterlyConsolidated"]),
      quarterlyDetailedStandalone: ensureArray(financials.quarterlyDetailedStandalone as DashboardData["financials"]["quarterlyDetailedStandalone"]),
      quarterlyDetailedConsolidated: ensureArray(financials.quarterlyDetailedConsolidated as DashboardData["financials"]["quarterlyDetailedConsolidated"]),
      growthSnapshot: financials.growthSnapshot && typeof financials.growthSnapshot === "object" ? (financials.growthSnapshot as DashboardData["financials"]["growthSnapshot"]) : undefined,
      keyRatioTrends: financials.keyRatioTrends && typeof financials.keyRatioTrends === "object" ? (financials.keyRatioTrends as DashboardData["financials"]["keyRatioTrends"]) : undefined,
      yearly: ensureArray(financials.yearly as DashboardData["financials"]["yearly"]),
      incomeStatement: ensureArray(financials.incomeStatement as DashboardData["financials"]["incomeStatement"]),
      balanceSheet: ensureArray(financials.balanceSheet as DashboardData["financials"]["balanceSheet"]),
      cashFlow: ensureArray(financials.cashFlow as DashboardData["financials"]["cashFlow"])
    },
    corporateActions: {
      boardMeetings: ensureArray(corporateActions.boardMeetings as DashboardData["corporateActions"]["boardMeetings"]),
      dividends: ensureArray(corporateActions.dividends as DashboardData["corporateActions"]["dividends"]),
      bonusIssues: ensureArray(corporateActions.bonusIssues as DashboardData["corporateActions"]["bonusIssues"]),
      stockSplits: ensureArray(corporateActions.stockSplits as DashboardData["corporateActions"]["stockSplits"]),
      rightsIssues: ensureArray(corporateActions.rightsIssues as DashboardData["corporateActions"]["rightsIssues"]),
      agmEgm: ensureArray(corporateActions.agmEgm as DashboardData["corporateActions"]["agmEgm"]),
      deals: ensureArray(corporateActions.deals as DashboardData["corporateActions"]["deals"]),
      bulkDeals: ensureArray(corporateActions.bulkDeals as DashboardData["corporateActions"]["bulkDeals"]),
      blockDeals: ensureArray(corporateActions.blockDeals as DashboardData["corporateActions"]["blockDeals"]),
      insiderTrades: ensureArray(corporateActions.insiderTrades as DashboardData["corporateActions"]["insiderTrades"])
    },
    documents: {
      annualReports: ensureArray(documents.annualReports as DashboardData["documents"]["annualReports"]),
      investorPresentations: ensureArray(documents.investorPresentations as DashboardData["documents"]["investorPresentations"]),
      creditRatings: ensureArray(documents.creditRatings as DashboardData["documents"]["creditRatings"]),
      exchangeFilings: ensureArray(documents.exchangeFilings as DashboardData["documents"]["exchangeFilings"])
    },
    shareholding: {
      quarter: String(shareholding.quarter || ""),
      promoters: Number(shareholding.promoters || 0),
      fii: Number(shareholding.fii || 0),
      dii: Number(shareholding.dii || 0),
      public: Number(shareholding.public || 0),
      history: ensureArray(shareholding.history as DashboardData["shareholding"]["history"]),
      topHolders: ensureArray(shareholding.topHolders as DashboardData["shareholding"]["topHolders"]),
      sourceUrl: shareholding.sourceUrl ? String(shareholding.sourceUrl) : undefined
    },
    brokerageResearch: brokerageResearch.source || brokerageResearch.sourceUrl || ensureArray(brokerageResearch.reports as never[]).length
      ? {
          source: String(brokerageResearch.source || ""),
          sourceUrl: String(brokerageResearch.sourceUrl || ""),
          updatedAt: String(brokerageResearch.updatedAt || ""),
          summary: {
            "1D": Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.["1D"] || 0),
            "1W": Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.["1W"] || 0),
            "1M": Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.["1M"] || 0),
            buy: Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.buy || 0),
            hold: Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.hold || 0),
            sell: Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.sell || 0),
            total: Number((brokerageResearch.summary as Record<string, unknown> | undefined)?.total || 0)
          },
          reports: ensureArray(brokerageResearch.reports as BrokerageResearch["reports"])
        }
      : undefined,
    competitors: {
      table: ensureArray((ensureObject(root.competitors as Record<string, unknown> | undefined).table as DashboardData["competitors"]["table"])),
      sectorName: ensureObject(root.competitors as Record<string, unknown> | undefined).sectorName
        ? String(ensureObject(root.competitors as Record<string, unknown> | undefined).sectorName)
        : undefined,
      industryName: ensureObject(root.competitors as Record<string, unknown> | undefined).industryName
        ? String(ensureObject(root.competitors as Record<string, unknown> | undefined).industryName)
        : undefined,
      sectorCompanies: ensureArray((ensureObject(root.competitors as Record<string, unknown> | undefined).sectorCompanies as DashboardData["competitors"]["sectorCompanies"])),
      industryCompanies: ensureArray((ensureObject(root.competitors as Record<string, unknown> | undefined).industryCompanies as DashboardData["competitors"]["industryCompanies"]))
    },
    news: ensureArray(root.news as DashboardData["news"]),
    fmpKeyMetrics: ensureArray(root.fmpKeyMetrics as DashboardData["fmpKeyMetrics"]),
    fmpFinancialGrowth: ensureArray(root.fmpFinancialGrowth as DashboardData["fmpFinancialGrowth"]),
    analystEstimates: ensureArray(root.analystEstimates as DashboardData["analystEstimates"]),
  };
}

export default async function StockDetailsPage({ params, searchParams }: Props) {
  const symbol = params.symbol.toUpperCase();
  const exchange = String(searchParams?.exchange || "NSE").trim().toUpperCase() || "NSE";
  if (!symbol) notFound();

  let data;
  let refreshWarning = "";
  let shouldAutoRefresh = false;
  try {
    const envelope = await loadDashboardEnvelope(symbol, { exchange });
    data = normalizeDashboardData(envelope.data, symbol);
    refreshWarning = envelope.warning || "";
    shouldAutoRefresh = Boolean(envelope.fallback || envelope.stale);
  } catch (error) {
    return (
      <div className="stagger-fade space-y-4">
        <div className="relative z-30 overflow-visible flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">
              Dashboard
            </Link>{" "}
            / {symbol}
          </p>
          <div className="w-full max-w-lg">
            <StockSearch />
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-panel p-6">
          <h2 className="text-xl font-semibold">Unable to load stock details right now</h2>
          <p className="mt-2 text-sm text-muted">
            Backend data source timed out or returned an error. Retry in a few seconds.
          </p>
          <p className="mt-2 text-xs text-muted">{String(error).replace("AbortError: This operation was aborted", "Request timeout")}</p>
        </div>
      </div>
    );
  }

  const smartScore = data.smartScore ?? {
    score: 0,
    dimensions: {},
    aiExplanation: "Smart Score is unavailable right now.",
    explanation: "Smart Score is unavailable right now.",
    methodology: undefined,
    label: "Unavailable",
    mlConfidence: undefined,
    validation: undefined
  };

  const riskScore = data.riskScore ?? {
    score: 0,
    components: {},
    aiExplanation: "Risk Score is unavailable right now.",
    explanation: "Risk Score is unavailable right now.",
    methodology: undefined,
    label: "Unavailable"
  };

  const canonicalPath = exchange === "NSE" ? `/stocks/${symbol}` : `/stocks/${symbol}?exchange=${exchange}`;
  const stockFaqs = [
    {
      question: `What can I check on the ${symbol} stock page?`,
      answer: `You can review ${data.companyName} share price, Smart Score, risk rating, financial statements, quarterly results, corporate actions, peer comparison, and recent market news on one page.`,
    },
    {
      question: `Does ${symbol} include both price and fundamentals?`,
      answer: `${data.companyName} includes price context plus core stock market research signals such as valuation ratios, returns, financials, and AI-generated analysis layers.`,
    },
    {
      question: `Can I compare ${symbol} with other Indian stocks?`,
      answer: `Yes. You can move from this stock page to the compare workflow or screener workflow to benchmark ${symbol} against sector peers and other NSE or BSE stocks.`,
    },
  ];

  const stockJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: `${data.companyName} (${symbol}) stock analysis`,
        url: `${SITE_URL}${canonicalPath}`,
        description: data.profile?.description || `${data.companyName} stock analysis for Indian markets`,
        isPartOf: {
          "@id": `${SITE_URL}/#website`,
        },
      },
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: symbol, path: canonicalPath },
      ]),
      buildStockFaqJsonLd(symbol, data.companyName, data.price?.cmp, (data as any).technicals?.peRatio || (data as any).price?.pe),
      {
        "@type": "FinancialProduct",
        name: data.companyName,
        alternateName: symbol,
        description: data.profile?.description || `${data.companyName} stock analysis on NSE and BSE`,
        url: `${SITE_URL}${canonicalPath}`,
        provider: {
          "@type": "Organization",
          name: SITE_NAME,
          url: SITE_URL,
        },
        feesAndCommissionsSpecification: "Free",
        additionalProperty: [
          { "@type": "PropertyValue", name: "Exchange", value: data.exchange },
          { "@type": "PropertyValue", name: "Sector", value: data.sector },
          ...(data.price?.cmp
            ? [{ "@type": "PropertyValue", name: "Current Price (INR)", value: String(data.price.cmp) }]
            : []),
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(stockJsonLd) }}
      />
    <div className="stagger-fade space-y-4">
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: symbol }]}
        eyebrow={`${data.exchange} equity`}
        title={
          <>
            {data.companyName}
            <span className="block text-[clamp(1.1rem,2vw,1.5rem)] font-semibold tracking-[0.08em] text-muted">
              {symbol}
            </span>
          </>
        }
        description="Live score, risk, financials, and corporate updates in one high-trust stock workspace."
        actions={
          <div className="flex w-full max-w-2xl flex-wrap items-center gap-3">
            <div className="w-full max-w-lg">
              <StockSearch />
            </div>
            <Link
              href={`/compare?a=${symbol}`}
              className="inline-flex items-center gap-2 rounded-full border border-border/55 bg-bg/60 px-4 py-2 text-sm font-semibold text-text transition hover:border-accent/35 hover:text-accent active:scale-[0.98]"
            >
              Compare
            </Link>
            <Link
              href="/screener"
              className="inline-flex items-center gap-2 rounded-full border border-border/55 bg-bg/60 px-4 py-2 text-sm font-semibold text-text transition hover:border-accent/35 hover:text-accent active:scale-[0.98]"
            >
              Screener
            </Link>
          </div>
        }
        stats={[
          { label: "Smart Score", value: smartScore.label || "Unavailable", toneClassName: "text-accent" },
          { label: "Risk View", value: riskScore.label || "Unavailable", toneClassName: "text-danger" },
          { label: "Auto Refresh", value: shouldAutoRefresh ? "Active" : "Stable", toneClassName: shouldAutoRefresh ? "text-success" : "text-text" },
        ]}
        aside={
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/45 bg-bg/42 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Research stack</p>
              <p className="mt-1 text-sm font-semibold text-text">Price, score, risk, filings, and peer context.</p>
            </div>
            <div className="rounded-2xl border border-border/45 bg-bg/42 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Data status</p>
              <p className="mt-1 text-sm font-semibold text-text">{refreshWarning ? "Using fallback-safe refresh flow" : "Primary feed healthy"}</p>
            </div>
          </div>
        }
      />

      <div className="hidden relative z-30 overflow-visible flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">
              Home
            </Link>{" "}
            / {symbol}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/compare?a=${symbol}`}
              className="flex items-center gap-1 rounded-lg border border-border/60 bg-panel/60 px-2.5 py-1 text-xs font-medium text-muted backdrop-blur-sm transition hover:border-accent/40 hover:text-accent"
            >
              Compare
            </Link>
            <Link
              href="/screener"
              className="flex items-center gap-1 rounded-lg border border-border/60 bg-panel/60 px-2.5 py-1 text-xs font-medium text-muted backdrop-blur-sm transition hover:border-accent/40 hover:text-accent"
            >
              Screener
            </Link>
          </div>
        </div>
        <div className="w-full max-w-lg">
          <StockSearch />
        </div>
      </div>

      <DashboardAutoRefresh symbol={symbol} active={shouldAutoRefresh} warning={refreshWarning} />

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <aside className="min-w-0">
          <PriceSidebar data={data} />
        </aside>

        <section className="min-w-0 space-y-4">
          <StockSectionTabs />

          {/* key={symbol} forces a full remount on navigation between stocks —
              LiveStockDetails and its children (SWOT, earnings TL;DR,
              competitor verdict, news, AI chat) all seed local state from
              props via useState with no resync effect, so without this they
              silently keep showing the previous symbol's content/AI answers
              after a client-side navigation. */}
          <LiveStockDetails key={symbol} initialData={data} symbol={symbol} exchange={data.exchange || exchange} />
        </section>
      </div>
    </div>
    </>
  );
}
