import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StockSearch } from "@/components/stock-search";
import { CompanyOverview } from "@/components/sections/company-overview";
import { CompetitorsSection } from "@/components/sections/competitors-section";
import { CorporateActionsSection } from "@/components/sections/corporate-actions-section";
import { DocumentsSection } from "@/components/sections/documents-section";
import { KeyRatiosSection } from "@/components/sections/key-ratios-section";
import { MetricsGrid } from "@/components/sections/metrics-grid";
import { NewsSection } from "@/components/sections/news-section";
import { ResearchReportSection } from "@/components/sections/research-report-section";
import { InsiderTradingSummary } from "@/components/sections/insider-trading-summary";
import { ReturnsPanel } from "@/components/sections/returns-panel";
import { RiskScore } from "@/components/sections/risk-score";
import { SmartScore } from "@/components/sections/smart-score";
import { StockSectionTabs } from "@/components/sections/stock-section-tabs";
import { TechnicalsSection } from "@/components/sections/technicals-section";
import { fetchDashboard, fetchResearchReport } from "@/lib/api";

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

export default async function StockDetailsPage({ params }: Props) {
  const symbol = params.symbol.toUpperCase();
  if (!symbol) notFound();

  let data;
  let report = "";
  try {
    [data, report] = await Promise.all([fetchDashboard(symbol), fetchResearchReport(symbol)]);
  } catch (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
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

  // Calculate historic CAGR from the longest available timeframe
  let historicalCagr = 12; // fallback
  if (data.returnsSummary && data.returnsSummary.length > 0) {
    const fiveYear = data.returnsSummary.find((r: any) => r.label === "5 Years");
    const threeYear = data.returnsSummary.find((r: any) => r.label === "3 Years");
    const oneYear = data.returnsSummary.find((r: any) => r.label === "1 Year");

    // Choose the longest reliable timeframe
    if (fiveYear && fiveYear.value !== null && fiveYear.value > -100) {
      historicalCagr = ((Math.pow(1 + fiveYear.value / 100, 1 / 5) - 1) * 100);
    } else if (threeYear && threeYear.value !== null && threeYear.value > -100) {
      historicalCagr = ((Math.pow(1 + threeYear.value / 100, 1 / 3) - 1) * 100);
    } else if (oneYear && oneYear.value !== null) {
      historicalCagr = oneYear.value;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
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

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside>
          <PriceSidebar data={data} />
        </aside>

        <section className="space-y-4">
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
            <MetricsGrid metrics={data.metrics} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <SmartScore score={data.smartScore.score} dimensions={data.smartScore.dimensions} explanation={data.smartScore.explanation} />
            <RiskScore score={data.riskScore.score} components={data.riskScore.components} explanation={data.riskScore.explanation} />
          </div>

          <ReturnsPanel summary={data.returnsSummary} heatmap={data.returnsHeatmap} />

          <TechnicalsSection technicals={data.technicals} />

          <div className="grid gap-4 xl:grid-cols-2">
            <ReturnsCalculator symbol={symbol} currentPrice={data.price.cmp} aiTarget={data.price.aiTarget} />
            <InsiderTradingSummary insiderTrades={data.corporateActions.insiderTrades} />
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
            />
          </section>

          <section id="key-ratios">
            <KeyRatiosSection metrics={data.metrics} />
          </section>

          <section id="competitors">
            <CompetitorsSection competitors={data.competitors} />
          </section>

          <section id="documents">
            <DocumentsSection
              annualReports={data.documents.annualReports}
              investorPresentations={data.documents.investorPresentations}
              creditRatings={data.documents.creditRatings}
              exchangeFilings={data.documents.exchangeFilings}
            />
          </section>

          <NewsSection news={data.news} />
          <ResearchReportSection report={report} />
        </section>
      </div>

      <AIChat symbol={symbol} />
    </div>
  );
}
