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
          setArticles(data);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        if (alive) setArticles([]);
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
    return <div className="h-40 w-full animate-pulse rounded-2xl bg-panel/50" />;
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
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {articles.map((article, idx) => (
          <a
            key={`${article.url}-${idx}`}
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="group flex h-[320px] flex-col overflow-hidden rounded-2xl border border-border/50 bg-panel transition-colors hover:border-accent hover:bg-panel/80"
          >
            {article.imageUrl ? (
              <div className="relative h-40 w-full shrink-0 overflow-hidden bg-background/50">
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="flex h-40 w-full shrink-0 items-center justify-center bg-background/50 text-xs text-muted">No Image</div>
            )}
            <div className="flex flex-1 flex-col p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span className="font-semibold text-accent/80">{article.source}</span>
                <span>{article.publishedAt}</span>
              </div>
              <h3 className="line-clamp-3 text-sm font-semibold leading-snug transition-colors group-hover:text-accent">{article.title}</h3>
              <p className="mt-2 line-clamp-3 text-xs text-muted">{article.summary}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
