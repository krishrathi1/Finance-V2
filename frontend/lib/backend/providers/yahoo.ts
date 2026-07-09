/**
 * Yahoo Finance provider (server-side). Yahoo is the most reliable server-side
 * source for Indian equities, so this module REPLACES the legacy Python
 * `yfinance` bundle with direct calls to Yahoo's public JSON endpoints.
 *
 * Endpoints used:
 *  - v8/finance/chart/{SYM}.NS  -> daily candles + quote meta (52wk, prev close)
 *  - v10/finance/quoteSummary/{SYM} -> profile / metrics / statements / shareholding
 *    (quoteSummary now requires a crumb + cookie, obtained via the fc.yahoo.com
 *     cookie -> getcrumb flow).
 *
 * GOLDEN RULE: none of these functions throw. They return `null` (or a partial
 * structure) on any failure or timeout so the orchestrator keeps its defaults.
 */

import {
  getJson,
  fetchWithTimeout,
  toFloat,
  round2,
  baseSymbol,
  DESKTOP_UA,
} from "@/lib/backend/http";
import type { Candle, RawQuote, ProviderBundle, QuarterPoint } from "@/lib/backend/contracts";
import type { ShareholdingHolder } from "@/lib/types";

const YAHOO_QUERY1 = "https://query1.finance.yahoo.com";
const YAHOO_QUERY2 = "https://query2.finance.yahoo.com";

const QUOTE_SUMMARY_MODULES = [
  "assetProfile",
  "summaryProfile",
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "incomeStatementHistory",
  "incomeStatementHistoryQuarterly",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "earnings",
  "majorHoldersBreakdown",
  "institutionOwnership",
  "recommendationTrend",
].join(",");

const FUNDAMENTALS_TIMESERIES_TYPES = [
  "annualTotalRevenue",
  "annualEBIT",
  "annualNetIncome",
  "annualTotalAssets",
  "annualTotalDebt",
  "annualTotalLiabilitiesNetMinorityInterest",
  "annualStockholdersEquity",
  "annualCurrentAssets",
  "annualCurrentLiabilities",
  "annualRetainedEarnings",
  "annualOperatingCashFlow",
  "annualInvestingCashFlow",
  "annualFinancingCashFlow",
  "annualFreeCashFlow",
].join(",");

/** Convert a Yahoo unix timestamp (seconds, UTC) into an ISO yyyy-mm-dd string. */
function tsToIsoDate(ts: unknown): string | null {
  const n = toFloat(ts);
  if (n === null) return null;
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Yahoo wraps many numeric values as `{ raw, fmt, longFmt }`; extract the raw number. */
function rawNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const raw = (value as { raw?: unknown }).raw;
    return toFloat(raw);
  }
  return toFloat(value);
}

function previousCloseFromChart(result: any, currentPrice: number | null): number | null {
  const closes: unknown[] = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const parsed = closes.map((value) => toFloat(value));
  const numeric = parsed.filter((value): value is number => value !== null);
  if (!numeric.length) return null;

  const lastNonNull = numeric[numeric.length - 1];
  if (numeric.length === 1 && currentPrice !== null && Math.abs(lastNonNull - currentPrice) < 0.005) {
    return null;
  }
  const rawLast = parsed[parsed.length - 1];
  if (rawLast === null) return lastNonNull;
  if (currentPrice !== null && Math.abs(lastNonNull - currentPrice) < 0.005 && numeric.length >= 2) {
    return numeric[numeric.length - 2];
  }
  return lastNonNull;
}

/** Extract the human-readable string from a `{ raw, fmt }` object or a plain value. */
function rawStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const obj = value as { fmt?: unknown; raw?: unknown };
    if (typeof obj.fmt === "string" && obj.fmt.trim()) return obj.fmt;
    if (obj.raw !== undefined && obj.raw !== null) return String(obj.raw);
    return null;
  }
  const s = String(value).trim();
  return s ? s : null;
}

/** Raw -> crore (Indian convention divides INR magnitudes by 1e7). */
function toCrore(value: unknown): number | null {
  const n = rawNum(value);
  if (n === null) return null;
  return round2(n / 1e7);
}

/** A raw fractional Yahoo field (e.g. 0.18) -> percent (18). */
function toPercent(value: unknown): number | null {
  const n = rawNum(value);
  if (n === null) return null;
  return round2(n * 100);
}

