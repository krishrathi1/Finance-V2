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

/** Recognised HTML tags only — leaves prose like "<XYZ>" intact. */
const HTML_TAG = /<\/?(?:a|b|i|em|strong|u|s|p|br|hr|div|span|ol|ul|li|dl|dt|dd|font|small|big|table|thead|tbody|tr|td|th|img|figure|figcaption|blockquote|code|pre|h[1-6])\b[^>]*>/gi;

function decodeEntities(s: string): string {
  return (
    s
      // Whitespace entities collapse to a plain space.
      .replace(/&(?:nbsp|ensp|emsp|thinsp|#160|#xa0);/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&apos;|&#39;|&rsquo;|&lsquo;/gi, "'")
      .replace(/&(?:ndash|mdash|#8211|#8212);/gi, "-")
      .replace(/&hellip;|&#8230;/gi, "...")
      // `&amp;` must come last: decoding it earlier would turn `&amp;lt;` into
      // `&lt;` and then into a real `<`, re-introducing markup from text that
      // was only ever meant to read as an ampersand.
      .replace(/&amp;/gi, "&")
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Google's <description> is usually just the headline followed by the
 * publisher name — the same two things the card already shows above it. Once
 * that is removed there is often nothing left, and echoing the title back is
 * worse than showing no summary at all. Returns "" when the description adds
 * nothing, and the genuine extra prose when it does (some items carry a couple
 * of related headlines).
 */
export function meaningfulSummary(description: string, title: string, source: string): string {
  if (!description) return "";

  // Google titles end in " - Publisher"; the description repeats the headline
  // without that suffix, so compare against the bare headline.
  const titleCore = source
    ? title.replace(new RegExp(`\\s*[-–|]\\s*${escapeRegExp(source)}\\s*$`, "i"), "").trim()
    : title;

  let rest = description;
  const normalizedTitle = normalizeForCompare(titleCore);
  if (normalizedTitle && normalizeForCompare(description).startsWith(normalizedTitle)) {
    // Walk forward through the original string by word count so the slice
    // lands on a real boundary rather than a normalized-length offset.
    const words = titleCore.split(/\s+/).filter(Boolean).length;
    rest = description.split(/\s+/).slice(words).join(" ");
  }

  if (source) rest = rest.replace(new RegExp(escapeRegExp(source), "gi"), " ");
  rest = rest.replace(/\s+/g, " ").trim();

  return normalizeForCompare(rest).length < 30 ? "" : rest;
}

export function parseRssItems(xml: string): Array<{ title: string; link: string; pubDate: string; source: string; description: string }> {
  const out: Array<{ title: string; link: string; pubDate: string; source: string; description: string }> = [];
  const clean = (s: string) => {
    // Extract CDATA content verbatim and skip the tag-stripping pass entirely
    // for it — a title like "Firm <XYZ> profit" inside CDATA is literal text,
    // not markup, so "<XYZ>" must survive.
    const cdata = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdata) return cdata[1].replace(/\s+/g, " ").trim();
    return s.replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();
  };
  // Google News sends <description> as entity-escaped HTML
  // (`&lt;a href="..."&gt;headline&lt;/a&gt;&amp;nbsp;&lt;font&gt;Source&lt;/font&gt;`),
  // never as CDATA. `clean` above therefore found no literal tags to strip and
  // then replaced every `&lt;`/`&gt;` with a space, which erased the brackets
  // but kept the attribute text — rendering as
  // `a href="..." target="_blank" headline /a nbsp; font color="#6f6f6f"`.
  // Order is the whole fix: decode entities first, *then* strip markup.
  const cleanDescription = (s: string) => {
    const raw = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] ?? s;
    // Only strip recognised HTML tags, so a literal "<XYZ>" in prose survives
    // the same way it does in a title.
    const stripped = decodeEntities(raw).replace(HTML_TAG, " ");
    // Decode once more: Google double-encodes the inner markup, so entities
    // like `&amp;nbsp;` only become `&nbsp;` after the first pass.
    return decodeEntities(stripped).replace(/\s+/g, " ").trim();
  };
  // Tolerate attributes/namespace prefixes on the item tag itself (e.g. RDF's <item rdf:about="...">).
  const pick = (b: string, tag: string, transform: (s: string) => string = clean) => {
    // Allow an optional namespace prefix on the tag name (e.g. <media:title>).
    const m = b.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i"));
    return m ? transform(m[1]) : "";
  };
  for (const b of xml.split(/<item[^>]*>/i).slice(1).slice(0, 25)) {
    const title = pick(b, "title");
    if (!title) continue;
    out.push({
      title,
      link: pick(b, "link"),
      pubDate: pick(b, "pubDate"),
      source: pick(b, "source") || "Google News",
      description: pick(b, "description", cleanDescription),
    });
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
      summary: meaningfulSummary(it.description, it.title, it.source),
      sentimentScore: scoreSentiment(`${it.title} ${it.description}`),
    };
  });
}
