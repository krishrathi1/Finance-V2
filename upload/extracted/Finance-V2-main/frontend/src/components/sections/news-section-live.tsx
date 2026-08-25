"use client";

import { useStockNews } from "@/hooks/useStockNews";
import { NewsSection } from "./news-section";
import type { NewsItem } from "@/shared/types";

export function NewsSectionLive({ symbol, fallbackNews }: { symbol: string; fallbackNews?: NewsItem[] }) {
  const { data: liveNews, loading } = useStockNews(symbol);

  // Use live news if available, fallback to provided news, or empty array
  const newsToDisplay = liveNews || fallbackNews || [];

  if (loading && !newsToDisplay.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted">
        Loading news...
      </div>
    );
  }

  // Transform StockNews to NewsItem format for NewsSection compatibility
  const transformedNews: NewsItem[] = newsToDisplay.map((item: any) => ({
    title: item.title,
    source: item.source,
    publishedAt: item.publishedAt,
    summary: item.summary,
    url: item.url,
    sentimentScore: item.sentimentScore,
  }));

  return <NewsSection symbol={symbol} news={transformedNews} />;
}
