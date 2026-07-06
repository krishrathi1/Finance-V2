import { useEffect, useState } from 'react';

export interface StockNews {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  sentimentScore: number;
}

export interface NewsResponse {
  data: StockNews[];
  symbol: string;
  timestamp: string;
}

export function useStockNews(symbol: string) {
  const [data, setData] = useState<StockNews[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const fetchNews = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/stocks/${encodeURIComponent(symbol)}/news`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch news: ${response.statusText}`);
        }

        const newsData: NewsResponse = await response.json();
        if (!cancelled) setData(newsData.data);
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        console.error('News fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch news');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (symbol) {
      fetchNews();
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol]);

  return { data, loading, error };
}
