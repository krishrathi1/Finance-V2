import { useEffect, useState } from 'react';

interface QuarterlyResult {
  period: string;
  endDate: string;
  startDate: string;
  createdDate: string;
  type: string; // U = Unaudited, A = Audited
  netSales: number;
  netProfit: number;
  basicEPS: number;
  dilutedEPS: number;
  profitBeforeTax: number;
  profitAfterTax: number;
  staffCost: number;
  depreciationExpense: number;
  interestExpense: number;
  rawMaterialConsumption: number;
  totalExpense: number;
  totalIncome: number;
  otherIncome: number;
  currentTax: number;
  deferredTax: number;
  otherExpense: number;
  debtEquityRatio: number;
  interestServiceCoverage: number;
  debtServiceCoverage: number;
  descriptionSegment: string;
  descriptionFinancial: string;
  remarks: string;
}

interface QuarterlyResultsResponse {
  symbol: string;
  bankNonBanking: string;
  results: QuarterlyResult[];
  timestamp: string;
}

export function useQuarterlyResults(symbol: string) {
  const [data, setData] = useState<QuarterlyResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/stocks/${symbol}/quarterly-results`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch quarterly results: ${response.statusText}`);
        }

        const resultsData = await response.json();
        setData(resultsData);
      } catch (err) {
        console.error('Quarterly results fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch quarterly results');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchResults();
    }
  }, [symbol]);

  return { data, loading, error };
}
