/**
 * Google News RSS provider — keyless, reliable company/market news.
 * Used by the dashboard orchestrator and the per-symbol /news route since the
 * NewsAPI free tier is rate-limited (429).
 */

import { getText, DESKTOP_UA } from "@/lib/backend/http";
import type { NewsItem } from "@/lib/types";

const POS = ["surge", "jump", "gain", "rise", "profit", "beat", "growth", "record", "upgrade", "bullish", "high", "strong", "rally", "soar", "outperform", "win", "approval"];
const NEG = ["fall", "drop", "loss", "decline", "miss", "downgrade", "bearish", "weak", "slump", "plunge", "fraud", "probe", "cut", "concern", "lawsuit", "penalty", "raid"];

export function scoreSentiment(text: string): number {
  let s = 0.5;
  const t = (text || "").toLowerCase();
  for (const w of POS) if (t.includes(w)) s += 0.06;
  for (const w of NEG) if (t.includes(w)) s -= 0.06;
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}

function parseRssItems(xml: string): Array<{ title: string; link: string; pubDate: string; source: string; description: string }> {
  const out: Array<{ title: string; link: string; pubDate: string; source: string; description: string }> = [];
  const clean = (s: string) =>
    s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();
  const pick = (b: string, tag: string) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? clean(m[1]) : "";
  };
  for (const b of xml.split(/<item>/i).slice(1).slice(0, 25)) {
    const title = pick(b, "title");
    if (!title) continue;
    out.push({ title, link: pick(b, "link"), pubDate: pick(b, "pubDate"), source: pick(b, "source") || "Google News", description: pick(b, "description") });
  }
  return out;
}

/** Fetch live news for a query (company/symbol or market) via Google News RSS. */
export async function getGoogleNews(query: string, limit = 12): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const xml = await getText(url, { timeoutMs: 6000, headers: { "user-agent": DESKTOP_UA, accept: "application/rss+xml, text/xml, */*" } });
  if (!xml) return [];
  return parseRssItems(xml).slice(0, limit).map((it) => {
    let publishedAt = new Date().toISOString();
    if (it.pubDate) {
      const d = new Date(it.pubDate);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }
    return {
      title: it.title,
      source: it.source,
      publishedAt,
      url: it.link,
      summary: it.description || it.title,
      sentimentScore: scoreSentiment(`${it.title} ${it.description}`),
    };
  });
}
