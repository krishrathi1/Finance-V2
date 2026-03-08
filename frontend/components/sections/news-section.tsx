import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { NewsItem } from "@/lib/types";

export function NewsSection({ news }: { news: NewsItem[] }) {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Company News & Sentiment</h3>
      <div className="mt-3 space-y-3">
        {news.map((item, index) => (
          <Link
            href={item.url}
            target="_blank"
            key={index}
            className="block rounded-xl border border-border/70 p-3 transition hover:border-accent/70"
          >
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted">
              {item.source} · {item.publishedAt}
            </p>
            <p className="mt-2 text-sm text-muted">{item.summary}</p>
            <p className={`mt-2 text-xs font-semibold ${item.sentimentScore >= 0.55 ? "text-success" : "text-danger"}`}>
              Sentiment {(item.sentimentScore * 100).toFixed(0)}%
            </p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
