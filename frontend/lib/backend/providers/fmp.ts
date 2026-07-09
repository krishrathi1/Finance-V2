/**
 * Financial Modeling Prep (FMP) provider.
 *
 * Implements {@link FmpProviderApi} from "@/lib/backend/contracts". FMP is used
 * as a last-resort live-price fallback, the PRIMARY daily-candle source for
 * charts, and a back-fill source for fundamentals (profile, key metrics,
 * financial growth, quarterly results, analyst estimates).
 *
 * Port of the FMP fetchers in backend/app/services/providers.py. See the specs
 * under scratch/port-specs/01-* and 02-* for exact URLs and field maps.
 *
 * GOLDEN RULE: none of these functions ever throw. They return null (or an
 * empty array, matching the documented signature) on any failure or timeout.
 * FMP's free tier frequently responds 401/403 — we degrade gracefully to null.
 */

import { getJson, round2, toFloat } from "@/lib/backend/http";
import type {
  Candle,
  FmpProviderApi,
  ProviderBundle,
  QuarterPoint,
} from "@/lib/backend/contracts";
import type { DashboardData } from "@/lib/types";

const FMP_HOST = "https://financialmodelingprep.com";

/** INR -> crore (divide by 1e7), matching the Python providers. */
const CRORE = 10_000_000;

function apiKey(): string {
  return process.env.FMP_API_KEY || "";
}

/** Upper-case the symbol; append ".NS" when it lacks an .NS/.BO suffix. */
function fmpSymbol(symbol: string): string {
  const sym = String(symbol || "").trim().toUpperCase();
  if (sym.endsWith(".NS") || sym.endsWith(".BO")) return sym;
  return `${sym}.NS`;
}

/**
 * Live quote (last-resort price fallback).
 *
 * Primary:  GET /stable/quote?symbol={SYM}&apikey={KEY}
 * Fallback: GET /api/v3/quote/{SYM}?apikey={KEY}
 * Both return a list; we map the first element.
 */
async function getFmpQuote(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<import("@/lib/backend/contracts").RawQuote | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const primary = `${FMP_HOST}/stable/quote?symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(key)}`;
    const fallback = `${FMP_HOST}/api/v3/quote/${encodeURIComponent(sym)}?apikey=${encodeURIComponent(key)}`;

    let payload = await getJson<any[]>(primary, { timeoutMs: 6000, signal });
    if (!Array.isArray(payload) || payload.length === 0) {
      payload = await getJson<any[]>(fallback, { timeoutMs: 6000, signal });
    }
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const quote = payload[0];
    if (!quote || typeof quote !== "object") return null;

    // /stable uses "changePercentage"; /api/v3 uses "changesPercentage".
    const changePercent =
      toFloat(quote.changePercentage) ?? toFloat(quote.changesPercentage);

    return {
      cmp: round2(quote.price),
      change: round2(quote.change),
      changePercent: changePercent !== null ? round2(changePercent) : null,
      companyName: quote.name ?? null,
      currency: "INR",
    };
  } catch (err) {
    console.warn(`[fmp] getFmpQuote failed: ${String(err)}`);
    return null;
  }
}

/**
 * Daily candles (PRIMARY chart source).
 *
 * GET /api/v3/historical-price-full/{SYM}?apikey={KEY}
 * Parses the `historical` array; FMP returns descending so we sort ascending.
 * Timeframe controls how many trailing days to keep.
 */
