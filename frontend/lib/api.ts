import type { DashboardData } from "@/lib/types";

const INTERNAL_BASE = process.env.INTERNAL_API_BASE || "http://127.0.0.1:8000";
const PUBLIC_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const memoryCache = new Map<string, { at: number; data: unknown }>();

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

export async function fetchDashboard(symbol: string): Promise<DashboardData> {
  const key = `dashboard:${symbol.toUpperCase()}:5Y`;
  const fresh = getFreshCache<DashboardData>(key, 60_000);
  if (fresh) return fresh;

  const stale = getStaleCache<DashboardData>(key);
  const attempts = [
    { timeoutMs: 30_000, refresh: false },
    { timeoutMs: 60_000, refresh: true }
  ];
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const res = await fetchWithTimeout(
        `${INTERNAL_BASE}/api/v1/stocks/${symbol}/dashboard?timeframe=5Y${attempt.refresh ? "&refresh=true" : ""}`,
        {
          cache: "no-store"
        },
        attempt.timeoutMs
      );
      if (!res.ok) {
        throw new Error(`Dashboard request failed: ${res.status}`);
      }
      const payload = await res.json();
      const data = payload.data as DashboardData;
      setCache(key, data);
      return data;
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

export async function searchStocks(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `${PUBLIC_BASE}/api/v1/stocks/search?q=${encodeURIComponent(query)}`,
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
    const res = await fetch(`${PUBLIC_BASE}/api/v1/stocks/${symbol}/chat`, {
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
      answer: "AI engine unavailable right now. Check debt trend, revenue quality, and promoter/FII movement before decision.",
      source: "fallback"
    };
  }
}

export async function fetchReturnsProjection(symbol: string, amount: number, cagr: number, years: number) {
  const url = `${PUBLIC_BASE}/api/v1/stocks/${symbol}/returns-projection?amount=${amount}&cagr=${cagr}&years=${years}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const series = Array.from({ length: years + 1 }, (_, y) => ({
      year: y,
      value: Number((amount * (1 + cagr / 100) ** y).toFixed(2))
    }));
    return { series, futureValue: series[series.length - 1].value };
  }
  return res.json();
}

export async function fetchTickerTape(symbols: string[] = [], options: { force?: boolean } = {}) {
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
    : getFreshCache<Array<{ symbol: string; cmp: number; change: number; changePercent: number }>>(key, 10_000);
  if (fresh) return fresh;

  const stale = getStaleCache<Array<{ symbol: string; cmp: number; change: number; changePercent: number }>>(key);
  try {
    const res = await fetchWithTimeout(`${PUBLIC_BASE}/api/v1/stocks/ticker${query}`, { cache: "no-store" }, force ? 7000 : 4500);
    if (!res.ok) {
      throw new Error(`Ticker request failed: ${res.status}`);
    }
    const payload = await res.json();
    const rows = (payload.data || []) as Array<{ symbol: string; cmp: number; change: number; changePercent: number }>;
    setCache(key, rows);
    return rows;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}

export async function fetchIndexHeatmap(indexName: string, options: { force?: boolean } = {}) {
  const force = Boolean(options.force);
  const query = `?index=${encodeURIComponent(indexName)}${force ? "&refresh=true" : ""}`;
  const key = `heatmap:${indexName.toUpperCase()}`;
  const fresh = force
    ? null
    : getFreshCache<{
      indexName: string;
      updatedAt: string;
      rows: Array<{ symbol: string; cmp: number; change: number; changePercent: number }>;
    }>(key, 15_000);
  if (fresh) return fresh;

  const stale = getStaleCache<{
    indexName: string;
    updatedAt: string;
    rows: Array<{ symbol: string; cmp: number; change: number; changePercent: number }>;
  }>(key);

  try {
    const res = await fetchWithTimeout(`${PUBLIC_BASE}/api/v1/stocks/index-heatmap${query}`, { cache: "no-store" }, force ? 9000 : 6000);
    if (!res.ok) {
      throw new Error(`Index heatmap request failed: ${res.status}`);
    }
    const payload = await res.json();
    const data = {
      indexName: (payload.indexName || indexName) as string,
      updatedAt: (payload.updatedAt || "") as string,
      rows: (payload.rows || []) as Array<{ symbol: string; cmp: number; change: number; changePercent: number }>
    };
    setCache(key, data);
    return data;
  } catch (err) {
    if (stale) return stale;
    throw err;
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
    const res = await fetchWithTimeout(`${PUBLIC_BASE}/api/v1/stocks/market-news${query}`, { cache: "no-store" }, force ? 10000 : 7000);
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
    setCache(key, rows);
    return rows;
  } catch (err) {
    if (stale) return stale;
    throw err;
  }
}