/** Format a unix timestamp / date string as an ISO date for stable ordering. */
function periodLabel(value: unknown): string | null {
  const n = toFloat(value);
  let d: Date;
  if (n !== null) {
    d = new Date(n * 1000);
  } else if (typeof value === "string" && value.trim()) {
    d = new Date(value);
  } else {
    return null;
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch & parse Yahoo v8 chart for a single fully-qualified ticker (e.g. RELIANCE.NS).
 * Returns the raw `result.chart.result[0]` object or null.
 */
async function fetchChartResult(ticker: string, days: number, signal?: AbortSignal): Promise<any | null> {
  const range = days > 365 ? "5y" : days > 30 ? "1y" : "1mo";
  const url = `${YAHOO_QUERY1}/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=1d&includePrePost=false`;
  const payload = await getJson<any>(url, { timeoutMs: 7000, retries: 1, signal });
  const result = payload?.chart?.result?.[0];
  if (!result) return null;
  return result;
}

/** Parse a v8 chart result into ascending-sorted candles, dropping null closes. */
function parseChartCandles(result: any, days: number): Candle[] {
  const timestamps: unknown[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const opens: unknown[] = Array.isArray(quote.open) ? quote.open : [];
  const highs: unknown[] = Array.isArray(quote.high) ? quote.high : [];
  const lows: unknown[] = Array.isArray(quote.low) ? quote.low : [];
  const closes: unknown[] = Array.isArray(quote.close) ? quote.close : [];
  const volumes: unknown[] = Array.isArray(quote.volume) ? quote.volume : [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = toFloat(closes[i]);
    if (close === null) continue; // drop null closes
    const date = tsToIsoDate(timestamps[i]);
    if (!date) continue;
    const open = toFloat(opens[i]) ?? close;
    const high = toFloat(highs[i]) ?? close;
    const low = toFloat(lows[i]) ?? close;
    const vol = toFloat(volumes[i]);
    candles.push({
      date,
      open: round2(open) ?? close,
      high: round2(high) ?? close,
      low: round2(low) ?? close,
      close: round2(close) ?? close,
      volume: vol !== null ? Math.trunc(vol) : 0,
    });
  }

  // Ascending by date, deduped keeping the last occurrence per date.
  candles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byDate = new Map<string, Candle>();
  for (const c of candles) byDate.set(c.date, c);
  const deduped = Array.from(byDate.values());
  return days > 0 ? deduped.slice(-days) : deduped;
}

/**
 * Daily candles for an Indian equity. Suffixed symbols use that exchange; bare
 * symbols try `{SYM}.NS` then `{SYM}.BO`.
 */
export async function getYahooCandles(base: string, days: number, signal?: AbortSignal): Promise<Candle[] | null> {
  try {
    const key = String(base || "").trim().toUpperCase();
    if (!key) return null;
    const dayCount = days && days > 0 ? days : 1825;
    const sym = baseSymbol(key);
    if (!sym) return null;
    const tickers = /\.(NS|BO)$/i.test(key) ? [key] : [`${sym}.NS`, `${sym}.BO`];

    for (const ticker of tickers) {
      const result = await fetchChartResult(ticker, dayCount, signal);
      if (!result) continue;
      const candles = parseChartCandles(result, dayCount);
      if (candles.length > 0) return candles;
    }
    return null;
  } catch (err) {
    console.warn(`[yahoo] getYahooCandles failed: ${String(err)}`);
    return null;
  }
}

/**
 * Live quote built from the v8 chart `meta` block (regularMarketPrice,
 * chartPreviousClose, fiftyTwoWeekHigh/Low). Tries `.NS` then `.BO`.
 *
 * `marketSymbol` may already carry a suffix; if not, we resolve the suffix the
 * same way candles do.
 */
export async function getYahooQuote(marketSymbol: string, signal?: AbortSignal): Promise<RawQuote | null> {
  try {
    const key = String(marketSymbol || "").trim().toUpperCase();
    if (!key) return null;

    // Build the ticker candidate list. Indices (^...) and already-suffixed
    // symbols are used as-is; bare symbols try .NS then .BO.
    let tickers: string[];
    if (key.startsWith("^") || /\.(NS|BO)$/.test(key)) {
      tickers = [key];
    } else {
      const sym = baseSymbol(key);
      tickers = [`${sym}.NS`, `${sym}.BO`];
    }

    for (const ticker of tickers) {
      const result = await fetchChartResult(ticker, 5, signal);
      const meta = result?.meta;
      if (!meta) continue;

      const price = rawNum(meta.regularMarketPrice);
      const prevClose =
        rawNum(meta.regularMarketPreviousClose) ??
        rawNum(meta.previousClose) ??
        previousCloseFromChart(result, price) ??
        rawNum(meta.chartPreviousClose);
      if (price === null) continue;

      let change: number | null = null;
      let changePercent: number | null = null;
      if (prevClose !== null) {
        change = round2(price - prevClose);
        changePercent = prevClose !== 0 ? round2(((price - prevClose) / prevClose) * 100) : 0;
      }

      const quote: RawQuote = {
        cmp: round2(price),
        change,
        changePercent,
        fiftyTwoWeekHigh: round2(rawNum(meta.fiftyTwoWeekHigh)),
        fiftyTwoWeekLow: round2(rawNum(meta.fiftyTwoWeekLow)),
        currency: typeof meta.currency === "string" && meta.currency.trim() ? meta.currency : "INR",
      };
      return quote;
    }
    return null;
  } catch (err) {
    console.warn(`[yahoo] getYahooQuote failed: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Crumb + cookie flow for quoteSummary.
// ---------------------------------------------------------------------------

let yahooCrumbCache: { cookie: string; crumb: string; at: number } | null = null;
let yahooCrumbPending: Promise<{ cookie: string; crumb: string } | null> | null = null;
const YAHOO_CRUMB_CACHE_MS = 10 * 60_000;
const YAHOO_TIMESERIES_CACHE_MS = 2 * 60_000;
const yahooTimeseriesCache = new Map<string, { at: number; data: ProviderBundle["financials"] | null }>();
const yahooTimeseriesPending = new Map<string, Promise<ProviderBundle["financials"] | null>>();

/**
 * Obtain a (cookie, crumb) pair required by the v10 quoteSummary endpoint.
 *  1. GET https://fc.yahoo.com (capture set-cookie).
 *  2. GET query2/v1/test/getcrumb with that cookie to obtain the crumb.
 * Returns null if either step fails.
 *
 * Cached for YAHOO_CRUMB_CACHE_MS and de-duped across concurrent callers —
 * every dashboard build was previously paying two extra sequential Yahoo
 * round trips for a crumb that barely changes.
 */
async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  if (yahooCrumbCache && Date.now() - yahooCrumbCache.at < YAHOO_CRUMB_CACHE_MS) {
    return yahooCrumbCache;
  }
  if (yahooCrumbPending) return yahooCrumbPending;

  yahooCrumbPending = fetchYahooCrumb().finally(() => {
    yahooCrumbPending = null;
  });
  return yahooCrumbPending;
}

async function fetchYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    // Step 1: hit fc.yahoo.com to receive an identity cookie. This endpoint
    // typically returns a non-2xx status but still sets the cookie header.
    let cookie = "";
    try {
      const cookieRes = await fetchWithTimeout("https://fc.yahoo.com", {
        timeoutMs: 6000,
        headers: { accept: "*/*" },
      });
      const setCookie = cookieRes.headers.get("set-cookie");
      if (setCookie) {
        // Keep only the `name=value` portion of each cookie, drop attributes.
        cookie = setCookie
          .split(/,(?=[^;]+?=)/)
          .map((c) => c.split(";")[0].trim())
          .filter(Boolean)
          .join("; ");
      }
    } catch {
      cookie = "";
    }
    if (!cookie) return null;

    // Step 2: exchange the cookie for a crumb.
    const crumbRes = await fetchWithTimeout(`${YAHOO_QUERY2}/v1/test/getcrumb`, {
      timeoutMs: 6000,
      headers: { cookie, accept: "*/*", "user-agent": DESKTOP_UA },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<") || crumb.toLowerCase().includes("error")) return null;
    yahooCrumbCache = { cookie, crumb, at: Date.now() };
    return yahooCrumbCache;
  } catch (err) {
    console.warn(`[yahoo] getYahooCrumb failed: ${String(err)}`);
    return null;
  }
}

/** Resolve the ticker candidate list for the bundle, matching the candle rules. */
function bundleTickers(marketSymbol: string): string[] {
  const key = String(marketSymbol || "").trim().toUpperCase();
  if (/\.(NS|BO)$/.test(key)) return [key];
  const sym = baseSymbol(key);
  return [`${sym}.NS`, `${sym}.BO`];
}

/** Map quoteSummary.assetProfile/summaryProfile + price into the ProviderBundle profile. */
function mapProfile(qs: any): ProviderBundle["profile"] {
  const assetProfile = qs?.assetProfile ?? qs?.summaryProfile ?? {};
  const price = qs?.price ?? {};

  const officers: any[] = Array.isArray(assetProfile.companyOfficers) ? assetProfile.companyOfficers : [];
  const ceo = officers.length ? rawStr(officers[0]?.name) : null;
  const city = rawStr(assetProfile.city);
  const country = rawStr(assetProfile.country);
  const headquarters = city && country ? `${city}/${country}` : city || country || undefined;

  const profile: ProviderBundle["profile"] = {};
  const companyName = rawStr(price.longName) ?? rawStr(price.shortName);
  if (companyName) profile.companyName = companyName;
  const sector = rawStr(assetProfile.sector);
  if (sector) profile.sector = sector;
  const industry = rawStr(assetProfile.industry);
  if (industry) profile.industry = industry;
  const description = rawStr(assetProfile.longBusinessSummary);
  if (description) profile.description = description;
  const website = rawStr(assetProfile.website);
  if (website) profile.website = website;
  if (ceo) profile.ceo = ceo;
  const employees = rawNum(assetProfile.fullTimeEmployees);
  if (employees !== null) profile.employees = employees;
  if (country) profile.country = country;
  if (headquarters) profile.headquarters = headquarters;
  return profile;
}

/** Map quoteSummary financial/summary/keyStatistics modules into the metrics block. */
function mapMetrics(qs: any): Record<string, number | null> {
  const price = qs?.price ?? {};
  const summaryDetail = qs?.summaryDetail ?? {};
  const keyStats = qs?.defaultKeyStatistics ?? {};
  const financialData = qs?.financialData ?? {};

  const metrics: Record<string, number | null> = {
    marketCap: toCrore(price.marketCap),
    peRatio: round2(rawNum(summaryDetail.trailingPE)),
    pbRatio: round2(rawNum(keyStats.priceToBook)),
    eps: round2(rawNum(keyStats.trailingEps)),
    dividendYield: toPercent(summaryDetail.dividendYield),
    roe: toPercent(financialData.returnOnEquity),
    roa: toPercent(financialData.returnOnAssets),
    ebitdaMargin: toPercent(financialData.ebitdaMargins),
    profitMargin: toPercent(financialData.profitMargins),
    debtToEquity: round2(rawNum(financialData.debtToEquity)),
    bookValue: round2(rawNum(keyStats.bookValue)),
    currentRatio: round2(rawNum(financialData.currentRatio)),
    evToSales: round2(rawNum(keyStats.enterpriseToRevenue)),
  };
  // Drop keys that are entirely null so we don't clobber better sources downstream.
  for (const k of Object.keys(metrics)) {
    if (metrics[k] === null) delete metrics[k];
  }
  return metrics;
}

/** Map Yahoo recommendationTrend + financialData target fields into analyst consensus. */
function mapAnalystConsensus(qs: any): ProviderBundle["analystConsensus"] {
  const financialData = qs?.financialData ?? {};
  const trendRows: any[] = Array.isArray(qs?.recommendationTrend?.trend) ? qs.recommendationTrend.trend : [];

  const recommendationTrend = trendRows
    .map((row) => ({
      period: rawStr(row?.period) ?? undefined,
      strongBuy: round2(rawNum(row?.strongBuy)),
      buy: round2(rawNum(row?.buy)),
      hold: round2(rawNum(row?.hold)),
      sell: round2(rawNum(row?.sell)),
      strongSell: round2(rawNum(row?.strongSell)),
    }))
    .filter((row) =>
      [row.strongBuy, row.buy, row.hold, row.sell, row.strongSell].some((value) => value !== null)
    );

  const consensus: ProviderBundle["analystConsensus"] = {
    recommendationTrend,
    targetMeanPrice: round2(rawNum(financialData.targetMeanPrice)),
    targetHighPrice: round2(rawNum(financialData.targetHighPrice)),
    targetLowPrice: round2(rawNum(financialData.targetLowPrice)),
    recommendationMean: round2(rawNum(financialData.recommendationMean)),
    recommendationKey: rawStr(financialData.recommendationKey),
    numberOfAnalystOpinions: round2(rawNum(financialData.numberOfAnalystOpinions)),
  };

  const hasTargets = [
    consensus.targetMeanPrice,
    consensus.targetHighPrice,
    consensus.targetLowPrice,
    consensus.recommendationMean,
    consensus.numberOfAnalystOpinions,
  ].some((value) => value !== null && value !== undefined);

  return recommendationTrend.length || consensus.recommendationKey || hasTargets ? consensus : undefined;
}

/** Generic helper to read a value from a Yahoo statement row by key. */
function rowVal(row: any, key: string): number | null {
  return toCrore(row?.[key]);
}

function hasStatementRows(rows: unknown): rows is Array<Record<string, string | number | null>> {
  return Array.isArray(rows) && rows.some((row) =>
    row && typeof row === "object" &&
    Object.entries(row as Record<string, unknown>).some(
      ([key, value]) => !["period", "quarter", "date"].includes(key) && value !== null && value !== undefined
    )
  );
}

function latestPeriodMs(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((latest, row) => {
    const parsed = Date.parse(String((row as any)?.period || (row as any)?.date || ""));
    return Number.isFinite(parsed) && parsed > latest ? parsed : latest;
  }, 0);
}

function mergeFinancials(
  primary: ProviderBundle["financials"] | undefined,
  fallback: ProviderBundle["financials"] | null
): ProviderBundle["financials"] | undefined {
  if (!fallback) return primary;
  const merged: ProviderBundle["financials"] = { ...(primary || {}) };
  for (const key of ["yearly", "incomeStatement", "balanceSheet", "cashFlow"] as const) {
    const primaryRows = (merged as any)[key];
    const fallbackRows = (fallback as any)[key];
    const fallbackIsNewer = latestPeriodMs(fallbackRows) > latestPeriodMs(primaryRows);
    if (hasStatementRows(fallbackRows) && (!hasStatementRows(primaryRows) || fallbackIsNewer)) {
      (merged as any)[key] = (fallback as any)[key];
    }
  }
  if (!merged?.quarterly && fallback.quarterly?.length) merged.quarterly = fallback.quarterly;
  return Object.keys(merged).length ? merged : undefined;
}

function timeseriesValue(item: any): number | null {
  return toCrore(item?.reportedValue ?? item);
}

export async function getYahooTimeseriesFinancials(
  marketSymbol: string,
  signal?: AbortSignal
): Promise<ProviderBundle["financials"] | null> {
  const ticker = bundleTickers(marketSymbol)[0];
  if (!ticker) return null;
  const cacheKey = ticker.toUpperCase();
  const cached = yahooTimeseriesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < YAHOO_TIMESERIES_CACHE_MS) return cached.data;
  const pending = yahooTimeseriesPending.get(cacheKey);
  if (pending) return pending;

  const request = fetchYahooTimeseriesFinancials(ticker, signal).finally(() => {
    yahooTimeseriesPending.delete(cacheKey);
  });
  yahooTimeseriesPending.set(cacheKey, request);
  return request;
}

async function fetchYahooTimeseriesFinancials(
  ticker: string,
  signal?: AbortSignal
): Promise<ProviderBundle["financials"] | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const eightYearsAgo = Math.floor(now - 8 * 366 * 24 * 60 * 60);
    const url =
      `${YAHOO_QUERY1}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}` +
      `?symbol=${encodeURIComponent(ticker)}&type=${FUNDAMENTALS_TIMESERIES_TYPES}` +
      `&period1=${eightYearsAgo}&period2=${now + 366 * 24 * 60 * 60}`;

    const payload = await getJson<any>(url, { timeoutMs: 7000, retries: 1, signal });
    const result: any[] = Array.isArray(payload?.timeseries?.result) ? payload.timeseries.result : [];
    if (!result.length) return null;

    const rowsByPeriod = new Map<string, Record<string, number | null>>();
    for (const block of result) {
      const type = Array.isArray(block?.meta?.type) ? String(block.meta.type[0] || "") : "";
      const values: any[] = Array.isArray(block?.[type]) ? block[type] : [];
      if (!type || !values.length) continue;
      for (const item of values) {
        const period = periodLabel(item?.asOfDate);
        if (!period) continue;
        const row = rowsByPeriod.get(period) || {};
        row[type] = timeseriesValue(item);
        rowsByPeriod.set(period, row);
      }
    }

    const periods = Array.from(rowsByPeriod.keys()).sort((a, b) => Date.parse(a) - Date.parse(b));
    if (!periods.length) return null;

    const incomeStatement = periods
      .map((period) => {
        const row = rowsByPeriod.get(period) || {};
        return {
          period,
          revenue: row.annualTotalRevenue ?? null,
          ebit: row.annualEBIT ?? null,
          netIncome: row.annualNetIncome ?? null,
        };
      })
      .filter((row) => hasStatementRows([row]));

    const balanceSheet = periods
      .map((period) => {
        const row = rowsByPeriod.get(period) || {};
        return {
          period,
          totalAssets: row.annualTotalAssets ?? null,
          totalDebt: row.annualTotalDebt ?? null,
          totalLiabilities: row.annualTotalLiabilitiesNetMinorityInterest ?? null,
          equity: row.annualStockholdersEquity ?? null,
          currentAssets: row.annualCurrentAssets ?? null,
          currentLiabilities: row.annualCurrentLiabilities ?? null,
          retainedEarnings: row.annualRetainedEarnings ?? null,
        };
      })
      .filter((row) => hasStatementRows([row]));

    const cashFlow = periods
      .map((period) => {
        const row = rowsByPeriod.get(period) || {};
        return {
          period,
          operatingCashFlow: row.annualOperatingCashFlow ?? null,
          investingCashFlow: row.annualInvestingCashFlow ?? null,
          financingCashFlow: row.annualFinancingCashFlow ?? null,
          freeCashFlow: row.annualFreeCashFlow ?? null,
        };
      })
      .filter((row) => hasStatementRows([row]));

    const yearly = periods
      .map((period) => {
        const row = rowsByPeriod.get(period) || {};
        return {
          period,
          revenue: row.annualTotalRevenue ?? null,
          profit: row.annualNetIncome ?? null,
          assets: row.annualTotalAssets ?? null,
          cashFlow: row.annualOperatingCashFlow ?? null,
        };
      })
      .filter((row) => hasStatementRows([row]));

    const financials: ProviderBundle["financials"] = {};
    if (yearly.length) financials.yearly = yearly;
    if (incomeStatement.length) financials.incomeStatement = incomeStatement;
    if (balanceSheet.length) financials.balanceSheet = balanceSheet;
    if (cashFlow.length) financials.cashFlow = cashFlow;
    const data = Object.keys(financials).length ? financials : null;
    yahooTimeseriesCache.set(ticker.toUpperCase(), { at: Date.now(), data });
    return data;
  } catch (err) {
    console.warn(`[yahoo] getYahooTimeseriesFinancials failed: ${String(err)}`);
    return null;
  }
}

/** Build the yearly + statement tables from the *History modules. */
function mapFinancials(qs: any): ProviderBundle["financials"] {
  const incomeAnnual: any[] =
    qs?.incomeStatementHistory?.incomeStatementHistory ?? [];
  const incomeQuarterly: any[] =
    qs?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
  const balanceAnnual: any[] = qs?.balanceSheetHistory?.balanceSheetStatements ?? [];
  const cashAnnual: any[] = qs?.cashflowStatementHistory?.cashflowStatements ?? [];

  const incomeStatement = incomeAnnual.map((r) => ({
    period: periodLabel(r?.endDate?.raw ?? r?.endDate),
    revenue: rowVal(r, "totalRevenue"),
    ebit: rowVal(r, "ebit") ?? rowVal(r, "operatingIncome"),
    netIncome: rowVal(r, "netIncome"),
  }));

  const balanceSheet = balanceAnnual.map((r) => ({
    period: periodLabel(r?.endDate?.raw ?? r?.endDate),
    totalAssets: rowVal(r, "totalAssets"),
    // NOTE: "totalDebt" here is Yahoo's `totalLiab` (Total Liabilities), an
    // existing naming quirk kept as-is since other code already reads it.
    // `totalLiabilities` is added as its own explicit key below so
    // scoring.ts's generic substring matcher finds the real total-liabilities
    // figure instead of falling through to currentLiabilities (the only
    // other key whose normalized name contains "liabilities").
    totalDebt: rowVal(r, "totalLiab"),
    totalLiabilities: rowVal(r, "totalLiab"),
    equity: rowVal(r, "totalStockholderEquity"),
    currentAssets: rowVal(r, "totalCurrentAssets"),
    currentLiabilities: rowVal(r, "totalCurrentLiabilities"),
    retainedEarnings: rowVal(r, "retainedEarnings"),
  }));

  const cashFlow = cashAnnual.map((r) => ({
    period: periodLabel(r?.endDate?.raw ?? r?.endDate),
    operatingCashFlow: rowVal(r, "totalCashFromOperatingActivities"),
    investingCashFlow: rowVal(r, "totalCashflowsFromInvestingActivities"),
    financingCashFlow: rowVal(r, "totalCashFromFinancingActivities"),
    freeCashFlow: null as number | null,
  }));

  // yearly = revenue + profit from income, assets from balance, cashFlow from cash,
  // matched on the period label.
  const balanceByPeriod = new Map<string, any>();
  for (const r of balanceAnnual) {
    const p = periodLabel(r?.endDate?.raw ?? r?.endDate);
    if (p) balanceByPeriod.set(p, r);
  }
  const cashByPeriod = new Map<string, any>();
  for (const r of cashAnnual) {
    const p = periodLabel(r?.endDate?.raw ?? r?.endDate);
    if (p) cashByPeriod.set(p, r);
  }
  const yearly = incomeAnnual
    .map((r) => {
      const period = periodLabel(r?.endDate?.raw ?? r?.endDate);
      if (!period) return null;
      const bal = balanceByPeriod.get(period);
      const cash = cashByPeriod.get(period);
      return {
        period,
        revenue: rowVal(r, "totalRevenue"),
        profit: rowVal(r, "netIncome"),
        assets: bal ? rowVal(bal, "totalAssets") : null,
        cashFlow: cash ? rowVal(cash, "totalCashFromOperatingActivities") : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Quarterly summary: prefer the quarterly income statement; fall back to the
  // earnings.financialsChart quarterly series for revenue/earnings.
  const quarterly: QuarterPoint[] = [];
  if (incomeQuarterly.length) {
    for (const r of incomeQuarterly) {
      const period = periodLabel(r?.endDate?.raw ?? r?.endDate);
      if (!period) continue;
      quarterly.push({ period, revenue: rowVal(r, "totalRevenue"), profit: rowVal(r, "netIncome") });
    }
  } else {
    const quartersChart: any[] = qs?.earnings?.financialsChart?.quarterly ?? [];
    for (const r of quartersChart) {
      const period = rawStr(r?.date);
      if (!period) continue;
      quarterly.push({ period, revenue: toCrore(r?.revenue), profit: toCrore(r?.earnings) });
    }
  }
  quarterly.sort((a, b) => Date.parse(a.period) - Date.parse(b.period));

  const financials: ProviderBundle["financials"] = {};
  if (quarterly.length) financials.quarterly = quarterly;
  if (yearly.length) financials.yearly = yearly;
  if (incomeStatement.some((r) => r.period)) financials.incomeStatement = incomeStatement;
  if (balanceSheet.some((r) => r.period)) financials.balanceSheet = balanceSheet;
  if (cashFlow.some((r) => r.period)) financials.cashFlow = cashFlow;
  return financials;
}

/** Build the shareholding block from majorHoldersBreakdown + institutionOwnership. */
function mapShareholding(qs: any): ProviderBundle["shareholding"] {
  const breakdown = qs?.majorHoldersBreakdown ?? {};
  const institutions: any[] = qs?.institutionOwnership?.ownershipList ?? [];

  const promoters = toPercent(breakdown.insidersPercentHeld);
  const fii = toPercent(breakdown.institutionsPercentHeld);

  const topHolders: ShareholdingHolder[] = institutions
    .map((h) => {
      const name = rawStr(h?.organization);
      const value = rawNum(h?.pctHeld);
      if (!name || value === null) return null;
      return { name, value: round2(value * 100) ?? 0 } as ShareholdingHolder;
    })
    .filter((x): x is ShareholdingHolder => x !== null);

  const shareholding: ProviderBundle["shareholding"] = {};
  if (promoters !== null) shareholding.promoters = promoters;
  if (fii !== null) shareholding.fii = fii;
  if (topHolders.length) shareholding.topHolders = topHolders;
  return Object.keys(shareholding).length ? shareholding : undefined;
}

/** Build a 52-week-augmented RawQuote from summaryDetail + price modules. */
function mapBundleQuote(qs: any): RawQuote | undefined {
  const price = qs?.price ?? {};
  const summaryDetail = qs?.summaryDetail ?? {};

  const cmp = rawNum(price.regularMarketPrice);
  const prevClose = rawNum(price.regularMarketPreviousClose) ?? rawNum(summaryDetail.previousClose);
  if (cmp === null && prevClose === null) {
    // Still surface 52wk if present.
    const high = round2(rawNum(summaryDetail.fiftyTwoWeekHigh));
    const low = round2(rawNum(summaryDetail.fiftyTwoWeekLow));
    if (high === null && low === null) return undefined;
    return { cmp: null, change: null, changePercent: null, fiftyTwoWeekHigh: high, fiftyTwoWeekLow: low };
  }

  let change: number | null = null;
  let changePercent: number | null = null;
  if (cmp !== null && prevClose !== null) {
    change = round2(cmp - prevClose);
    changePercent = prevClose !== 0 ? round2(((cmp - prevClose) / prevClose) * 100) : 0;
  }

  return {
    cmp: round2(cmp),
    change,
    changePercent,
    fiftyTwoWeekHigh: round2(rawNum(summaryDetail.fiftyTwoWeekHigh)),
    fiftyTwoWeekLow: round2(rawNum(summaryDetail.fiftyTwoWeekLow)),
    marketCap: toCrore(price.marketCap),
    peRatio: round2(rawNum(summaryDetail.trailingPE)),
    dividendYield: toPercent(summaryDetail.dividendYield),
    companyName: rawStr(price.longName) ?? rawStr(price.shortName) ?? undefined,
    currency: typeof price.currency === "string" && price.currency.trim() ? price.currency : "INR",
  };
}

/**
 * yfinance-equivalent bundle: profile, metrics, statements, shareholding, quote,
 * plus daily candles. quoteSummary requires a crumb+cookie; if that flow fails we
 * still return a partial bundle containing at least the candles.
 */
export async function getYahooBundle(
  marketSymbol: string,
  days: number,
  signal?: AbortSignal
): Promise<ProviderBundle | null> {
  try {
    const dayCount = days && days > 0 ? days : 1825;

    // Candles are independent of the crumb flow and always attempted.
    const candles = await getYahooCandles(marketSymbol, dayCount, signal);

    const bundle: ProviderBundle = {};
    if (candles && candles.length) bundle.candles = candles;
    const timeseriesFinancials = await getYahooTimeseriesFinancials(marketSymbol, signal);
    if (timeseriesFinancials) bundle.financials = timeseriesFinancials;

    // Attempt the crumb flow; if it fails, return whatever we have (partial).
    const auth = await getYahooCrumb();
    if (!auth) {
      return Object.keys(bundle).length ? bundle : null;
    }

    // quoteSummary, trying each ticker candidate until one returns a result.
    let qs: any = null;
    for (const ticker of bundleTickers(marketSymbol)) {
      const url =
        `${YAHOO_QUERY2}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
        `?modules=${QUOTE_SUMMARY_MODULES}&crumb=${encodeURIComponent(auth.crumb)}`;
      const payload = await getJson<any>(url, {
        timeoutMs: 8000,
        retries: 1,
        headers: { cookie: auth.cookie, accept: "application/json" },
        signal,
      });
      const result = payload?.quoteSummary?.result?.[0];
      if (result) {
        qs = result;
        break;
      }
    }

    if (!qs) {
      return Object.keys(bundle).length ? bundle : null;
    }

    const profile = mapProfile(qs);
    if (profile && Object.keys(profile).length) bundle.profile = profile;

    const metrics = mapMetrics(qs);
    if (metrics && Object.keys(metrics).length) bundle.metrics = metrics;

    const financials = mergeFinancials(mapFinancials(qs), timeseriesFinancials);
    if (financials && Object.keys(financials).length) bundle.financials = financials;

    const shareholding = mapShareholding(qs);
    if (shareholding) bundle.shareholding = shareholding;

    const analystConsensus = mapAnalystConsensus(qs);
    if (analystConsensus) bundle.analystConsensus = analystConsensus;

    const quote = mapBundleQuote(qs);
    if (quote) bundle.quote = quote;

    return Object.keys(bundle).length ? bundle : null;
  } catch (err) {
    console.warn(`[yahoo] getYahooBundle failed: ${String(err)}`);
    return null;
  }
}
