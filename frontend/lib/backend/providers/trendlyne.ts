import { baseSymbol, getJson, getText, toFloat } from "@/lib/backend/http";
import type { DashboardData, DocRow, KeyRatioTrendCard, KeyRatioTrends } from "@/lib/types";

const TRENDLYNE_BASE = "https://trendlyne.com";
const META_TTL_MS = 6 * 60 * 60_000;
const SUPPLEMENT_TTL_MS = 15 * 60_000;

const PAGE_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  referer: `${TRENDLYNE_BASE}/`,
};

const AJAX_HEADERS = {
  ...PAGE_HEADERS,
  "x-requested-with": "XMLHttpRequest",
};

type EquityMeta = { stockId: string; slug: string };
type TrendlyneDocuments = DashboardData["documents"];

export interface TrendlyneSupplement {
  keyRatioTrends: KeyRatioTrends | null;
  documents: TrendlyneDocuments | null;
}

let equityMap: Map<string, EquityMeta> | null = null;
let equityMapLoadedAt = 0;
let equityMapPending: Promise<Map<string, EquityMeta> | null> | null = null;

const supplementCache = new Map<string, { loadedAt: number; value: TrendlyneSupplement | null }>();
const supplementPending = new Map<string, Promise<TrendlyneSupplement | null>>();

