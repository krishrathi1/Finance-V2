import { useEffect, useRef, useState } from 'react';

import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';

export interface StockQuote {
  symbol: string;
  companyName: string;
  industry: string;
  sector: string;

  // Price Information
  lastPrice: number;
  open: number;
  close: number;
  previousClose: number;
  vwap: number;
  change: number;
  pChange: number;

  // High/Low Information
  fiftytwoWeekHigh: number;
  fiftytwoWeekHighDate: string;
  fiftytwoWeekLow: number;
  fiftytwoWeekLowDate: string;

  // Intraday High/Low
  intraDayHigh: number;
  intraDayLow: number;

  // Circuit Limits
  upperCP: number;
  lowerCP: number;

  // Valuation Metrics
  marketCapCr: number | null;
  peRatio: number | null;
  industryPE: number | null;
  pegRatio: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  evToSales: number | null;

  // Profitability Metrics
  roe: number | null;
  roce: number | null;
  roa: number | null;
  ebitdaMargin: number | null;
  netProfitMargin: number | null;
  operatingMargin: number | null;

  // Per Share Data
  eps: number | null;
  dividendYield: number | null;
  outstandingSharesCr: number | null;

  // Financial Data
  netProfit: number;
  profitBeforeTax: number;
  netSales: number;
  totalIncome: number;

  // Risk Metrics
  debtEquityRatio: number;
  casaRatio: number | null;
  netInterestMargin: number | null;

  // Additional Info
  faceValue: number | null;
  isin: string;
  listingDate: string;
  tradingStatus: string;

  timestamp: string;
}

export function useStockQuote(symbol: string, exchange = 'NSE') {
  const [data, setData] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const fetchQuote = async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/stocks/${symbol}/quote?exchange=${encodeURIComponent(exchange)}&t=${Date.now()}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch quote: ${response.statusText}`);
        }

        const quoteData = await response.json();
        if (!cancelled) setData(quoteData);
      } catch (err) {
        if (cancelled) return;
        console.error('Quote fetch error:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch quote');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    pollRef.current = () => {
      if (symbol) void fetchQuote(true);
    };

    if (symbol) {
      fetchQuote();
    }

    return () => {
      cancelled = true;
    };
  }, [symbol, exchange]);

  useVisibilityPolling((initial) => {
    // Initial load (and reloads on symbol/exchange change) are handled by the effect above.
    if (!initial) pollRef.current();
  }, 30_000);

  return { data, loading, error };
}
