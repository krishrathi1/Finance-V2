"use client";

import { useEffect, useState } from "react";

import { fetchMarketNews } from "@/lib/api";

type NewsArticle = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  summary: string;
  imageUrl: string | null;
};

const MARKET_PLACEHOLDER = 'https://images.unsplash.com/photo-1611974717482-98aa003745fc?auto=format&fit=crop&q=80&w=800';

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

  useEffect(() => {
    let alive = true;
    const load = async (forceRefresh = false) => {
      try {
        const data = await fetchMarketNews({ force: forceRefresh });
        if (alive) {
          if (data.length || !forceRefresh) {
            setArticles((current) => {
              if (!forceRefresh) {
                return data;
              }
              return countImages(data) >= countImages(current) ? data : current;
            });
            setLastUpdated(new Date().toLocaleTimeString());
          }
        }
      } catch {
        if (alive && !forceRefresh) setArticles([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void (async () => {
      await load(false);
      if (alive) {
        await load(true);
      }
    })();
    const timer = setInterval(() => {
      void load(true);
    }, 2 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

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
            {article.imageUrl ? (
              <div className="relative h-32 w-full shrink-0 overflow-hidden bg-background/50 sm:h-40">
                <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-70" />
                {hasUsableImage(article.imageUrl) ? (
                  <img
                    src={`/api/v1/stocks/proxy-image?url=${encodeURIComponent(article.imageUrl!)}`}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = MARKET_PLACEHOLDER;
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted/20">
                    <img 
                      src={MARKET_PLACEHOLDER} 
                      className="h-full w-full object-cover opacity-60" 
                      alt="Market"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest opacity-80">Market Insight</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="news-image-fallback flex h-32 w-full shrink-0 items-center justify-center text-xs text-muted sm:h-40">No Image</div>
            )}
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