async function getFmpCandles(
  marketSymbol: string,
  timeframe: string,
  signal?: AbortSignal,
): Promise<Candle[] | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const url = `${FMP_HOST}/api/v3/historical-price-full/${encodeURIComponent(sym)}?apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any>(url, { timeoutMs: 8000, signal });

    const historical: any[] | undefined = Array.isArray(payload)
      ? payload
      : payload?.historical;
    if (!Array.isArray(historical) || historical.length === 0) return null;

    let days = 365;
    const tf = String(timeframe || "").toUpperCase();
    if (tf === "1M") days = 30;
    else if (tf === "1W") days = 7;
    else if (tf === "5Y") days = 1825;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const candles: Candle[] = [];
    for (const r of historical) {
      if (!r || typeof r !== "object") continue;
      const dateStr = String(r.date || "").trim();
      if (!dateStr) continue;
      const parsed = Date.parse(dateStr);
      if (!Number.isFinite(parsed) || parsed < cutoff) continue;

      const close = toFloat(r.close);
      if (close === null) continue;
      const open = toFloat(r.open);
      const high = toFloat(r.high);
      const low = toFloat(r.low);
      const volume = toFloat(r.volume);

      candles.push({
        date: dateStr.split("T")[0],
        open: round2(open ?? close) ?? 0,
        high: round2(high ?? close) ?? 0,
        low: round2(low ?? close) ?? 0,
        close: round2(close) ?? 0,
        volume: volume !== null ? Math.trunc(volume) : 0,
      });
    }

    if (candles.length === 0) return null;
    // FMP returns descending -> sort ascending by date.
    candles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return candles;
  } catch (err) {
    console.warn(`[fmp] getFmpCandles failed: ${String(err)}`);
    return null;
  }
}

/** Normalize a provider date to ISO for stable cross-provider ordering. */
function periodLabel(dateStr: string): string {
  const s = String(dateStr || "").trim();
  if (!s) return s;
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) return s;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Quarterly results (summary).
 *
 * GET /stable/income-statement?symbol={SYM}&period=quarter&limit=8&apikey={KEY}
 * Maps revenue and netIncome -> profit, converting INR to crore (/1e7).
 * Returned ascending by date.
 */
async function getFmpQuarterlyResults(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<QuarterPoint[] | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const url = `${FMP_HOST}/stable/income-statement?symbol=${encodeURIComponent(sym)}&period=quarter&limit=8&apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any[]>(url, { timeoutMs: 7000, signal });
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const rows = payload.map((item) => {
      const dateStr = String(item?.date || "");
      const revenue = toFloat(item?.revenue);
      const profit = toFloat(item?.netIncome);
      return {
        date: dateStr,
        period: periodLabel(dateStr),
        revenue: revenue !== null ? round2(revenue / CRORE) : null,
        profit: profit !== null ? round2(profit / CRORE) : null,
      };
    });

    // Sort ascending by raw date, then drop the helper `date` field.
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return rows.map(({ period, revenue, profit }) => ({ period, revenue, profit }));
  } catch (err) {
    console.warn(`[fmp] getFmpQuarterlyResults failed: ${String(err)}`);
    return null;
  }
}

/**
 * Company profile enrichment (fallback after yfinance).
 *
 * GET /api/v3/profile/{SYM}?apikey={KEY}
 * Returns a list; we use the first element.
 */
async function getFmpProfile(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<
  | (Partial<DashboardData["profile"]> & { companyName?: string; sector?: string })
  | null
> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const url = `${FMP_HOST}/api/v3/profile/${encodeURIComponent(sym)}?apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any[]>(url, { timeoutMs: 5000, signal });
    if (!Array.isArray(payload) || payload.length === 0 || !payload[0]) return null;

    const p = payload[0];
    const employeesRaw = p.fullTimeEmployees ?? p.employees;
    const employees =
      employeesRaw === null || employeesRaw === undefined || employeesRaw === ""
        ? undefined
        : employeesRaw;

    return {
      companyName: p.companyName || undefined,
      description: p.description || undefined,
      website: p.website || undefined,
      industry: p.industry || undefined,
      sector: p.sector || undefined,
      ceo: p.ceo || p.CEO || undefined,
      employees,
      ipoDate: p.ipoDate || undefined,
      country: p.country || undefined,
    };
  } catch (err) {
    console.warn(`[fmp] getFmpProfile failed: ${String(err)}`);
    return null;
  }
}

/**
 * Annual key metrics (raw rows).
 *
 * GET /api/v3/key-metrics?symbol={SYM}&period=annual&limit=5&apikey={KEY}
 * (FMP also accepts the symbol in the path for v3; the query form is used to
 * stay consistent with the documented endpoint.)
 */
async function getFmpKeyMetrics(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, number | string | null>> | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const url = `${FMP_HOST}/api/v3/key-metrics/${encodeURIComponent(sym)}?period=annual&limit=5&apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any[]>(url, { timeoutMs: 6000, signal });
    if (!Array.isArray(payload)) return null;
    return payload as Array<Record<string, number | string | null>>;
  } catch (err) {
    console.warn(`[fmp] getFmpKeyMetrics failed: ${String(err)}`);
    return null;
  }
}

function toCrore(value: unknown): number | null {
  const n = toFloat(value);
  if (n === null) return null;
  return round2(n / CRORE);
}

