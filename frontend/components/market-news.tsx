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
            setArticles(data);
            setLastUpdated(new Date().toLocaleTimeString());
          }
        }
      } catch {
        if (alive && !forceRefresh) setArticles([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load(false);
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
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent) {
                      parent.classList.add("news-image-fallback");
                    }
                  }}
                />
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
