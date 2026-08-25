"use client";

import { Newspaper } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { timeAgo } from "@/lib/types";
import type { NewsItem, StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

function sentimentClass(v: number): string {
  if (v > 0.15) return "bg-success";
  if (v < -0.15) return "bg-danger";
  return "bg-muted-foreground/60";
}

function sentimentLabel(v: number): string {
  if (v > 0.15) return "Positive sentiment";
  if (v < -0.15) return "Negative sentiment";
  return "Neutral sentiment";
}

/** Newsflow list for the current stock. */
export function StockNewsSection({ d }: { d: StockDashboard }) {
  const news: NewsItem[] = d.news;

  return (
    <div>
      <SectionHeading
        icon={Newspaper}
        kicker="Newsflow"
        title="Latest News"
        right={
          news.length > 0 ? (
            <span className="text-xs text-muted-foreground">{news.length} updates</span>
          ) : undefined
        }
      />

      {news.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-panel/40 p-6 text-center text-sm text-muted-foreground">
          No recent news for this stock.
        </div>
      ) : (
        <ul className="space-y-3">
          {news.map((n) => (
            <li key={n.id}>
              <article className="news-card rounded-2xl border border-border/50 bg-panel/50 p-4 transition hover:border-brand/30">
                <div className="flex items-center gap-2">
                  {n.category && (
                    <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {n.category}
                    </span>
                  )}
                  <span
                    className={cn("h-2 w-2 rounded-full", sentimentClass(n.sentiment))}
                    title={sentimentLabel(n.sentiment)}
                    aria-label={sentimentLabel(n.sentiment)}
                  />
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-5 text-text">{n.title}</h3>
                {n.summary && (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {n.summary}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-brand">
                    {n.source}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {timeAgo(n.publishedAt)}
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
