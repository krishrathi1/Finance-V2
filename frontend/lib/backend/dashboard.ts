/**
 * Dashboard orchestrator — Node/TypeScript port of
 * backend/app/services/dashboard.py StockDashboardService.get_dashboard.
 *
 * Fans out to the live providers in parallel (each with its own timeout and a
 * hard global wall), merges with documented precedence, computes the derived
 * sections (returns, technicals, scores, AI target), and returns a fully-shaped
 * DashboardData. Never throws for transient provider failures — it degrades to
 * the neutral skeleton and signals usability via hasLiveDashboardCore.
 */

import type { DashboardData } from "@/lib/types";
import { baseSymbol, round2, safeCall, getText, DESKTOP_UA } from "@/lib/backend/http";
import { getSampleDashboard } from "@/lib/backend/sample";
import { getNseQuote, getNseCorporateEvents, getNseQuarterlyResults } from "@/lib/backend/providers/nse";
import { getYahooQuote, getYahooCandles, getYahooBundle } from "@/lib/backend/providers/yahoo";
import {
  getFmpQuote,
  getFmpCandles,
  getFmpQuarterlyResults,
  getFmpProfile,
  getFmpKeyMetrics,
  getFmpFinancialGrowth,
  getFmpAnalystEstimates,
} from "@/lib/backend/providers/fmp";
import {
  normalizeHistory,
  returnsSummary,
  returnsHeatmap,
  deriveTechnicals,
  calculatePredictiveTarget,
  finalizeKeyMetrics,
  finalizeKeyRatioTrends,
  enrichMetricsFromRatioTrends,
  buildFinancialGrowthSnapshot,
  normalizeShareholding,
  backfillQuarterlyFinancials,
  buildCompanyNews,
  hasLiveDashboardCore,
} from "@/lib/backend/derivations";
import { computeSmartScore, computeRiskScore } from "@/lib/backend/scoring";
import { explainSmartScore, explainRiskScore, extractProfileDetails } from "@/lib/backend/ai/features";

const TIMEFRAME_DAYS: Record<string, number> = { "1D": 1, "1W": 7, "1M": 30, "1Y": 365, "5Y": 1825 };

function timeframeDays(tf: string): number {
  return TIMEFRAME_DAYS[String(tf || "5Y").toUpperCase()] ?? 1825;
}

function num(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  return null;
}

const POS_WORDS = ["surge", "jump", "gain", "rise", "profit", "beat", "growth", "record", "upgrade", "bullish", "high", "strong", "rally", "soar", "outperform"];
const NEG_WORDS = ["fall", "drop", "loss", "decline", "miss", "downgrade", "bearish", "low", "weak", "slump", "plunge", "fraud", "probe", "cut", "concern", "lawsuit"];

function scoreSentiment(text: string): number {
  let s = 0.5;
  const t = text.toLowerCase();
  for (const w of POS_WORDS) if (t.includes(w)) s += 0.06;
  for (const w of NEG_WORDS) if (t.includes(w)) s -= 0.06;
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}

function parseRssItems(xml: string): Array<{ title: string; link: string; pubDate: string; source: string; description: string }> {
  const out: Array<{ title: string; link: string; pubDate: string; source: string; description: string }> = [];
  const blocks = xml.split(/<item>/i).slice(1);
  const clean = (s: string) =>
    s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();
  const pick = (b: string, tag: string) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? clean(m[1]) : "";
  };
  for (const b of blocks.slice(0, 20)) {
    const title = pick(b, "title");
    if (!title) continue;
    out.push({
      title,
      link: pick(b, "link"),
      pubDate: pick(b, "pubDate"),
      source: pick(b, "source") || "Google News",
      description: pick(b, "description"),
    });
  }
  return out;
}

