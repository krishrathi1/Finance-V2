"use client";

import { useStockQuote } from "@/hooks/useStockQuote";
import { MetricsGrid } from "./metrics-grid";
import type { KeyRatioTrends } from "@/lib/types";

export function MetricsGridLive({
  symbol,
  exchange,
  dashboardMetrics,
  keyRatioTrends
}: {
  symbol: string;
  exchange: string;
  dashboardMetrics: Record<string, number | null>;
  keyRatioTrends?: KeyRatioTrends;
}) {
  const { data: quoteData } = useStockQuote(symbol, exchange);

  // Transform quote data to match MetricsGrid expected keys
  const mergedMetrics = {
    ...dashboardMetrics,
    // Map quote data keys to MetricsGrid keys
    marketCap: quoteData?.marketCapCr ?? dashboardMetrics.marketCap ?? null,
    peRatio: quoteData?.peRatio ?? dashboardMetrics.peRatio ?? null,
    industryPe: quoteData?.industryPE ?? dashboardMetrics.industryPe ?? null,
    pegRatio: quoteData?.pegRatio ?? dashboardMetrics.pegRatio ?? null,
    roe: quoteData?.roe ?? dashboardMetrics.roe ?? null,
    roce: quoteData?.roce ?? dashboardMetrics.roce ?? null,
    roa: quoteData?.roa ?? dashboardMetrics.roa ?? null,
    ebitdaMargin: quoteData?.ebitdaMargin ?? dashboardMetrics.ebitdaMargin ?? null,
    casaRatio: quoteData?.casaRatio ?? dashboardMetrics.casaRatio ?? null,
    dividendYield: quoteData?.dividendYield ?? dashboardMetrics.dividendYield ?? null,
    eps: quoteData?.eps ?? dashboardMetrics.eps ?? null,
    faceValue: quoteData?.faceValue ?? dashboardMetrics.faceValue ?? null,
    outstandingShares: quoteData?.outstandingSharesCr ?? dashboardMetrics.outstandingShares ?? null,
    netInterestMargin: quoteData?.netInterestMargin ?? dashboardMetrics.netInterestMargin ?? null,
    evToSales: quoteData?.evToSales ?? dashboardMetrics.evToSales ?? null,
    bookValue: quoteData?.bookValue ?? dashboardMetrics.bookValue ?? null,
    pbRatio: quoteData?.priceToBook ?? dashboardMetrics.pbRatio ?? null,
  };

  return <MetricsGrid metrics={mergedMetrics} keyRatioTrends={keyRatioTrends} />;
}
