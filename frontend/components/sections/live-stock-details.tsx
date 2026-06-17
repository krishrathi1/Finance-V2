"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

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
import { ReturnsPanel } from "@/components/sections/returns-panel";
import { RiskScore } from "@/components/sections/risk-score";
import { ShareholdingSection } from "@/components/sections/shareholding-section";
import { SmartScore } from "@/components/sections/smart-score";
import { StockAuthWall } from "@/components/sections/stock-auth-wall";
import { SwotAnalysis } from "@/components/sections/swot-analysis";
import { TechnicalsSection } from "@/components/sections/technicals-section";
import { fetchDashboardEnvelope } from "@/lib/api";
import type { DashboardData } from "@/lib/types";

const FinancialsSection = dynamic(() => import("@/components/sections/financials-section").then((m) => m.FinancialsSection), { ssr: false });
const NewsSectionLive = dynamic(() => import("@/components/sections/news-section-live").then((m) => m.NewsSectionLive), { ssr: false });
const QuarterlyResultsSection = dynamic(
  () => import("@/components/sections/quarterly-results-section").then((m) => m.QuarterlyResultsSection),
  { ssr: false }
);
const AIChat = dynamic(() => import("@/components/sections/ai-chat").then((m) => m.AIChat), { ssr: false });

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

    refresh();
    const timer = window.setInterval(refresh, LIVE_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [exchange, symbol]);

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

        <section id="swot">
          <SwotAnalysis symbol={symbol} />
        </section>

        <ReturnsPanel summary={data.returnsSummary} heatmap={data.returnsHeatmap} />

        <TechnicalsSection technicals={data.technicals} />

        <div className="grid gap-4 xl:grid-cols-2">
          <BrokerageSummary brokerage={data.brokerageResearch} />
        </div>

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
        <AIChat symbol={symbol} />
      </StockAuthWall>
    </>
  );
}
