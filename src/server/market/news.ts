// Deterministic market news generator — realistic Indian market headlines
// seeded per day, rotating companies, sectors and outcomes.

import { UNIVERSE, UNIVERSE_BY_SYMBOL, StockSeed } from "./universe";
import { mulberry32, hashString, istDateKey, istNow } from "./rng";
import { getLiveQuote } from "./engine";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string; // ISO
  url: string;
  summary: string;
  sentiment: number; // 0..1
  symbols: string[];
  category: string;
}

const SOURCES = [
  "Economic Times", "Moneycontrol", "Mint", "Business Standard",
  "CNBC-TV18", "Bloomberg Quint", "Reuters India", "Financial Express",
];

const MACRO_TEMPLATES: { t: string; c: string; s: number }[] = [
  { t: "RBI keeps repo rate steady at 6.50%, flags food inflation risks", c: "Macro", s: 0.55 },
  { t: "FPIs turn net buyers in Indian equities; pump ₹{x} crore this month", c: "Flows", s: 0.78 },
  { t: "GST collections hit record high, signalling demand strength", c: "Macro", s: 0.8 },
  { t: "India's CPI inflation eases to 4.9% in latest print, within tolerance band", c: "Macro", s: 0.72 },
  { t: "FIIs sell ₹{x} crore in cash market; DIIs absorb the supply", c: "Flows", s: 0.35 },
  { t: "Nifty forms bullish candle on daily chart; analysts see room to 24,800", c: "Technical", s: 0.7 },
  { t: "Rupee weakens past 84/USD as dollar index firms ahead of Fed meet", c: "Macro", s: 0.4 },
  { t: "India VIX cools below 13; options data shows traders pricing calm", c: "Volatility", s: 0.68 },
  { t: "SEBI tightens disclosure norms for promoter pledges", c: "Regulatory", s: 0.52 },
  { t: "Q2 GDP growth at 6.8% keeps India fastest-growing major economy", c: "Macro", s: 0.82 },
  { t: "Crude oil slips below $75/barrel — relief for OMCs, paints and aviation", c: "Commodity", s: 0.74 },
  { t: "Nifty IT index outperforms as US client spend commentary improves", c: "Sector", s: 0.76 },
  { t: "Bank Nifty gains as credit growth holds above 13% amid stable asset quality", c: "Sector", s: 0.75 },
  { t: "Midcap and smallcap indices hit fresh record highs; breadth stays positive", c: "Market", s: 0.8 },
  { t: "India's forex reserves at record $700+ billion, RBI data shows", c: "Macro", s: 0.78 },
];

const COMPANY_TEMPLATES: { t: string; c: string; s: number }[] = [
  { t: "{co} Q2 profit jumps {p}% YoY to ₹{x} crore, beats street estimates", c: "Results", s: 0.85 },
  { t: "{co} board approves buyback worth ₹{x} crore; stock reacts", c: "Corporate", s: 0.82 },
  { t: "Brokerage raises {sym} target price after strong margin show", c: "Brokerage", s: 0.8 },
  { t: "{sym} slips as Q2 revenue misses estimates; margin contracts {p} bps", c: "Results", s: 0.28 },
  { t: "{co} bags large order win worth ₹{x} crore, order book at record", c: "Order Win", s: 0.86 },
  { t: "{co} announces capex plan of ₹{x} crore to expand capacity", c: "Capex", s: 0.7 },
  { t: "FII holding in {sym} rises {p}% q-o-q; institutional interest builds", c: "Shareholding", s: 0.75 },
  { t: "{sym} hits 52-week high on heavy volumes; up {p}% this month", c: "Momentum", s: 0.84 },
  { t: "Promoter pledge in {sym} declines, easing overhang concerns", c: "Governance", s: 0.72 },
  { t: "{co} to consider stock split next board meet; retail interest builds", c: "Corporate", s: 0.7 },
  { t: "Analysts flag rich valuations in {sym} after the recent rally", c: "Valuation", s: 0.4 },
  { t: "{co} launches new product line; management guides mid-teens growth", c: "Business", s: 0.74 },
  { t: "GST notice of ₹{x} crore to {co}; company to appeal", c: "Regulatory", s: 0.3 },
  { t: "{co} declares interim dividend of ₹{p} per share", c: "Dividend", s: 0.75 },
  { t: "Block deal in {sym}: {x} crore change hands at slight discount", c: "Deals", s: 0.5 },
  { t: "{co} profit declines {p}% YoY on weak demand; stock under pressure", c: "Results", s: 0.25 },
  { t: "Global brokerage initiates coverage on {sym} with Buy rating", c: "Brokerage", s: 0.8 },
  { t: "{co} completes acquisition; synergy gains expected from FY26", c: "M&A", s: 0.7 },
];

function pickStock(rand: () => number): StockSeed {
  return UNIVERSE[Math.floor(rand() * UNIVERSE.length)];
}

