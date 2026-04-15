import { useEffect, useState } from 'react';

interface ChartDataResponse {
  identifier: string;
  name: string;
  history: Array<{ date: string; close: number }>;
  closePrice: number;
  timestamp: string;
}

export function useChartData(symbol: string, days: string = '1W') {
  const [data, setData] = useState<ChartDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/stocks/${symbol}/chart?days=${days}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch chart data: ${response.statusText}`);
        }

        const chartData = await response.json();
        setData(chartData);
      } catch (err) {
        console.error('Chart data fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchChartData();
    }
  }, [symbol, days]);

  return { data, loading, error };
}