/** Live company news via Google News RSS (keyless, reliable). Returns NewsItem[]. */
async function fetchSymbolNews(company: string, symbol: string): Promise<DashboardData["news"]> {
  const q = encodeURIComponent(`${company || symbol} stock`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
  const xml = await getText(url, { timeoutMs: 6000, headers: { "user-agent": DESKTOP_UA, accept: "application/rss+xml, text/xml, */*" } });
  if (!xml) return [];
  return parseRssItems(xml)
    .slice(0, 10)
    .map((it) => {
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

export interface BuildOptions {
  timeframe?: string;
  exchange?: string;
  allowGemini?: boolean;
}

/** Build a full, live DashboardData. Throws only if no meaningful live data was obtained. */
export async function buildDashboard(symbol: string, options: BuildOptions = {}): Promise<DashboardData> {
  const base = baseSymbol(symbol);
  const timeframe = String(options.timeframe || "5Y").toUpperCase();
  const requestedExchange =
    (options.exchange || "").trim().toUpperCase() || (/\.BO$/i.test(symbol) ? "BSE" : "NSE");
  const marketSymbol = requestedExchange === "BSE" ? `${base}.BO` : base;
  const historyDays = Math.max(timeframeDays(timeframe), 1825);

  // Working object (dynamically typed during merge, like the Python source).
  const data: any = getSampleDashboard(base);
  data.symbol = base;
  data.exchange = requestedExchange;

  // ---- Provider fan-out (parallel, per-call timeouts) ----
  const [
    nseQuote,
    nseEvents,
    nseQuarterly,
    yahooQuote,
    yahooCandles,
    yahooBundle,
    fmpQuote,
    fmpCandles,
    fmpQuarterly,
    fmpProfile,
    fmpKeyMetrics,
    fmpGrowth,
    fmpEstimates,
  ] = await Promise.all([
    safeCall(() => getNseQuote(base), 6000, "nseQuote"),
    safeCall(() => getNseCorporateEvents(base), 8000, "nseEvents"),
    safeCall(() => getNseQuarterlyResults(base), 8000, "nseQuarterly"),
    safeCall(() => getYahooQuote(marketSymbol), 6000, "yahooQuote"),
    safeCall(() => getYahooCandles(base, historyDays), 8000, "yahooCandles"),
    safeCall(() => getYahooBundle(marketSymbol, historyDays), 11000, "yahooBundle"),
    safeCall(() => getFmpQuote(marketSymbol), 6000, "fmpQuote"),
    safeCall(() => getFmpCandles(marketSymbol, "5Y"), 8000, "fmpCandles"),
    safeCall(() => getFmpQuarterlyResults(marketSymbol), 7000, "fmpQuarterly"),
    safeCall(() => getFmpProfile(marketSymbol), 6000, "fmpProfile"),
    safeCall(() => getFmpKeyMetrics(marketSymbol), 6000, "fmpKeyMetrics"),
    safeCall(() => getFmpFinancialGrowth(marketSymbol), 6000, "fmpGrowth"),
    safeCall(() => getFmpAnalystEstimates(marketSymbol), 6000, "fmpEstimates"),
  ]);

  const bundle: any = yahooBundle || {};

  // ---- Candle selection + price history (FMP -> yahooBundle -> yahooCandles) ----
  const selectedCandles: any[] = (fmpCandles && fmpCandles.length ? fmpCandles : null)
    || (bundle.candles && bundle.candles.length ? bundle.candles : null)
    || (yahooCandles && yahooCandles.length ? yahooCandles : null)
    || [];

  if (bundle.intraday && bundle.intraday.length) data.price.intraday = bundle.intraday;

  if (selectedCandles.length) {
    const history = normalizeHistory(selectedCandles);
    data.price.history = history;
    const closes = history.map((h) => h.close).filter((c) => typeof c === "number");
    if (closes.length >= 2) {
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      data.price.cmp = round2(last);
      data.price.change = round2(last - prev);
      data.price.changePercent = prev ? round2(((last - prev) / prev) * 100) : 0;
      const window = closes.slice(-252);
      data.price.fiftyTwoWeekLow = round2(Math.min(...window));
      data.price.fiftyTwoWeekHigh = round2(Math.max(...window));
    }
  }

  // ---- NSE quote: PRIMARY for live price + select metrics (NSE exchange only) ----
  if (nseQuote && requestedExchange !== "BSE") {
    const q: any = nseQuote;
    if (num(q.cmp) !== null) data.price.cmp = q.cmp;
    if (num(q.change) !== null) data.price.change = q.change;
    if (num(q.changePercent) !== null) data.price.changePercent = q.changePercent;
    if (num(q.fiftyTwoWeekHigh) !== null) data.price.fiftyTwoWeekHigh = q.fiftyTwoWeekHigh;
    if (num(q.fiftyTwoWeekLow) !== null) data.price.fiftyTwoWeekLow = q.fiftyTwoWeekLow;
    if (num(q.peRatio) !== null) data.metrics.peRatio = q.peRatio;
    if (num(q.industryPe) !== null) data.metrics.industryPe = q.industryPe;
    if (num(q.faceValue) !== null) data.metrics.faceValue = q.faceValue;
    if (num(q.outstandingShares) !== null) data.metrics.outstandingShares = q.outstandingShares;
    if (q.companyName) data.companyName = q.companyName;
  }

  // ---- Yahoo quote fallback + always-on metrics ----
  if (yahooQuote) {
    const q: any = yahooQuote;
    if (!nseQuote) {
      if (num(q.cmp) !== null) data.price.cmp = q.cmp;
      if (num(q.change) !== null) data.price.change = q.change;
      if (num(q.changePercent) !== null) data.price.changePercent = q.changePercent;
      if (num(q.fiftyTwoWeekHigh) !== null && !data.price.fiftyTwoWeekHigh) data.price.fiftyTwoWeekHigh = q.fiftyTwoWeekHigh;
      if (num(q.fiftyTwoWeekLow) !== null && !data.price.fiftyTwoWeekLow) data.price.fiftyTwoWeekLow = q.fiftyTwoWeekLow;
    }
    if (num(q.marketCap) !== null) data.metrics.marketCap = q.marketCap;
    if (num(q.peRatio) !== null && data.metrics.peRatio == null) data.metrics.peRatio = q.peRatio;
    if (num(q.dividendYield) !== null && data.metrics.dividendYield == null) data.metrics.dividendYield = q.dividendYield;
  }

  // ---- Yahoo bundle (yfinance-equivalent): metrics, financials, profile, shareholding ----
  if (bundle.quote && !nseQuote) {
    const q: any = bundle.quote;
    if (num(q.cmp) !== null && !data.price.cmp) data.price.cmp = q.cmp;
    if (num(q.change) !== null && !data.price.change) data.price.change = q.change;
    if (num(q.changePercent) !== null && !data.price.changePercent) data.price.changePercent = q.changePercent;
  }
  if (bundle.quote) {
    if (num(bundle.quote.fiftyTwoWeekHigh) !== null) data.price.fiftyTwoWeekHigh = data.price.fiftyTwoWeekHigh || bundle.quote.fiftyTwoWeekHigh;
    if (num(bundle.quote.fiftyTwoWeekLow) !== null) data.price.fiftyTwoWeekLow = data.price.fiftyTwoWeekLow || bundle.quote.fiftyTwoWeekLow;
  }
  if (bundle.metrics) {
    for (const k of Object.keys(bundle.metrics)) {
      if (data.metrics[k] == null && num(bundle.metrics[k]) !== null) data.metrics[k] = bundle.metrics[k];
    }
  }
  if (bundle.financials) {
    for (const k of ["quarterly", "yearly", "incomeStatement", "balanceSheet", "cashFlow"]) {
      if (bundle.financials[k] && bundle.financials[k].length) data.financials[k] = bundle.financials[k];
    }
  }
  if (bundle.profile) {
    const p = bundle.profile;
    if (p.companyName && data.companyName === base) data.companyName = p.companyName;
    if (p.sector && !data.sector) data.sector = p.sector;
    for (const k of ["description", "website", "industry", "chairman", "previousName", "ceo", "employees", "country", "headquarters"]) {
      if (p[k] && !data.profile[k]) data.profile[k] = p[k];
    }
  }
  if (bundle.shareholding && (num(bundle.shareholding.promoters) || num(bundle.shareholding.fii))) {
    data.shareholding = { ...data.shareholding, ...bundle.shareholding };
  }

  // ---- FMP quote fallback + profile/keyMetrics/growth/estimates ----
  if (fmpQuote && !nseQuote) {
    const q: any = fmpQuote;
    if (num(q.cmp) !== null && !data.price.cmp) data.price.cmp = q.cmp;
    if (num(q.change) !== null && !data.price.change) data.price.change = q.change;
    if (num(q.changePercent) !== null && !data.price.changePercent) data.price.changePercent = q.changePercent;
    if (q.companyName && data.companyName === base) data.companyName = q.companyName;
  }
  if (fmpProfile) {
    const p: any = fmpProfile;
    if (p.companyName && data.companyName === base) data.companyName = p.companyName;
    if (p.sector && !data.sector) data.sector = p.sector;
    for (const k of ["description", "website", "industry"]) if (p[k] && !data.profile[k]) data.profile[k] = p[k];
    for (const k of ["ceo", "employees", "ipoDate", "country"]) if (p[k]) data.profile[k] = p[k];
  }
  if (fmpKeyMetrics && fmpKeyMetrics.length) {
    data.fmpKeyMetrics = fmpKeyMetrics;
    const row: any = fmpKeyMetrics[0] || {};
    const map: Record<string, string> = {
      evToEbitda: "evToEbitda", peRatio: "pe", pbRatio: "pb", roe: "roe", roic: "roic",
      debtToEquity: "debtToEquity", currentRatio: "currentRatio",
    };
    for (const [src, dst] of Object.entries(map)) {
      if (num(row[src]) !== null && (data.metrics[dst] == null)) data.metrics[dst] = row[src];
    }
  }
  if (fmpGrowth && fmpGrowth.length) data.fmpFinancialGrowth = fmpGrowth;
  if (fmpEstimates && fmpEstimates.length) data.analystEstimates = fmpEstimates;

  // ---- Company news ----
  const rssNews = (await safeCall(() => fetchSymbolNews(data.companyName || base, base), 7000, "symbolNews")) || [];
  if (rssNews.length) {
    data.news = rssNews;
  } else {
    try {
      data.news = buildCompanyNews(base, data.companyName || base, data.sector || "", data.profile.industry || "", bundle.news || [], []);
    } catch { /* keep [] */ }
  }

  // ---- Corporate actions + quarterly chain ----
  if (nseEvents) data.corporateActions = { ...data.corporateActions, ...nseEvents };
  if (nseQuarterly) {
    const q: any = nseQuarterly;
    for (const k of ["quarterly", "quarterlyStandalone", "quarterlyConsolidated", "quarterlyDetailedStandalone", "quarterlyDetailedConsolidated"]) {
      if (q[k] && q[k].length) data.financials[k] = q[k];
    }
  }
  if (fmpQuarterly && fmpQuarterly.length) {
    data.financials.fmpQuarterly = fmpQuarterly;
    if (!data.financials.quarterly || !data.financials.quarterly.length) data.financials.quarterly = fmpQuarterly;
  }

  // ---- Shareholding normalize ----
  try { data.shareholding = normalizeShareholding(data.shareholding); } catch { /* keep */ }

  // ---- Backfill quarterly ----
  try { backfillQuarterlyFinancials(data.financials); } catch { /* keep */ }

  // ---- competitors reset (parity with Python) ----
  data.competitors = {
    table: [],
    sectorName: data.sector || "",
    industryName: data.profile.industry || "",
    sectorCompanies: [],
    industryCompanies: [],
  };

  // ---- Derived sections (order matters) ----
  if (data.price.change == null && data.price.changePercent != null && data.price.cmp) {
    const pct = data.price.changePercent;
    data.price.change = round2((data.price.cmp * pct) / (100 + pct || 1));
  }
  data.metrics = finalizeKeyMetrics(data.metrics, data.price, data.financials, data.competitors);
  data.returnsSummary = returnsSummary(data.price.history);
  data.returnsHeatmap = returnsHeatmap(data.price.history);
  data.financials.keyRatioTrends = finalizeKeyRatioTrends(
    data.financials.keyRatioTrends, data.metrics, data.financials, data.price.history, data.sector || ""
  );
  data.metrics = enrichMetricsFromRatioTrends(data.metrics, data.financials.keyRatioTrends);
  const growth = buildFinancialGrowthSnapshot(null, data.financials, data.returnsSummary, data.corporateActions.dividends || []);
  if (growth) data.financials.growthSnapshot = growth;
  data.technicals = deriveTechnicals(data.price.history);
  data.price.aiTarget = calculatePredictiveTarget(data.price.history, data.metrics, data.technicals, data.price.cmp || 0);

  data.smartScore = computeSmartScore({
    metrics: data.metrics,
    technicals: data.technicals,
    financials: data.financials,
    priceHistory: data.price.history,
    returnsSummary: data.returnsSummary,
    news: data.news,
    corporateActions: data.corporateActions,
    shareholding: data.shareholding,
  });
  data.riskScore = computeRiskScore({
    news: data.news,
    metrics: data.metrics,
    technicals: data.technicals,
    priceHistory: data.price.history,
    financials: data.financials,
    brokerageResearch: data.brokerageResearch,
  });

  data.timeframe = timeframe;

  // ---- Optional AI enrichment (bounded; never blocks materially) ----
  if (options.allowGemini) {
    try {
      const weakHint = Object.entries(data.smartScore.dimensions || {}).sort((a: any, b: any) => a[1] - b[1])[0]?.[0];
      const highHint = Object.entries(data.riskScore.components || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0];
      const [smart, risk, profile] = await Promise.all([
        safeCall(() => explainSmartScore(base, data.smartScore.score, data.smartScore.dimensions, weakHint), 9000, "explainSmart"),
        safeCall(() => explainRiskScore(base, data.riskScore.score, data.riskScore.components, highHint), 9000, "explainRisk"),
        (!data.profile.incorporationYear || !data.profile.headquarters)
          ? safeCall(() => extractProfileDetails(base, data.companyName, data.profile.description || ""), 9000, "profile")
          : Promise.resolve(null),
      ]);
      if (smart?.source === "gemini" && smart.aiExplanation) { data.smartScore.aiExplanation = smart.aiExplanation; data.smartScore.aiSource = "gemini"; }
      if (risk?.source === "gemini" && risk.aiExplanation) { data.riskScore.aiExplanation = risk.aiExplanation; data.riskScore.aiSource = "gemini"; }
      if (profile?.source === "gemini") {
        if (profile.incorporationYear && !data.profile.incorporationYear) data.profile.incorporationYear = profile.incorporationYear;
        if (profile.headquarters && !data.profile.headquarters) data.profile.headquarters = profile.headquarters;
        if (profile.chairman && data.profile.chairman === "N/A") data.profile.chairman = profile.chairman;
        if (profile.previousName && data.profile.previousName === "N/A") data.profile.previousName = profile.previousName;
      }
    } catch { /* AI is best-effort */ }
  }

  if (!hasLiveDashboardCore(data)) {
    throw new Error(`No meaningful live dashboard data for ${base}`);
  }

  return data as DashboardData;
}
