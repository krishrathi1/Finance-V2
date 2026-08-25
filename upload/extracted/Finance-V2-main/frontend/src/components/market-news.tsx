"use client";

import { useState } from "react";

import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { fetchMarketNews } from "@/lib/api";

type NewsArticle = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
  imageUrl: string | null;
};

const MARKET_PLACEHOLDER = "/api/v1/stocks/proxy-image?placeholder=market";

function countImages(rows: NewsArticle[]) {
  return rows.reduce((total, row) => total + (hasUsableImage(row.imageUrl) ? 1 : 0), 0);
}

function hasUsableImage(imageUrl: string | null) {
  if (!imageUrl) {
    return false;
  }
  try {
    const url = new URL(imageUrl);
    const host = url.hostname.toLowerCase();
    return !(
      host === "news.google.com"
    );
  } catch {
    return false;
  }
}

export function MarketNews() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const load = async (forceRefresh = false) => {
    try {
      const data = await fetchMarketNews({ force: forceRefresh });
      if (data.length || !forceRefresh) {
        setArticles((current) => {
          if (!forceRefresh) {
            return data;
          }
          return countImages(data) >= countImages(current) ? data : current;
        });
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch {
      if (!forceRefresh) setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useVisibilityPolling(async (initial) => {
    if (initial) {
      await load(false);
      await load(true);
      return;
    }
    await load(true);
  }, 2 * 60_000);

  if (loading) {
    return (
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="overflow-hidden rounded-2xl border border-border/60 bg-panel/70">
            <div className="shimmer h-36 w-full sm:h-40" />
            <div className="space-y-3 p-[var(--panel-padding)]">
              <div className="flex items-center justify-between">
                <div className="shimmer h-3 w-20 rounded-full" />
                <div className="shimmer h-3 w-14 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="shimmer h-4 w-full rounded-full" />
                <div className="shimmer h-4 w-11/12 rounded-full" />
                <div className="shimmer h-4 w-3/4 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="shimmer h-3 w-full rounded-full" />
                <div className="shimmer h-3 w-10/12 rounded-full" />
                <div className="shimmer h-3 w-8/12 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!articles.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 text-sm text-muted">
        No market news available right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {lastUpdated ? <p className="text-xs text-muted">Updated: {lastUpdated}</p> : null}
      <div className="news-grid-stagger grid [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] gap-3 sm:gap-4">
        {articles.map((article, idx) => (
          <a
            key={`${article.url}-${idx}`}
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="news-card group flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-border/50 bg-panel hover:border-accent hover:bg-panel/80 active:scale-[0.98] sm:rounded-2xl"
          >
            {(() => {
              const fallbackUrl = `/api/v1/stocks/proxy-image?placeholder=market&title=${encodeURIComponent(article.title)}&idx=${idx}`;
              const imageSrc = hasUsableImage(article.imageUrl)
                ? `/api/v1/stocks/proxy-image?url=${encodeURIComponent(article.imageUrl!)}&title=${encodeURIComponent(article.title)}&idx=${idx}`
                : fallbackUrl;

              return (
                <div className="relative h-36 w-full shrink-0 overflow-hidden bg-background/50 sm:h-44">
                  <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-80" />
                  <img
                    src={imageSrc}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = fallbackUrl;
                    }}
                  />
                </div>
              );
            })()}
            <div className="flex flex-1 flex-col p-[var(--panel-padding)]">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span className="font-semibold text-accent/80">{article.source}</span>
                <span>{article.publishedAt}</span>
              </div>
              <h3 className="density-copy line-clamp-3 text-sm font-semibold leading-snug transition-colors group-hover:text-accent">{article.title}</h3>
              <p className="density-copy mt-2 line-clamp-3 text-xs text-muted">{article.summary}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
