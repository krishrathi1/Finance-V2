"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { AnalystEstimatesSection } from "@/components/sections/analyst-estimates-section";
import { BeginnerSnapshot } from "@/components/sections/beginner-snapshot";
import { BrokerageSummary } from "@/components/sections/brokerage-summary";
import { CompanyOverview } from "@/components/sections/company-overview";
import { CompetitorVerdict } from "@/components/sections/competitor-verdict";
import { CompetitorsSection } from "@/components/sections/competitors-section";
import { CorporateActionsSection } from "@/components/sections/corporate-actions-section";
import { DocumentsSection } from "@/components/sections/documents-section";
import { EarningsTldr } from "@/components/sections/earnings-tldr";
import { KeyRatiosSection } from "@/components/sections/key-ratios-section";
import { MetricsGridLive } from "@/components/sections/metrics-grid-live";
import { ResearchReportCard } from "@/components/sections/research-report-card";
import { SimpleReturnsCalculator } from "@/components/sections/simple-returns-calculator";
import { ReturnsPanel } from "@/components/sections/returns-panel";
import { RiskScore } from "@/components/sections/risk-score";
import { ShareholdingSection } from "@/components/sections/shareholding-section";
import { FundamentalSignals } from "@/components/sections/fundamental-signals";
import { PriceRiskProfile } from "@/components/sections/price-risk-profile";
import { PeerValuation } from "@/components/sections/peer-valuation";
import { ForensicsSection } from "@/components/sections/forensics-section";
import { OptionsChainTable } from "@/components/sections/options-chain-table";
import { InstitutionalTracker } from "@/components/sections/institutional-tracker";
import { StockReportModal } from "@/components/modals/stock-report-modal";
import { FileText, Printer } from "lucide-react";
import { QualityScore } from "@/components/sections/quality-score";
import { ReturnAnalysis } from "@/components/sections/return-analysis";
import { RollingReturns } from "@/components/sections/rolling-returns";
import { SipSimulator } from "@/components/sections/sip-simulator";
import { UnderwaterHistory } from "@/components/sections/underwater-history";
import { DividendTrackRecord } from "@/components/sections/dividend-track-record";
import { ShareholdingTrend } from "@/components/sections/shareholding-trend";
import { InvestmentThesis } from "@/components/sections/investment-thesis";
import { MetricsReference } from "@/components/sections/metrics-reference";
import { StatementQuality } from "@/components/sections/statement-quality";
import { TechnicalAnalysis } from "@/components/sections/technical-analysis";
import { SmartScore } from "@/components/sections/smart-score";
import { StockAuthWall } from "@/components/sections/stock-auth-wall";
import { SwotAnalysis } from "@/components/sections/swot-analysis";
import { TechnicalsSection } from "@/components/sections/technicals-section";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchDashboardEnvelope } from "@/lib/api";
import type { DashboardData } from "@/shared/types";

const FinancialsSection = dynamic(() => import("@/components/sections/financials-section").then((m) => m.FinancialsSection), { ssr: false });
const NewsSectionLive = dynamic(() => import("@/components/sections/news-section-live").then((m) => m.NewsSectionLive), { ssr: false });
const QuarterlyResultsSection = dynamic(
  () => import("@/components/sections/quarterly-results-section").then((m) => m.QuarterlyResultsSection),
  { ssr: false }
);
const LIVE_REFRESH_MS = 30_000;

function mergeDashboardData(current: DashboardData, next: DashboardData): DashboardData {
  return {
    ...current,
    ...next,
    profile: { ...current.profile, ...next.profile },
    price: { ...current.price, ...next.price },
    metrics: { ...current.metrics, ...next.metrics },
    smartScore: { ...current.smartScore, ...next.smartScore },
    riskScore: { ...current.riskScore, ...next.riskScore },
    technicals: { ...current.technicals, ...next.technicals },
    financials: { ...current.financials, ...next.financials },
    corporateActions: { ...current.corporateActions, ...next.corporateActions },
    documents: { ...current.documents, ...next.documents },
    shareholding: { ...current.shareholding, ...next.shareholding },
    competitors: { ...current.competitors, ...next.competitors },
  };
}

