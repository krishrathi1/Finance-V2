/**
 * Google News RSS provider — keyless, reliable company/market news.
 * Used by the dashboard orchestrator and the per-symbol /news route since the
 * NewsAPI free tier is rate-limited (429).
 */

import { getText, DESKTOP_UA } from "@/lib/backend/http";
import type { NewsItem } from "@/lib/types";

const POS = ["surge", "jump", "gain", "rise", "profit", "beat", "growth", "record", "upgrade", "bullish", "high", "rally", "soar", "outperform", "win", "approval"];
const NEG = ["fall", "drop", "loss", "decline", "miss", "downgrade", "bearish", "weak", "slump", "plunge", "fraud", "probe", "cut", "concern", "lawsuit", "penalty", "raid"];
// Magnitude modifiers, not standalone sentiment: "strong decline" is very
// negative, not "positive strong" + "negative decline" cancelling out.
const INTENSIFIERS = ["strong", "sharp", "steep", "significant", "massive", "major"];
const NEGATIONS = ["no", "not", "without", "never", "hardly", "barely", "denies", "denied", "lacks"];

export function scoreSentiment(text: string): number {
  let s = 0.5;
  const words = (text || "").toLowerCase().split(/[^a-z']+/).filter(Boolean);
  const negatedAt = (idx: number) => {
    for (let i = Math.max(0, idx - 3); i < idx; i++) {
      if (NEGATIONS.includes(words[i]) || words[i].endsWith("n't")) return true;
    }
    return false;
  };
  words.forEach((word, idx) => {
    if (INTENSIFIERS.includes(word)) return;
    const magnitude = idx > 0 && INTENSIFIERS.includes(words[idx - 1]) ? 0.12 : 0.06;
    if (POS.includes(word)) s += negatedAt(idx) ? -magnitude : magnitude;
    else if (NEG.includes(word)) s += negatedAt(idx) ? magnitude : -magnitude;
  });
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}

function parseRssItems(xml: string): Array<{ title: string; link: string; pubDate: string; source: string; description: string }> {
  const out: Array<{ title: string; link: string; pubDate: string; source: string; description: string }> = [];
  const clean = (s: string) => {
    // Extract CDATA content verbatim and skip the tag-stripping pass entirely
    // for it — a title like "Firm <XYZ> profit" inside CDATA is literal text,
    // not markup, so "<XYZ>" must survive.
    const cdata = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdata) return cdata[1].replace(/\s+/g, " ").trim();
    return s.replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();
  };
  // Tolerate attributes/namespace prefixes on the item tag itself (e.g. RDF's <item rdf:about="...">).
  const pick = (b: string, tag: string) => {
    // Allow an optional namespace prefix on the tag name (e.g. <media:title>).
    const m = b.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i"));
    return m ? clean(m[1]) : "";
  };
  for (const b of xml.split(/<item[^>]*>/i).slice(1).slice(0, 25)) {
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
  if (!/<rss[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml)) {
    console.warn(`[news] getGoogleNews got a non-RSS response for "${query}" (first 200 chars): ${xml.slice(0, 200).replace(/\s+/g, " ")}`);
    return [];
  }
  const items = parseRssItems(xml);
  if (items.length === 0) console.warn(`[news] getGoogleNews parsed 0 items from an RSS-looking response for "${query}"`);
  return items.slice(0, limit).map((it) => {
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