async function getFmpRows(
  stablePath: string,
  v3Path: string,
  sym: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<any[] | null> {
  const key = apiKey();
  const stableUrl = `${FMP_HOST}/stable/${stablePath}?symbol=${encodeURIComponent(sym)}&period=annual&limit=5&apikey=${encodeURIComponent(key)}`;
  const v3Url = `${FMP_HOST}/api/v3/${v3Path}/${encodeURIComponent(sym)}?period=annual&limit=5&apikey=${encodeURIComponent(key)}`;

  let payload = await getJson<any[]>(stableUrl, { timeoutMs, signal });
  if (!Array.isArray(payload) || payload.length === 0) {
    payload = await getJson<any[]>(v3Url, { timeoutMs, signal });
  }
  return Array.isArray(payload) && payload.length ? payload : null;
}

function firstNumber(row: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = toCrore(row?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function hasStatementData(row: Record<string, string | number | null>): boolean {
  return Object.entries(row).some(([key, value]) => key !== "period" && value !== null && value !== undefined);
}

/**
 * Annual income statement, balance sheet, and cash-flow statement.
 *
 * Yahoo quoteSummary can omit balance/cash-flow data for Indian listings. FMP
 * exposes those as dedicated statement endpoints, so this fills the deep
 * statement tabs and the yearly assets/cash-flow summary when an API key exists.
 */
async function getFmpFinancialStatements(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<ProviderBundle["financials"] | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const [incomeRows, balanceRows, cashRows] = await Promise.all([
      getFmpRows("income-statement", "income-statement", sym, 7000, signal),
      getFmpRows("balance-sheet-statement", "balance-sheet-statement", sym, 7000, signal),
      getFmpRows("cash-flow-statement", "cash-flow-statement", sym, 7000, signal),
    ]);

    const byPeriod = (rows: any[] | null) => {
      const map = new Map<string, any>();
      for (const row of rows || []) {
        const period = periodLabel(String(row?.date || row?.fillingDate || row?.calendarYear || ""));
        if (period) map.set(period, row);
      }
      return map;
    };

    const incomeStatement = (incomeRows || [])
      .map((r) => ({
        period: periodLabel(String(r?.date || r?.fillingDate || "")),
        revenue: firstNumber(r, ["revenue", "totalRevenue"]),
        grossProfit: firstNumber(r, ["grossProfit"]),
        ebit: firstNumber(r, ["ebit", "operatingIncome"]),
        netIncome: firstNumber(r, ["netIncome"]),
        eps: round2(r?.eps ?? r?.epsdiluted),
      }))
      .filter((row) => row.period && hasStatementData(row))
      .sort((a, b) => Date.parse(a.period) - Date.parse(b.period));

    const balanceSheet = (balanceRows || [])
      .map((r) => ({
        period: periodLabel(String(r?.date || r?.fillingDate || "")),
        totalAssets: firstNumber(r, ["totalAssets"]),
        totalDebt: firstNumber(r, ["totalDebt", "shortTermDebt", "longTermDebt"]),
        totalLiabilities: firstNumber(r, ["totalLiabilities", "totalLiab"]),
        equity: firstNumber(r, ["totalStockholdersEquity", "totalStockholderEquity", "totalEquity"]),
        currentAssets: firstNumber(r, ["totalCurrentAssets"]),
        currentLiabilities: firstNumber(r, ["totalCurrentLiabilities"]),
        retainedEarnings: firstNumber(r, ["retainedEarnings"]),
      }))
      .filter((row) => row.period && hasStatementData(row))
      .sort((a, b) => Date.parse(a.period) - Date.parse(b.period));

    const cashFlow = (cashRows || [])
      .map((r) => ({
        period: periodLabel(String(r?.date || r?.fillingDate || "")),
        operatingCashFlow: firstNumber(r, ["operatingCashFlow", "netCashProvidedByOperatingActivities"]),
        investingCashFlow: firstNumber(r, ["netCashUsedForInvestingActivites", "netCashUsedForInvestingActivities"]),
        financingCashFlow: firstNumber(r, ["netCashUsedProvidedByFinancingActivities", "netCashProvidedByFinancingActivities"]),
        freeCashFlow: firstNumber(r, ["freeCashFlow"]),
      }))
      .filter((row) => row.period && hasStatementData(row))
      .sort((a, b) => Date.parse(a.period) - Date.parse(b.period));

    const balanceByPeriod = byPeriod(balanceRows);
    const cashByPeriod = byPeriod(cashRows);
    const yearly = incomeStatement
      .map((income) => {
        const period = String(income.period || "");
        const balance = balanceByPeriod.get(period);
        const cash = cashByPeriod.get(period);
        return {
          period,
          revenue: typeof income.revenue === "number" ? income.revenue : null,
          profit: typeof income.netIncome === "number" ? income.netIncome : null,
          assets: balance ? firstNumber(balance, ["totalAssets"]) : null,
          cashFlow: cash ? firstNumber(cash, ["operatingCashFlow", "netCashProvidedByOperatingActivities"]) : null,
        };
      })
      .filter((row) => row.period);

    const financials: ProviderBundle["financials"] = {};
    if (yearly.length) financials.yearly = yearly;
    if (incomeStatement.length) financials.incomeStatement = incomeStatement;
    if (balanceSheet.length) financials.balanceSheet = balanceSheet;
    if (cashFlow.length) financials.cashFlow = cashFlow;
    return Object.keys(financials).length ? financials : null;
  } catch (err) {
    console.warn(`[fmp] getFmpFinancialStatements failed: ${String(err)}`);
    return null;
  }
}

/**
 * Annual financial growth (raw rows).
 *
 * GET /api/v3/financial-growth?symbol={SYM}&period=annual&limit=5&apikey={KEY}
 */
async function getFmpFinancialGrowth(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, number | string | null>> | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const url = `${FMP_HOST}/api/v3/financial-growth/${encodeURIComponent(sym)}?period=annual&limit=5&apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any[]>(url, { timeoutMs: 6000, signal });
    if (!Array.isArray(payload)) return null;
    return payload as Array<Record<string, number | string | null>>;
  } catch (err) {
    console.warn(`[fmp] getFmpFinancialGrowth failed: ${String(err)}`);
    return null;
  }
}

/**
 * Analyst estimates (raw rows).
 *
 * GET /api/v3/analyst-estimates/{SYM}?limit=5&apikey={KEY}
 */
async function getFmpAnalystEstimates(
  marketSymbol: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, number | string | null>> | null> {
  try {
    const key = apiKey();
    if (!key) return null;
    const sym = fmpSymbol(marketSymbol);

    const url = `${FMP_HOST}/api/v3/analyst-estimates/${encodeURIComponent(sym)}?limit=5&apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any[]>(url, { timeoutMs: 5000, signal });
    if (!Array.isArray(payload)) return null;
    return payload as Array<Record<string, number | string | null>>;
  } catch (err) {
    console.warn(`[fmp] getFmpAnalystEstimates failed: ${String(err)}`);
    return null;
  }
}

/**
 * Symbol search (used by search + screener reuse).
 *
 * GET /api/v3/search?query={q}&limit=15&exchange=NSE&apikey={KEY}
 * Returns a normalized [{symbol, name, exchange}] list (empty on failure).
 */
export async function searchFmp(
  query: string,
): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  try {
    const key = apiKey();
    const q = String(query || "").trim();
    if (!key || !q) return [];

    const url = `${FMP_HOST}/api/v3/search?query=${encodeURIComponent(q)}&limit=15&exchange=NSE&apikey=${encodeURIComponent(key)}`;
    const payload = await getJson<any[]>(url, { timeoutMs: 5000 });
    if (!Array.isArray(payload)) return [];

    return payload
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        symbol: String(item.symbol || ""),
        name: String(item.name || ""),
        exchange: String(item.exchangeShortName || item.exchange || ""),
      }))
      .filter((row) => row.symbol);
  } catch (err) {
    console.warn(`[fmp] searchFmp failed: ${String(err)}`);
    return [];
  }
}

export {
  getFmpQuote,
  getFmpCandles,
  getFmpQuarterlyResults,
  getFmpProfile,
  getFmpKeyMetrics,
  getFmpFinancialStatements,
  getFmpFinancialGrowth,
  getFmpAnalystEstimates,
};

/** The full FMP provider, satisfying the shared contract. */
export const fmpProvider: FmpProviderApi = {
  getFmpQuote,
  getFmpCandles,
  getFmpQuarterlyResults,
  getFmpProfile,
  getFmpKeyMetrics,
  getFmpFinancialStatements,
  getFmpFinancialGrowth,
  getFmpAnalystEstimates,
  searchFmp,
};