function fmtCr(rand: () => number): string {
  const v = Math.round(200 + rand() * 4800);
  return v.toLocaleString("en-IN");
}

function renderTemplate(tpl: { t: string; c: string; s: number }, stock: StockSeed, rand: () => number): NewsItem {
  const title = tpl.t
    .replace("{co}", stock.n)
    .replace("{sym}", stock.s)
    .replace("{x}", fmtCr(rand))
    .replace("{p}", String(Math.round(4 + rand() * 38)));
  const q = getLiveQuote(stock.s);
  const summary =
    tpl.c === "Results"
      ? `${stock.n} reported ${tpl.s > 0.5 ? "stronger-than-expected" : "weaker-than-expected"} numbers with revenue growth of ${stock.rg}% and profit growth of ${stock.pg}%. The stock trades at ₹${q?.price ?? stock.p}, ${q && q.changePercent >= 0 ? "up" : "down"} ${Math.abs(q?.changePercent ?? 0).toFixed(2)}% on the day.`
      : `${stock.n} (${stock.sec}) news. Shares are at ₹${q?.price ?? stock.p} (${q && q.changePercent >= 0 ? "+" : ""}${(q?.changePercent ?? 0).toFixed(2)}% today). Market cap ₹${(stock.mc / 100000).toFixed(2)}L Cr.`;
  const hoursAgo = Math.round(rand() * 30);
  const publishedAt = new Date(istNow().getTime() - hoursAgo * 3600000).toISOString();
  return {
    id: "",
    title,
    source: SOURCES[Math.floor(rand() * SOURCES.length)],
    publishedAt,
    url: "#",
    summary,
    sentiment: clamp01(tpl.s + (rand() - 0.5) * 0.16),
    symbols: [stock.s],
    category: tpl.c,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const marketNewsCache = new Map<string, NewsItem[]>();

export function getMarketNews(count = 18): NewsItem[] {
  const dayKey = istDateKey();
  const cached = marketNewsCache.get(dayKey);
  if (cached) return cached.slice(0, count);

  const items: NewsItem[] = [];
  const rand = mulberry32(hashString(`news-${dayKey}`));

  // 5 macro items
  const macroPicks = new Set<number>();
  while (macroPicks.size < 5) macroPicks.add(Math.floor(rand() * MACRO_TEMPLATES.length));
  for (const idx of macroPicks) {
    const tpl = MACRO_TEMPLATES[idx];
    const title = tpl.t.replace("{x}", fmtCr(rand));
    const hoursAgo = Math.round(rand() * 30);
    items.push({
      id: "",
      title,
      source: SOURCES[Math.floor(rand() * SOURCES.length)],
      publishedAt: new Date(istNow().getTime() - hoursAgo * 3600000).toISOString(),
      url: "#",
      summary: `Macro desk: ${title}. Cross-asset desk notes positioning remains balanced heading into the next policy window.`,
      sentiment: clamp01(tpl.s + (rand() - 0.5) * 0.1),
      symbols: [],
      category: tpl.c,
    });
  }

  // company items across distinct names
  const used = new Set<string>();
  let guard = 0;
  while (items.length < 34 && guard < 200) {
    guard++;
    const stock = pickStock(rand);
    if (used.has(stock.s)) continue;
    used.add(stock.s);
    const tpl = COMPANY_TEMPLATES[Math.floor(rand() * COMPANY_TEMPLATES.length)];
    items.push(renderTemplate(tpl, stock, rand));
  }

  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const withIds = items.map((n, i) => ({ ...n, id: `${dayKey}-${i}` }));
  marketNewsCache.set(dayKey, withIds);
  return withIds.slice(0, count);
}

export function computeNewsForStock(symbol: string): NewsItem[] {
  const seed = UNIVERSE_BY_SYMBOL[symbol];
  if (!seed) return [];
  const dayKey = istDateKey();
  const rand = mulberry32(hashString(`stocknews-${symbol}-${dayKey}`));
  const n = 3 + Math.floor(rand() * 3);
  const items: NewsItem[] = [];
  for (let i = 0; i < n; i++) {
    const tpl = COMPANY_TEMPLATES[Math.floor(rand() * COMPANY_TEMPLATES.length)];
    items.push(renderTemplate(tpl, seed, rand));
  }
  items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return items.map((item, i) => ({ ...item, id: `${symbol}-${dayKey}-${i}` }));
}

/** Keyword-based sentiment used by the risk scoring narrative component */
export function sentimentOf(title: string): number {
  const lower = title.toLowerCase();
  let score = 0.5;
  const positive = ["jumps", "beats", "win", "record", "high", "raises", "buy", "strong", "gains", "surges", "approves", "dividend", "growth", "eases"];
  const negative = ["misses", "slips", "declines", "falls", "probe", "notice", "weak", "pressure", "fraud", "penalty", "sells", "slump"];
  for (const w of positive) if (lower.includes(w)) score += 0.09;
  for (const w of negative) if (lower.includes(w)) score -= 0.09;
  return clamp01(score);
}
