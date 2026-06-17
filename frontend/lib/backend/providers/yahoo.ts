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

/** Format a unix timestamp / date string as a "Mon yy" period label (e.g. "Mar 24"). */
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
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${month} ${year}`;
}

/**
 * Fetch & parse Yahoo v8 chart for a single fully-qualified ticker (e.g. RELIANCE.NS).
 * Returns the raw `result.chart.result[0]` object or null.
 */
async function fetchChartResult(ticker: string, days: number): Promise<any | null> {
  const range = days > 365 ? "5y" : days > 30 ? "1y" : "1mo";
  const url = `${YAHOO_QUERY1}/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=1d&includePrePost=false`;
  const payload = await getJson<any>(url, { timeoutMs: 7000, retries: 1 });
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
 * Daily candles for an Indian equity. Tries `{SYM}.NS` then `{SYM}.BO`.
 * First ticker yielding candles wins. Returns null on total failure.
 */
export async function getYahooCandles(base: string, days: number): Promise<Candle[] | null> {
  try {
    const sym = baseSymbol(base);
    if (!sym) return null;
    const dayCount = days && days > 0 ? days : 1825;
    for (const suffix of [".NS", ".BO"]) {
      const result = await fetchChartResult(`${sym}${suffix}`, dayCount);
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
export async function getYahooQuote(marketSymbol: string): Promise<RawQuote | null> {
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
      const result = await fetchChartResult(ticker, 5);
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

/**
 * Obtain a (cookie, crumb) pair required by the v10 quoteSummary endpoint.
 *  1. GET https://fc.yahoo.com (capture set-cookie).
 *  2. GET query2/v1/test/getcrumb with that cookie to obtain the crumb.
 * Returns null if either step fails.
 */
async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
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
    return { cookie, crumb };
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

/** Generic helper to read a value from a Yahoo statement row by key. */
function rowVal(row: any, key: string): number | null {
  return toCrore(row?.[key]);
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
    totalDebt: rowVal(r, "totalLiab"),
    equity: rowVal(r, "totalStockholderEquity"),
    currentAssets: rowVal(r, "totalCurrentAssets"),
    currentLiabilities: rowVal(r, "totalCurrentLiabilities"),
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
export async function getYahooBundle(marketSymbol: string, days: number): Promise<ProviderBundle | null> {
  try {
    const dayCount = days && days > 0 ? days : 1825;

    // Candles are independent of the crumb flow and always attempted.
    const candleBase = baseSymbol(marketSymbol);
    const candles = await getYahooCandles(candleBase, dayCount);

    const bundle: ProviderBundle = {};
    if (candles && candles.length) bundle.candles = candles;

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

    const financials = mapFinancials(qs);
    if (financials && Object.keys(financials).length) bundle.financials = financials;

    const shareholding = mapShareholding(qs);
    if (shareholding) bundle.shareholding = shareholding;

    const quote = mapBundleQuote(qs);
    if (quote) bundle.quote = quote;

    return Object.keys(bundle).length ? bundle : null;
  } catch (err) {
    console.warn(`[yahoo] getYahooBundle failed: ${String(err)}`);
    return null;
  }
}
