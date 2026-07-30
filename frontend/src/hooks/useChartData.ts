import { useEffect, useRef, useState } from 'react';

import { useVisibilityPolling } from '@/hooks/useVisibilityPolling';

interface ChartDataResponse {
  identifier: string;
  name: string;
  history: Array<{ date: string; close: number }>;
  closePrice: number;
  timestamp: string;
}

export function useChartData(symbol: string, days: string = '1W', exchange = 'NSE') {
  const [data, setData] = useState<ChartDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const fetchChartData = async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/stocks/${symbol}/chart?days=${encodeURIComponent(days)}&exchange=${encodeURIComponent(exchange)}&t=${Date.now()}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch chart data: ${response.statusText}`);
        }

        const chartData = await response.json();
        if (!cancelled) setData(chartData);
      } catch (err) {
        if (cancelled) return;
        console.error('Chart data fetch error:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    pollRef.current = () => {
      if (symbol) void fetchChartData(true);
    };

    if (symbol) {
      fetchChartData();
    }

    return () => {
      cancelled = true;
    };
  }, [symbol, days, exchange]);

  useVisibilityPolling((initial) => {
    // Initial load (and reloads on symbol/days/exchange change) are handled by the effect above.
    if (!initial) pollRef.current();
  }, 30_000);

  return { data, loading, error };
}
