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
    const fetchNews = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/stocks/${symbol}/news`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch news: ${response.statusText}`);
        }

        const newsData: NewsResponse = await response.json();
        setData(newsData.data);
      } catch (err) {
        console.error('News fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch news');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchNews();
    }
  }, [symbol]);

  return { data, loading, error };
}