function hasMeaningfulDashboard(data: DashboardData) {
  return Boolean(data?.price?.cmp || data?.price?.history?.length || data?.companyName);
}

export function LiveStockDetails({ initialData, symbol, exchange }: { initialData: DashboardData; symbol: string; exchange: string }) {
  const [data, setData] = useState(initialData);
  const [showReportModal, setShowReportModal] = useState(false);

  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      try {
        const envelope = await fetchDashboardEnvelope(symbol, { exchange, force: true });
        if (!alive || !hasMeaningfulDashboard(envelope.data)) return;
        setData((current) => mergeDashboardData(current, envelope.data));
      } catch (error) {
        if (!alive) return;
        console.error("Live dashboard refresh failed:", error);
      }
    };

    refreshRef.current = () => void refresh();
    refresh();

    return () => {
      alive = false;
    };
  }, [exchange, symbol]);

  useVisibilityPolling((initial) => {
    // Initial load (and reloads on symbol/exchange change) are handled by the effect above.
    if (!initial) refreshRef.current();
  }, LIVE_REFRESH_MS);

  const smartScore = useMemo(
    () =>
      data.smartScore ?? {
        score: 0,
        maxScore: 5,
        dimensions: {},
        label: "Unavailable",
        explanation: "Smart Score is unavailable right now.",
      },
    [data.smartScore]
  );

  const riskScore = useMemo(
    () =>
      data.riskScore ?? {
        score: 0,
        maxScore: 5,
        components: {},
        label: "Unavailable",
        explanation: "Risk Score is unavailable right now.",
      },
    [data.riskScore]
  );

  return (
    <>
      <section id="overview" className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-2xl border border-border/70 bg-panel/80">
          <div className="flex items-center gap-2 text-xs text-muted">
            <FileText className="h-4 w-4 text-primary" />
            <span>Need an offline briefing? Generate a clean, 2-page executive summary.</span>
          </div>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 shadow-sm transition-all"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>1-Click PDF Report</span>
          </button>
        </div>

        <CompanyOverview
          description={data.profile.description}
          incorporationYear={data.profile.incorporationYear}
          headquarters={data.profile.headquarters}
          website={data.profile.website}
          chairman={data.profile.chairman}
          previousName={data.profile.previousName}
          ceo={data.profile.ceo}
          employees={data.profile.employees}
          ipoDate={data.profile.ipoDate}
          country={data.profile.country}
        />
        <MetricsGridLive
          symbol={symbol}
          exchange={data.exchange || exchange}
          dashboardMetrics={data.metrics}
          keyRatioTrends={data.financials.keyRatioTrends}
          sector={data.sector}
          industry={data.profile.industry}
        />
        <PeerValuation
          metrics={data.metrics}
          competitors={data.competitors}
          brokerageResearch={data.brokerageResearch}
          currentPrice={data.price?.cmp}
        />
      </section>

      <StockAuthWall>
        <BeginnerSnapshot
          smartScore={smartScore.score}
          riskScore={riskScore.score}
          currentPrice={data.price.cmp}
          aiTarget={data.price.aiTarget}
          mlConfidence={smartScore.mlConfidence}
        />

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

        {/* Phase 1: Forensic Accounting & Red Flag Audit */}
        <section id="forensics" className="space-y-4">
          <ForensicsSection stockData={data} />
        </section>

        {/* Phase 2: Options Chain & Greeks Analytics */}
        <section id="options-chain" className="space-y-4">
          <OptionsChainTable symbol={symbol} currentPrice={data.price?.cmp} />
        </section>

        {/* Institutional FII/DII Flows Tracker */}
        <InstitutionalTracker />

        {/* Quality & Safety scores today's ratios against fixed thresholds;
            these two answer the questions it can't — did the business improve
            on last year, and what has owning it actually felt like. */}
        <div className="grid gap-4 xl:grid-cols-2">
          <QualityScore metrics={data.metrics} financials={data.financials} sector={data.sector} />
          <FundamentalSignals financials={data.financials} />
        </div>

        {/* Placed high: it synthesises the cards below into two cases and
            names where they disagree, which is the question a reader is
            actually here to answer. */}
        <InvestmentThesis data={data} />

        <StatementQuality financials={data.financials} marketCap={data.metrics?.marketCap} />

        <PeerValuation
          metrics={data.metrics}
          competitors={data.competitors}
          brokerageResearch={data.brokerageResearch}
          currentPrice={data.price?.cmp}
        />

        <PriceRiskProfile
          history={data.price?.history}
          currentPrice={data.price?.cmp}
          fiftyTwoWeekLow={data.price?.fiftyTwoWeekLow}
          fiftyTwoWeekHigh={data.price?.fiftyTwoWeekHigh}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <ReturnAnalysis history={data.price?.history} />
          <TechnicalAnalysis history={data.price?.history} />
        </div>

        {/* Sits right after the single-observation trailing returns above: this
            pair answers the same question across every start date, and for the
            staggered entry most retail money actually uses. */}
        <div className="grid gap-4 xl:grid-cols-2">
          <RollingReturns history={data.price?.history} />
          <SipSimulator history={data.price?.history} />
        </div>

        {/* The "how long" half of the drawdown question the Risk Profile card
            above answers with "how bad". */}
        <UnderwaterHistory history={data.price?.history} />

        {/* The exhaustive lookup, after the curated cards: search-first,
            for the reader who arrived knowing which figure they want. */}
        <MetricsReference data={data} />

        {/* Both read data the page already fetches but only ever listed:
            the dividend table becomes a track record, and the shareholding
            quarter-picker becomes a direction of travel. */}
        <div className="grid gap-4 xl:grid-cols-2">
          <DividendTrackRecord
            dividends={data.corporateActions?.dividends}
            currentPrice={data.price?.cmp}
          />
          <ShareholdingTrend history={data.shareholding?.history} />
        </div>

        <section id="swot">
          <SwotAnalysis symbol={symbol} />
        </section>

        <ReturnsPanel summary={data.returnsSummary} heatmap={data.returnsHeatmap} />

        <TechnicalsSection technicals={data.technicals} />

        <div className="grid gap-4 xl:grid-cols-2">
          <SimpleReturnsCalculator returnsSummary={data.returnsSummary} />
          <ResearchReportCard
            companyName={data.companyName}
            symbol={symbol}
            cmp={data.price.cmp}
            report={data.brokerageResearch?.reports?.[0]}
          />
        </div>

        <BrokerageSummary brokerage={data.brokerageResearch} />

        {data.analystEstimates && data.analystEstimates.length > 0 && (
          <AnalystEstimatesSection estimates={data.analystEstimates} />
        )}

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

        <EarningsTldr symbol={symbol} />

        <section id="financials">
          <FinancialsSection
            growthSnapshot={data.financials.growthSnapshot}
            quarterly={data.financials.quarterly}
            yearly={data.financials.yearly}
            incomeStatement={data.financials.incomeStatement}
            balanceSheet={data.financials.balanceSheet}
            cashFlow={data.financials.cashFlow}
            outstandingSharesCr={data.metrics?.outstandingShares ?? null}
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

        <section id="competitors">
          <CompetitorsSection competitors={data.competitors} />
          <CompetitorVerdict symbol={symbol} />
        </section>

        <NewsSectionLive symbol={symbol} fallbackNews={data.news} />
      </StockAuthWall>

      {showReportModal && (
        <StockReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          data={data}
        />
      )}
    </>
  );
}
