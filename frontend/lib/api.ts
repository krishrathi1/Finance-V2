import type { DashboardData, ScreenerFilters, ScreenerResult } from "@/lib/types";

const INTERNAL_BASE = normalizeBaseUrl(process.env.INTERNAL_API_BASE);
const PUBLIC_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE || '');
const memoryCache = new Map<string, { at: number; data: unknown }>();

export type DashboardEnvelope = {
  data: DashboardData;
  cached?: boolean;
  stale?: boolean;
  fallback?: boolean;
  warning?: string;
};

function normalizeBaseUrl(value?: string) {
  return String(value || "").trim().replace(/\/$/, "");
}

function getServerApiBase() {
  return INTERNAL_BASE || PUBLIC_BASE || '';
}

function getApiUrl(path: string, type: "stocks" | "auth" | "portfolio" = "stocks") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const prefix = `/api/v1/${type}`;

  if (typeof window !== "undefined") {
    return `${prefix}${normalizedPath}`;
  }

  const base = getServerApiBase();
  return `${base}${prefix}${normalizedPath}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getFreshCache<T>(key: string, maxAgeMs: number): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.data as T;
}

function getStaleCache<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  return hit ? (hit.data as T) : null;
}

function setCache<T>(key: string, data: T) {
  memoryCache.set(key, { at: Date.now(), data });
}

function isAbortError(error: unknown) {
  if (!error) return false;
  if (error instanceof Error && error.name === "AbortError") return true;
  return String(error).toLowerCase().includes("aborted");
}

export async function fetchDashboardEnvelope(
  symbol: string,
  options: { requestOrigin?: string; exchange?: string } = {}
): Promise<DashboardEnvelope> {
  const normalizedExchange = String(options.exchange || "NSE").trim().toUpperCase() || "NSE";
  const key = `dashboard:${symbol.toUpperCase()}:5Y:${normalizedExchange}`;
  const fresh = getFreshCache<DashboardEnvelope>(key, 30_000);
  if (fresh) return fresh;

  const stale = getStaleCache<DashboardEnvelope>(key);
  const attempts = [
    { timeoutMs: 15_000, refresh: false },
    { timeoutMs: 20_000, refresh: true }
  ];
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const res = await fetchWithTimeout(
        getApiUrl(`/${symbol}/dashboard?timeframe=5Y&exchange=${encodeURIComponent(normalizedExchange)}${attempt.refresh ? "&refresh=true" : ""}`),
        {
          cache: "no-store"
        },
        attempt.timeoutMs
      );
      if (!res.ok) {
        throw new Error(`Dashboard request failed: ${res.status}`);
      }
      const payload = await res.json();
      const envelope = {
        data: payload.data as DashboardData,
        cached: Boolean(payload.cached),
        stale: Boolean(payload.stale),
        fallback: Boolean(payload.fallback),
        warning: typeof payload.warning === "string" ? payload.warning : undefined
      } satisfies DashboardEnvelope;
      setCache(key, envelope);
      return envelope;
    } catch (error) {
      lastError = error;
    }
  }

  if (stale) return stale;
  if (isAbortError(lastError)) {
    throw new Error("Dashboard request timed out. Please retry in a few seconds.");
  }
  throw (lastError instanceof Error ? lastError : new Error("Dashboard request failed"));
}

export async function fetchDashboard(symbol: string, options: { exchange?: string } = {}): Promise<DashboardData> {
  const envelope = await fetchDashboardEnvelope(symbol, options);
  return envelope.data;
}

export async function searchStocks(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      getApiUrl(`/search?q=${encodeURIComponent(query)}`),
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("search failed");
    const payload = await res.json();
    return payload.results || [];
  } catch {
    return [];
  }
}

export async function sendAiQuestion(symbol: string, question: string): Promise<{ answer: string; source: "gemini" | "fallback" }> {
  try {
    const res = await fetch(getApiUrl(`/${symbol}/chat`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    if (!res.ok) throw new Error("chat failed");
    const payload = await res.json();
    return {
      answer: payload.answer || "No response.",
      source: payload.source === "gemini" ? "gemini" : "fallback"
    };
  } catch {
    return {
      answer: "AI engine unavailable right now.",
      source: "fallback"
    };
  }
}

export async function fetchWatchlistAnalysis(symbol: string): Promise<{ answer: string; source: "gemini" | "fallback" }> {
  try {
    const res = await fetch(getApiUrl(`/${symbol}/watchlist-analysis`), {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("watchlist analysis failed");
    const payload = await res.json();
    return {
      answer: payload.answer || "No analysis available.",
      source: payload.source === "gemini" ? "gemini" : "fallback"
    };
  } catch {
    return {
      answer: "AI review is unavailable right now.",
      source: "fallback"
    };
  }
}

export async function fetchCompareAnalysis(
  symbolA: string,
  symbolB: string
): Promise<{ answer: string; source: "gemini" | "fallback" }> {
  try {
    const res = await fetch(getApiUrl("/compare-analysis"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol_a: symbolA, symbol_b: symbolB }),
      cache: "no-store"
    });
    if (!res.ok) throw new Error("compare analysis failed");
    const payload = await res.json();
    return {
      answer: payload.answer || "No analysis available.",
      source: payload.source === "gemini" ? "gemini" : "fallback"
    };
  } catch {
    return {
      answer: "AI comparison analysis is unavailable right now.",
      source: "fallback"
    };
  }
}

export async function analyzeNewsItem(
  symbol: string,
  article: { title: string; summary: string; source: string; publishedAt: string; sentimentScore: number }
): Promise<{ overview: string; marketImpact: string; watchpoint: string; source: "gemini" | "fallback" }> {
  try {
    const res = await fetch(getApiUrl(`/${symbol}/news-analysis`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: article.title,
        summary: article.summary,
        source: article.source,
        published_at: article.publishedAt,
        sentiment_score: article.sentimentScore
      })
    });
    if (!res.ok) throw new Error("news analysis failed");
    const payload = await res.json();
    return {
      overview: payload.overview || "No analysis available.",
      marketImpact: payload.market_impact || payload.marketImpact || "No impact view available.",
      watchpoint: payload.watchpoint || "No watchpoint available.",
      source: payload.source === "gemini" ? "gemini" : "fallback"
    };
  } catch {
    return {
      overview: article.summary || article.title || "No analysis available.",
      marketImpact: "AI analysis is unavailable right now, so treat this update as one input rather than a full conclusion.",
      watchpoint: "Check the next result, filing, or management comment before making a decision.",
      source: "fallback"
    };
  }
}

export async function fetchReturnsProjection(symbol: string, amount: number, cagr: number, years: number) {
  const url = getApiUrl(`/${symbol}/returns-projection?amount=${amount}&cagr=${cagr}&years=${years}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Returns projection request failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchTickerTape(symbols: string[] = [], options: { force?: boolean } = {}) {
  type TickerTapeRow = { symbol: string; cmp: number; change: number; changePercent: number; exchange?: "NSE" | "BSE" };
  const force = Boolean(options.force);
  const queryParts: string[] = [];
  if (symbols.length) {
    queryParts.push(`symbols=${encodeURIComponent(symbols.join(","))}`);
  }
  if (force) {
    queryParts.push("refresh=true");
  }
  const query = queryParts.length ? `?${queryParts.join("&")}` : "";
  const key = `ticker:${symbols.join(",") || "default"}`;
  const fresh = force
    ? null
    : getFreshCache<TickerTapeRow[]>(key, 10_000);
  if (fresh) return fresh;

  const stale = getStaleCache<TickerTapeRow[]>(key);
  try {
    const timeoutMs = symbols.length ? (force ? 7000 : 4500) : (force ? 35_000 : 25_000);
    const res = await fetchWithTimeout(getApiUrl(`/ticker${query}`), { cache: "no-store" }, timeoutMs);
    if (!res.ok) {
      throw new Error(`Ticker request failed: ${res.status}`);
    }
    const payload = await res.json();
    const rows = (payload.data || []) as TickerTapeRow[];
    setCache(key, rows);
    return rows;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}

export type MarketMoodPayload = {
  value: number | null;
  level?: "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";
  updatedAt?: string;
  source?: string;
  quoteSource?: string;
  universeCount?: number;
  quotedCount?: number;
  advancing?: number;
  declining?: number;
  unchanged?: number;
  averageChange?: number;
  breadthScore?: number;
  momentumScore?: number;
};

export async function fetchMarketMood(options: { force?: boolean } = {}): Promise<MarketMoodPayload> {
  const force = Boolean(options.force);
  const key = "market-mood";
  const fresh = force ? null : getFreshCache<MarketMoodPayload>(key, 10_000);
  if (fresh) return fresh;

  const stale = getStaleCache<MarketMoodPayload>(key);

  try {
    const query = force ? "?refresh=true" : "";
    const res = await fetchWithTimeout(getApiUrl(`/market-mood${query}`), { cache: "no-store" }, force ? 35_000 : 25_000);
    if (!res.ok) {
      throw new Error(`Market mood request failed: ${res.status}`);
    }
    const payload = (await res.json()) as MarketMoodPayload;
    if (typeof payload.value === "number") {
      setCache(key, payload);
    }
    return payload;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}

type IndexHeatmapPayload = {
  indexName: string;
  updatedAt: string;
  rows: Array<{ symbol: string; cmp: number; change: number; changePercent: number; exchange?: "NSE" | "BSE" }>;
  source: string;
  constituentCount: number;
};

export async function fetchIndexHeatmap(indexName: string, options: { force?: boolean } = {}) {
  const force = Boolean(options.force);
  const query = `?index=${encodeURIComponent(indexName)}${force ? "&refresh=true" : ""}`;
  const key = `heatmap:${indexName.toUpperCase()}`;
  const fresh = force
    ? null
    : getFreshCache<IndexHeatmapPayload>(key, 15_000);
  if (fresh) return fresh;

  const stale = getStaleCache<IndexHeatmapPayload>(key);

  try {
    const res = await fetchWithTimeout(getApiUrl(`/index-heatmap${query}`), { cache: "no-store" }, force ? 9000 : 6000);
    if (!res.ok) {
      throw new Error(`Index heatmap request failed: ${res.status}`);
    }
    const payload = await res.json();
    const data: IndexHeatmapPayload = {
      indexName: (payload.indexName || indexName) as string,
      updatedAt: (payload.updatedAt || "") as string,
      rows: (payload.rows || []) as Array<{ symbol: string; cmp: number; change: number; changePercent: number; exchange?: "NSE" | "BSE" }>,
      source: typeof payload.source === "string" ? payload.source : "",
      constituentCount: typeof payload.constituentCount === "number" ? payload.constituentCount : 0,
    };
    setCache(key, data);
    return data;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}

export type MarketIndexOption = {
  value: string;
  label: string;
  exchange: "NSE" | "BSE";
};

export async function fetchMarketIndexOptions(): Promise<MarketIndexOption[]> {
  const fresh = getFreshCache<MarketIndexOption[]>("market-index-options", 10 * 60_000);
  if (fresh) return fresh;

  const res = await fetchWithTimeout(getApiUrl("/indices"), { cache: "no-store" }, 7000);
  if (!res.ok) {
    throw new Error(`Index options request failed: ${res.status}`);
  }
  const payload = await res.json();
  const rows = (payload.data || []) as MarketIndexOption[];
  setCache("market-index-options", rows);
  return rows;
}

export async function fetchSwotAnalysis(symbol: string, options: { refresh?: boolean } = {}): Promise<{
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  bullCase: string;
  bearCase: string;
  generatedAt?: number;
}> {
  const fallback = {
    strengths: ["Strong brand presence in the sector", "Consistent revenue growth track record", "Healthy balance sheet with low debt"],
    weaknesses: ["Dependent on domestic market", "Margins under pressure from rising input costs"],
    opportunities: ["Expanding into new geographies", "Growing digital adoption in the sector", "Potential for strategic acquisitions"],
    threats: ["Intensifying competition from global players", "Regulatory changes could impact operations", "Currency fluctuation risks"],
    bullCase: "If the company successfully executes its expansion strategy and maintains current margins, the stock could see meaningful upside driven by revenue growth and improving return ratios.",
    bearCase: "Prolonged margin compression from rising costs, combined with slowing demand or regulatory headwinds, could limit near-term upside and pressure valuations."
  };

  try {
    const url = getApiUrl(`/${symbol}/swot`) + (options.refresh ? "?refresh=true" : "");
    const res = await fetchWithTimeout(url, { cache: "no-store" }, 20_000);
    if (!res.ok) throw new Error(`SWOT request failed: ${res.status}`);
    const payload = await res.json();
    return {
      strengths: Array.isArray(payload.strengths) ? payload.strengths : fallback.strengths,
      weaknesses: Array.isArray(payload.weaknesses) ? payload.weaknesses : fallback.weaknesses,
      opportunities: Array.isArray(payload.opportunities) ? payload.opportunities : fallback.opportunities,
      threats: Array.isArray(payload.threats) ? payload.threats : fallback.threats,
      bullCase: typeof payload.bullCase === "string" ? payload.bullCase : fallback.bullCase,
      bearCase: typeof payload.bearCase === "string" ? payload.bearCase : fallback.bearCase,
      generatedAt: typeof payload.generatedAt === "number" ? payload.generatedAt : undefined,
    };
  } catch {
    return fallback;
  }
}

export async function fetchMarketNews(options: { force?: boolean } = {}) {
  const force = Boolean(options.force);
  const key = "market-news";
  const fresh = force
    ? null
    : getFreshCache<
      Array<{
        title: string;
        source: string;
        publishedAt: string;
        url: string;
        summary: string;
        imageUrl: string | null;
      }>
    >(key, 60_000);
  if (fresh) return fresh;

  const stale = getStaleCache<
    Array<{
      title: string;
      source: string;
      publishedAt: string;
      url: string;
      summary: string;
      imageUrl: string | null;
    }>
  >(key);

  try {
    const query = force ? "?refresh=true" : "";
    const res = await fetchWithTimeout(getApiUrl(`/market-news${query}`), { cache: "no-store" }, force ? 10000 : 7000);
    if (!res.ok) {
      throw new Error(`Market news request failed: ${res.status}`);
    }
    const payload = await res.json();
    const rows = (payload.data || []) as Array<{
      title: string;
      source: string;
      publishedAt: string;
      url: string;
      summary: string;
      imageUrl: string | null;
    }>;
    if (rows.length) {
      setCache(key, rows);
      return rows;
    }
    if (stale) return stale;
    return rows;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}

export type IpoItem = {
  symbol: string;
  company: string;
  date: string;
  exchange: string;
  actions: string;
  shares: number | null;
  priceRange: string;
  marketCap: number | null;
  // NSE upcoming fields
  issueStartDate?: string;
  issueEndDate?: string;
  status?: string;
  series?: string;
  // NSE recent fields
  currentPrice?: number;
  prevClose?: number;
  changePercent?: number;
  yearHigh?: number;
};

export type IpoAiAnalysis = {
  verdict: string;
  verdictColor: "green" | "red" | "yellow";
  summary: string;
  keyStrengths: string[];
  keyRisks: string[];
  valuation: string;
  listingOutlook: string;
  whoShouldApply: string;
  quickTake: string;
};

export async function fetchIpoAiAnalysis(symbol: string): Promise<IpoAiAnalysis> {
  const fallback: IpoAiAnalysis = {
    verdict: "Neutral", verdictColor: "yellow",
    summary: "AI analysis unavailable. Please review the DRHP and sector peers before making a subscription decision.",
    keyStrengths: ["Public listing improves brand visibility", "Access to growth capital"],
    keyRisks: ["Market volatility may affect listing performance", "Post-listing lock-in expiry risk"],
    valuation: "Compare price-to-earnings with listed sector peers to assess fairness.",
    listingOutlook: "neutral",
    whoShouldApply: "Long-term investors with high risk tolerance",
    quickTake: "Do thorough research before subscribing to this IPO.",
  };
  try {
    const res = await fetchWithTimeout(getApiUrl(`/ipo/${symbol}/ai-analysis`), { cache: "no-store" }, 20_000);
    if (!res.ok) return fallback;
    const payload = await res.json();
    return { ...fallback, ...payload };
  } catch {
    return fallback;
  }
}

export async function fetchIpoData(
  type: "upcoming" | "recent" = "upcoming",
  options: { force?: boolean } = {}
): Promise<IpoItem[]> {
  const force = Boolean(options.force);
  const key = `ipo:${type}`;
  const fresh = force ? null : getFreshCache<IpoItem[]>(key, 60_000 * 10);
  if (fresh) return fresh;
  try {
    const res = await fetchWithTimeout(
      getApiUrl(`/ipo?type=${type}${force ? "&refresh=true" : ""}`),
      { cache: "no-store" },
      10_000
    );
    if (!res.ok) throw new Error(`IPO request failed: ${res.status}`);
    const payload = await res.json();
    const rows = (payload.data || []) as IpoItem[];
    setCache(key, rows);
    return rows;
  } catch {
    return [];
  }
}

export async function fetchAIScreenerResults(query: string): Promise<{ results: ScreenerResult[]; parsedFilters: Record<string, unknown> }> {
  const url = getApiUrl("/screener/ai");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AI screener failed: ${res.status}`);
  const payload = await res.json();
  return { results: (payload.results || []) as ScreenerResult[], parsedFilters: payload.parsedFilters || {} };
}

export async function fetchPortfolioRiskAssessment(holdings: Array<{
  symbol: string; quantity: number; buyPrice: number; currentPrice?: number; sector?: string; beta?: number;
}>): Promise<Record<string, unknown>> {
  const url = getApiUrl("/portfolio-risk");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdings }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Portfolio risk failed: ${res.status}`);
  return await res.json();
}

export async function fetchPortfolioRoast(holdings: Array<{
  symbol: string; quantity: number; avgPrice: number; currentValue?: number; pnl?: number;
}>, totalValue?: number): Promise<Record<string, unknown>> {
  const url = getApiUrl("/portfolio-roast");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdings, totalValue }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Portfolio roast failed: ${res.status}`);
  return await res.json();
}

export async function fetchCompetitorVerdict(symbol: string): Promise<Record<string, unknown>> {
  const url = getApiUrl(`/${symbol}/competitor-verdict`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Competitor verdict failed: ${res.status}`);
  return await res.json();
}

export async function fetchEarningsTldr(symbol: string): Promise<Record<string, unknown>> {
  const url = getApiUrl(`/${symbol}/earnings-tldr`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Earnings TL;DR failed: ${res.status}`);
  return await res.json();
}

export async function fetchScreenerResults(filters: ScreenerFilters): Promise<ScreenerResult[]> {
  const params = new URLSearchParams();
  if (filters.exchange) params.set("exchange", filters.exchange);
  if (filters.sector) params.set("sector", filters.sector);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.market_cap_min) params.set("market_cap_min", String(filters.market_cap_min));
  if (filters.market_cap_max) params.set("market_cap_max", String(filters.market_cap_max));
  if (filters.pe_min) params.set("pe_min", String(filters.pe_min));
  if (filters.pe_max) params.set("pe_max", String(filters.pe_max));
  if (filters.price_min) params.set("price_min", String(filters.price_min));
  if (filters.price_max) params.set("price_max", String(filters.price_max));
  if (filters.dividend_min) params.set("dividend_min", String(filters.dividend_min));
  if (filters.volume_min) params.set("volume_min", String(filters.volume_min));
  if (filters.limit) params.set("limit", String(filters.limit));

  const url = getApiUrl(`/screener?${params.toString()}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Screener request failed: ${res.status}`);
  }
  const payload = await res.json();
  return (payload.results || []) as ScreenerResult[];
}

export async function parsePortfolioDocument(file: File): Promise<{ holdings: any[] }> {
  const formData = new FormData();
  formData.append('file', file);

  const url = getApiUrl('/parse-document', 'portfolio');

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Failed to parse document');
  } 
  const payload = await res.json();
  return { holdings: payload.holdings || [] };
}
