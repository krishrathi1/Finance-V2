import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StockSearch } from "@/components/stock-search";
import { CompanyOverview } from "@/components/sections/company-overview";
import { CorporateActionsSection } from "@/components/sections/corporate-actions-section";
import { DashboardAutoRefresh } from "@/components/sections/dashboard-auto-refresh";
import { DocumentsSection } from "@/components/sections/documents-section";
import { KeyRatiosSection } from "@/components/sections/key-ratios-section";
import { MetricsGrid } from "@/components/sections/metrics-grid";
import { NewsSection } from "@/components/sections/news-section";
import { BrokerageSummary } from "@/components/sections/brokerage-summary";
import { ReturnsPanel } from "@/components/sections/returns-panel";
import { RiskScore } from "@/components/sections/risk-score";
import { SmartScore } from "@/components/sections/smart-score";
import { StockSectionTabs } from "@/components/sections/stock-section-tabs";
import { SwotAnalysis } from "@/components/sections/swot-analysis";
import { TechnicalsSection } from "@/components/sections/technicals-section";
import { fetchDashboardEnvelope } from "@/lib/api";
import type { DashboardData } from "@/lib/types";

const PriceSidebar = dynamic(() => import("@/components/sections/price-sidebar").then((m) => m.PriceSidebar), { ssr: false });
const FinancialsSection = dynamic(() => import("@/components/sections/financials-section").then((m) => m.FinancialsSection), { ssr: false });
const QuarterlyResultsSection = dynamic(
  () => import("@/components/sections/quarterly-results-section").then((m) => m.QuarterlyResultsSection),
  { ssr: false }
);
const ShareholdingSection = dynamic(() => import("@/components/sections/shareholding-section").then((m) => m.ShareholdingSection), { ssr: false });
const ReturnsCalculator = dynamic(() => import("@/components/sections/returns-calculator").then((m) => m.ReturnsCalculator), { ssr: false });
const AIChat = dynamic(() => import("@/components/sections/ai-chat").then((m) => m.AIChat), { ssr: false });

type Props = {
  params: { symbol: string };
};

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
      industry: profile.industry ? String(profile.industry) : undefined
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
    news: ensureArray(root.news as DashboardData["news"])
  };
}

export default async function StockDetailsPage({ params }: Props) {
  const symbol = params.symbol.toUpperCase();
  if (!symbol) notFound();

  let data;
  let refreshWarning = "";
  let shouldAutoRefresh = false;
  try {
    const envelope = await fetchDashboardEnvelope(symbol);
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

      <DashboardAutoRefresh symbol={symbol} active={shouldAutoRefresh} warning={refreshWarning} />

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <aside className="min-w-0">
          <PriceSidebar data={data} />
        </aside>

        <section className="min-w-0 space-y-4">
          <StockSectionTabs />

          <section id="overview" className="space-y-4">
            <CompanyOverview
              description={data.profile.description}
              incorporationYear={data.profile.incorporationYear}
              headquarters={data.profile.headquarters}
              website={data.profile.website}
              chairman={data.profile.chairman}
              previousName={data.profile.previousName}
            />
            <MetricsGrid metrics={data.metrics} keyRatioTrends={data.financials.keyRatioTrends} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <SmartScore
              score={smartScore.score}
              dimensions={smartScore.dimensions}
              aiExplanation={smartScore.aiExplanation || smartScore.explanation}
              methodology={smartScore.methodology}
              label={smartScore.label}
            />
            <RiskScore
              score={riskScore.score}
              components={riskScore.components}
              aiExplanation={riskScore.aiExplanation || riskScore.explanation}
              methodology={riskScore.methodology}
              label={riskScore.label}
            />
          </div>

          <section id="swot">
            <SwotAnalysis symbol={symbol} />
          </section>

          <ReturnsPanel summary={data.returnsSummary} heatmap={data.returnsHeatmap} />

          <TechnicalsSection technicals={data.technicals} />

          <div className="grid gap-4 xl:grid-cols-2">
            <ReturnsCalculator
              symbol={symbol}
              currentPrice={data.price.cmp}
              aiTarget={data.price.aiTarget}
              mlConfidence={smartScore.mlConfidence}
              upProbability={smartScore.validation?.upProbability}
            />
            <BrokerageSummary brokerage={data.brokerageResearch} />
          </div>

          <section id="corporate-actions">
            <CorporateActionsSection actions={data.corporateActions} />
          </section>

          <section id="quarterly-results">
            <QuarterlyResultsSection
              quarterly={data.financials.quarterly}
              standalone={data.financials.quarterlyStandalone}
              consolidated={data.financials.quarterlyConsolidated}
              standaloneDetailed={data.financials.quarterlyDetailedStandalone}
              consolidatedDetailed={data.financials.quarterlyDetailedConsolidated}
            />
          </section>

          <section id="financials">
            <FinancialsSection
              growthSnapshot={data.financials.growthSnapshot}
              quarterly={data.financials.quarterly}
              yearly={data.financials.yearly}
              incomeStatement={data.financials.incomeStatement}
              balanceSheet={data.financials.balanceSheet}
              cashFlow={data.financials.cashFlow}
            />
          </section>

          <section id="shareholding">
            <ShareholdingSection
              quarter={data.shareholding.quarter}
              promoters={data.shareholding.promoters}
              fii={data.shareholding.fii}
              dii={data.shareholding.dii}
              publicHolding={data.shareholding.public}
              history={data.shareholding.history}
              topHolders={data.shareholding.topHolders}
              sourceUrl={data.shareholding.sourceUrl}
            />
          </section>

          <section id="key-ratios">
            <KeyRatiosSection metrics={data.metrics} trends={data.financials.keyRatioTrends} />
          </section>

          <section id="documents">
            <DocumentsSection
              annualReports={data.documents.annualReports}
              investorPresentations={data.documents.investorPresentations}
              creditRatings={data.documents.creditRatings}
              exchangeFilings={data.documents.exchangeFilings}
            />
          </section>

          <NewsSection symbol={symbol} news={data.news} />
        </section>
      </div>

      <AIChat symbol={symbol} />
    </div>
  );
}