function decodeHtml(value: string): string {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(value: string): string {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteHttpUrl(value: string, base = TRENDLYNE_BASE): string {
  try {
    const parsed = new URL(decodeHtml(value), base);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function isTrendlyneUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host === "trendlyne.com" || host.endsWith(".trendlyne.com"));
  } catch {
    return false;
  }
}

async function loadEquityMap(signal?: AbortSignal): Promise<Map<string, EquityMeta> | null> {
  const now = Date.now();
  if (equityMap && now - equityMapLoadedAt < META_TTL_MS) return equityMap;
  if (equityMapPending) return equityMapPending;

  equityMapPending = (async () => {
    const xml = await getText(`${TRENDLYNE_BASE}/equity-sitemap-stocks.xml`, {
      headers: PAGE_HEADERS,
      timeoutMs: 8_000,
      retries: 0,
      signal,
    });
    if (!xml) return equityMap;

    const next = new Map<string, EquityMeta>();
    const pattern = /<loc>\s*https:\/\/trendlyne\.com\/equity\/(\d+)\/([^/]+)\/([^/]+)\/?\s*<\/loc>/gi;
    for (const match of xml.matchAll(pattern)) {
      const stockId = String(match[1] || "").trim();
      const symbol = decodeURIComponent(String(match[2] || "")).trim().toUpperCase();
      const slug = decodeURIComponent(String(match[3] || "")).trim();
      if (stockId && symbol && slug) next.set(symbol, { stockId, slug });
    }
    if (next.size) {
      equityMap = next;
      equityMapLoadedAt = Date.now();
    }
    return equityMap;
  })().finally(() => {
    equityMapPending = null;
  });

  return equityMapPending;
}

async function resolveEquityMeta(symbol: string, signal?: AbortSignal): Promise<EquityMeta | null> {
  const key = baseSymbol(symbol);
  const map = await loadEquityMap(signal);
  if (!map || !key) return null;
  const exact = map.get(key);
  if (exact) return exact;

  const normalized = key.replace(/[^A-Z0-9]/g, "");
  for (const [candidate, meta] of map.entries()) {
    if (candidate.replace(/[^A-Z0-9]/g, "") === normalized) return meta;
  }
  return null;
}

function readNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toFloat(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function averageLastThree(series: Array<{ value: number | null }>): number | null {
  const values = series
    .slice(-3)
    .map((point) => point.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export function parseTrendlyneRatioTrends(body: unknown, mode: "consolidated" | "standalone"): KeyRatioTrends {
  const empty = (): KeyRatioTrends => ({ profitability: [], valuation: [], liquidity: [] });
  if (!body || typeof body !== "object") return empty();

  const payload = body as Record<string, unknown>;
  const annualOrder = Array.isArray(payload.annualOrder) ? payload.annualOrder : [];
  const annualDump = payload.annualDataDump;
  if (!annualDump || typeof annualDump !== "object") return empty();

  const modeRows = (annualDump as Record<string, unknown>)[mode];
  if (!modeRows || typeof modeRows !== "object") return empty();

  const periods = annualOrder
    .slice(0, 6)
    .map((period) => String(period || "").trim())
    .filter(Boolean)
    .reverse();

  const points = periods.flatMap((period) => {
    const row = (modeRows as Record<string, unknown>)[period];
    if (!row || typeof row !== "object") return [];
    const values = row as Record<string, unknown>;
    return [{
      period: period.match(/\b(\d{4})\b/)?.[1] || period,
      roe: readNumber(values, ["ROE_A"]),
      roce: readNumber(values, ["ROCE_A"]),
      roa: readNumber(values, ["ROA_A"]),
      npm: readNumber(values, ["NETPCT_A"]),
      pe: readNumber(values, ["PE_A"]),
      evEbitda: readNumber(values, ["EVPerEBITDA_A"]),
      pbv: readNumber(values, ["PBV_A"]),
      pcf: readNumber(values, ["PCFO_A"]),
      netNpa: readNumber(values, ["NNPARAT_A", "NetNPAToAdvancesPercentage_A"]),
      casa: readNumber(values, ["CASA_A"]),
      nim: readNumber(values, ["NIM_A"]),
      advances: readNumber(values, ["Advances_A"]),
    }];
  });

  if (!points.length) return empty();

  const card = (label: string, key: keyof (typeof points)[number]): KeyRatioTrendCard => {
    const series = points.slice(-5).map((point) => ({
      period: point.period,
      value: typeof point[key] === "number" ? Math.round(Number(point[key]) * 100) / 100 : null,
    }));
    return { label, average3Y: averageLastThree(series), series };
  };

  const latestFive = points.slice(-5);
  const advanceSeries = latestFive.map((point, index) => {
    const pointIndex = points.length - latestFive.length + index;
    const previous = pointIndex > 0 ? points[pointIndex - 1]?.advances : null;
    const value =
      point.advances !== null && previous !== null && previous !== 0
        ? Math.round((((point.advances - previous) / previous) * 100) * 100) / 100
        : null;
    return { period: point.period, value };
  });

  return {
    profitability: [
      card("ROE", "roe"),
      card("ROCE", "roce"),
      card("ROA", "roa"),
      card("NPM", "npm"),
    ],
    valuation: [
      card("P/E Ratio", "pe"),
      card("EV/EBITDA", "evEbitda"),
      card("Price to Book Value", "pbv"),
      card("Price to Cash Flow", "pcf"),
    ],
    liquidity: [
      card("NET NPA", "netNpa"),
      card("CASA Ratio", "casa"),
      { label: "Advance Growth", average3Y: averageLastThree(advanceSeries), series: advanceSeries },
      card("Net Interest Margin", "nim"),
    ],
  };
}

function hasTrendValues(trends: KeyRatioTrends): boolean {
  return (["profitability", "valuation", "liquidity"] as const).some((group) =>
    trends[group].some((card) => card.series.some((point) => point.value !== null))
  );
}

async function fetchRatioTrends(meta: EquityMeta, symbol: string, signal?: AbortSignal): Promise<KeyRatioTrends | null> {
  const pageUrl = `${TRENDLYNE_BASE}/fundamentals/financials/${meta.stockId}/${encodeURIComponent(symbol)}/${encodeURIComponent(meta.slug)}/`;
  const page = await getText(pageUrl, {
    headers: PAGE_HEADERS,
    timeoutMs: 7_000,
    retries: 0,
    signal,
  });
  const rawDataUrl = page?.match(/data-tablesurl=["']([^"']+)["']/i)?.[1];
  const dataUrl = rawDataUrl ? absoluteHttpUrl(rawDataUrl) : "";
  if (!dataUrl || !isTrendlyneUrl(dataUrl)) return null;

  const payload = await getJson<{ body?: unknown }>(dataUrl, {
    headers: { ...AJAX_HEADERS, referer: pageUrl, accept: "application/json, text/plain, */*" },
    timeoutMs: 8_000,
    retries: 0,
    signal,
  });
  if (!payload?.body) return null;

  const consolidated = parseTrendlyneRatioTrends(payload.body, "consolidated");
  if (hasTrendValues(consolidated)) return consolidated;
  const standalone = parseTrendlyneRatioTrends(payload.body, "standalone");
  return hasTrendValues(standalone) ? standalone : null;
}

function extractTargetDiv(html: string, targetId: string): string {
  const escapedTarget = targetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openingPattern = new RegExp(`<div\\b[^>]*data-targetid=["']${escapedTarget}["'][^>]*>`, "i");
  const opening = openingPattern.exec(html);
  if (!opening || opening.index === undefined) return "";

  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(html))) {
    if (/^<div\b/i.test(tag[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) return html.slice(opening.index, tagPattern.lastIndex);
  }
  return "";
}

function parseDocumentLinks(html: string, limit: number): DocRow[] {
  const rows: DocRow[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const rawUrl = String(match[2] || "");
    if (!/(?:get-document|\/posts\/|\.pdf(?:$|[?#]))/i.test(rawUrl)) continue;
    const title = stripHtml(match[3]);
    if (!title || /^(?:pdf|link|open pdf|open link|copy link|alert|ai summary)$/i.test(title)) continue;
    const url = absoluteHttpUrl(rawUrl);
    if (!url) continue;
    const key = `${title.toLowerCase()}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ title, url });
    if (rows.length >= limit) break;
  }
  return rows;
}

function parseTitledDocumentLinks(html: string, limit: number): DocRow[] {
  const rows: DocRow[] = [];
  const seen = new Set<string>();
  const cardPattern = /<div\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]{0,1200}?<a\b[^>]*href=(["'])(.*?)\2/gi;
  for (const match of html.matchAll(cardPattern)) {
    const title = stripHtml(match[1]);
    const url = absoluteHttpUrl(String(match[3] || ""));
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    rows.push({ title, url });
    if (rows.length >= limit) break;
  }
  return rows;
}

function decodeAjaxHtml(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"')) return raw;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

export function parseTrendlyneDocuments(documentHtml: string, filingsHtml = ""): TrendlyneDocuments {
  return {
    annualReports: (() => {
      const pane = extractTargetDiv(documentHtml, "annualreport");
      const titled = parseTitledDocumentLinks(pane, 12);
      return titled.length ? titled : parseDocumentLinks(pane, 12);
    })(),
    investorPresentations: parseDocumentLinks(extractTargetDiv(documentHtml, "investorpresentation"), 12),
    creditRatings: parseDocumentLinks(extractTargetDiv(documentHtml, "creditrating"), 12),
    exchangeFilings: parseDocumentLinks(filingsHtml, 20),
  };
}

async function fetchDocuments(meta: EquityMeta, symbol: string, signal?: AbortSignal): Promise<TrendlyneDocuments | null> {
  const referer = `${TRENDLYNE_BASE}/fundamentals/documents/${meta.stockId}/${encodeURIComponent(symbol)}/${encodeURIComponent(meta.slug)}/`;
  const documentUrl = `${TRENDLYNE_BASE}/fundamentals/annual-earnings-credit/annual-reports/${meta.stockId}/`;
  const filingsUrl = `${TRENDLYNE_BASE}/latest-news/BSE-Announcements/${meta.stockId}/${encodeURIComponent(symbol)}/${encodeURIComponent(meta.slug)}/`;

  const [rawDocuments, filingsHtml] = await Promise.all([
    getText(documentUrl, {
      headers: { ...AJAX_HEADERS, referer },
      timeoutMs: 8_000,
      retries: 0,
      signal,
    }),
    getText(filingsUrl, {
      headers: PAGE_HEADERS,
      timeoutMs: 8_000,
      retries: 0,
      signal,
    }),
  ]);

  const documents = parseTrendlyneDocuments(decodeAjaxHtml(rawDocuments), filingsHtml || "");
  return Object.values(documents).some((rows) => rows.length) ? documents : null;
}

export async function getTrendlyneSupplement(
  symbol: string,
  signal?: AbortSignal,
): Promise<TrendlyneSupplement | null> {
  const key = baseSymbol(symbol);
  if (!key) return null;

  const cached = supplementCache.get(key);
  if (cached && Date.now() - cached.loadedAt < SUPPLEMENT_TTL_MS) return cached.value;
  const pending = supplementPending.get(key);
  if (pending) return pending;

  const request = (async () => {
    const meta = await resolveEquityMeta(key, signal);
    if (!meta) return null;
    const [keyRatioTrends, documents] = await Promise.all([
      fetchRatioTrends(meta, key, signal),
      fetchDocuments(meta, key, signal),
    ]);
    const value = keyRatioTrends || documents ? { keyRatioTrends, documents } : null;
    supplementCache.set(key, { loadedAt: Date.now(), value });
    return value;
  })().finally(() => {
    supplementPending.delete(key);
  });

  supplementPending.set(key, request);
  return request;
}