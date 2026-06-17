/**
 * Live screener/heatmap universe powered by Yahoo Finance batch quotes.
 *
 * NSE's equity-stockIndices/allIndices endpoints are edge-blocked (404) for
 * non-browser clients, and FMP's screener needs a paid plan. Yahoo's v7 batch
 * quote (with a crumb) reliably returns price, PE, market cap, volume and
 * dividend yield for many symbols at once, so we screen a curated universe of
 * liquid NSE names against real, live fundamentals.
 */

import { round2, DESKTOP_UA } from "@/lib/backend/http";
import type { ScreenerResult } from "@/lib/types";

/** Curated NSE universe: liquid large/mid-cap names with their sector. */
export const NSE_UNIVERSE: Array<{ symbol: string; sector: string }> = [
  { symbol: "RELIANCE", sector: "Energy" }, { symbol: "ONGC", sector: "Energy" }, { symbol: "IOC", sector: "Energy" },
  { symbol: "BPCL", sector: "Energy" }, { symbol: "GAIL", sector: "Energy" }, { symbol: "COALINDIA", sector: "Energy" },
  { symbol: "NTPC", sector: "Power" }, { symbol: "POWERGRID", sector: "Power" }, { symbol: "TATAPOWER", sector: "Power" },
  { symbol: "ADANIPOWER", sector: "Power" }, { symbol: "ADANIGREEN", sector: "Power" },
  { symbol: "TCS", sector: "IT" }, { symbol: "INFY", sector: "IT" }, { symbol: "WIPRO", sector: "IT" },
  { symbol: "HCLTECH", sector: "IT" }, { symbol: "TECHM", sector: "IT" }, { symbol: "LTIM", sector: "IT" },
  { symbol: "PERSISTENT", sector: "IT" }, { symbol: "COFORGE", sector: "IT" }, { symbol: "MPHASIS", sector: "IT" },
  { symbol: "HDFCBANK", sector: "Banking" }, { symbol: "ICICIBANK", sector: "Banking" }, { symbol: "SBIN", sector: "Banking" },
  { symbol: "KOTAKBANK", sector: "Banking" }, { symbol: "AXISBANK", sector: "Banking" }, { symbol: "INDUSINDBK", sector: "Banking" },
  { symbol: "BANKBARODA", sector: "Banking" }, { symbol: "PNB", sector: "Banking" }, { symbol: "FEDERALBNK", sector: "Banking" },
  { symbol: "IDFCFIRSTB", sector: "Banking" }, { symbol: "AUBANK", sector: "Banking" },
  { symbol: "BAJFINANCE", sector: "Finance" }, { symbol: "BAJAJFINSV", sector: "Finance" }, { symbol: "SBICARD", sector: "Finance" },
  { symbol: "CHOLAFIN", sector: "Finance" }, { symbol: "SHRIRAMFIN", sector: "Finance" }, { symbol: "MUTHOOTFIN", sector: "Finance" },
  { symbol: "HDFCLIFE", sector: "Insurance" }, { symbol: "SBILIFE", sector: "Insurance" }, { symbol: "ICICIGI", sector: "Insurance" },
  { symbol: "ICICIPRULI", sector: "Insurance" }, { symbol: "LICI", sector: "Insurance" },
  { symbol: "MARUTI", sector: "Auto" }, { symbol: "TATAMOTORS", sector: "Auto" }, { symbol: "M&M", sector: "Auto" },
  { symbol: "BAJAJ-AUTO", sector: "Auto" }, { symbol: "EICHERMOT", sector: "Auto" }, { symbol: "HEROMOTOCO", sector: "Auto" },
  { symbol: "TVSMOTOR", sector: "Auto" }, { symbol: "ASHOKLEY", sector: "Auto" }, { symbol: "MOTHERSON", sector: "Auto" },
  { symbol: "SUNPHARMA", sector: "Pharma" }, { symbol: "DRREDDY", sector: "Pharma" }, { symbol: "CIPLA", sector: "Pharma" },
  { symbol: "DIVISLAB", sector: "Pharma" }, { symbol: "APOLLOHOSP", sector: "Pharma" }, { symbol: "LUPIN", sector: "Pharma" },
  { symbol: "AUROPHARMA", sector: "Pharma" }, { symbol: "TORNTPHARM", sector: "Pharma" }, { symbol: "ZYDUSLIFE", sector: "Pharma" },
  { symbol: "HINDUNILVR", sector: "FMCG" }, { symbol: "ITC", sector: "FMCG" }, { symbol: "NESTLEIND", sector: "FMCG" },
  { symbol: "BRITANNIA", sector: "FMCG" }, { symbol: "DABUR", sector: "FMCG" }, { symbol: "MARICO", sector: "FMCG" },
  { symbol: "GODREJCP", sector: "FMCG" }, { symbol: "TATACONSUM", sector: "FMCG" }, { symbol: "VBL", sector: "FMCG" },
  { symbol: "COLPAL", sector: "FMCG" },
  { symbol: "TATASTEEL", sector: "Metal" }, { symbol: "JSWSTEEL", sector: "Metal" }, { symbol: "HINDALCO", sector: "Metal" },
  { symbol: "VEDL", sector: "Metal" }, { symbol: "JINDALSTEL", sector: "Metal" }, { symbol: "SAIL", sector: "Metal" },
  { symbol: "NMDC", sector: "Metal" },
  { symbol: "LT", sector: "Infrastructure" }, { symbol: "ADANIENT", sector: "Infrastructure" }, { symbol: "ADANIPORTS", sector: "Infrastructure" },
  { symbol: "ULTRACEMCO", sector: "Cement" }, { symbol: "GRASIM", sector: "Cement" }, { symbol: "SHREECEM", sector: "Cement" },
  { symbol: "AMBUJACEM", sector: "Cement" }, { symbol: "ACC", sector: "Cement" },
  { symbol: "BHARTIARTL", sector: "Telecom" }, { symbol: "IDEA", sector: "Telecom" }, { symbol: "INDUSTOWER", sector: "Telecom" },
  { symbol: "ASIANPAINT", sector: "Consumer" }, { symbol: "BERGEPAINT", sector: "Consumer" }, { symbol: "TITAN", sector: "Consumer" },
  { symbol: "DMART", sector: "Consumer" }, { symbol: "TRENT", sector: "Consumer" }, { symbol: "PIDILITIND", sector: "Consumer" },
  { symbol: "HAVELLS", sector: "Consumer" }, { symbol: "DIXON", sector: "Consumer" },
  { symbol: "PIIND", sector: "Chemicals" }, { symbol: "SRF", sector: "Chemicals" }, { symbol: "UPL", sector: "Chemicals" },
  { symbol: "DLF", sector: "Realty" }, { symbol: "GODREJPROP", sector: "Realty" }, { symbol: "OBEROIRLTY", sector: "Realty" },
  { symbol: "IRCTC", sector: "Services" }, { symbol: "ZOMATO", sector: "Services" }, { symbol: "PAYTM", sector: "Services" },
  { symbol: "NAUKRI", sector: "Services" }, { symbol: "BEL", sector: "Defence" }, { symbol: "HAL", sector: "Defence" },
];

const SECTOR_BY_SYMBOL = new Map(NSE_UNIVERSE.map((u) => [u.symbol, u.sector]));

/** Map free-text / AI sector names onto the universe's canonical sector labels. */
const SECTOR_SYNONYMS: Record<string, string> = {
  technology: "it", tech: "it", software: "it", infotech: "it", "information technology": "it", it: "it",
  bank: "banking", banks: "banking", banking: "banking",
  finance: "finance", financial: "finance", financials: "finance", nbfc: "finance", "financial services": "finance",
  insurance: "insurance",
  pharma: "pharma", pharmaceutical: "pharma", pharmaceuticals: "pharma", healthcare: "pharma", health: "pharma",
  fmcg: "fmcg", "consumer staples": "fmcg", "consumer goods": "fmcg", staples: "fmcg",
  auto: "auto", automobile: "auto", automotive: "auto", autos: "auto",
  metal: "metal", metals: "metal", mining: "metal", steel: "metal",
  energy: "energy", oil: "energy", gas: "energy", "oil & gas": "energy", "oil and gas": "energy",
  power: "power", utility: "power", utilities: "power",
  telecom: "telecom", telecommunication: "telecom", telecommunications: "telecom",
  cement: "cement", realty: "realty", "real estate": "realty",
  infra: "infrastructure", infrastructure: "infrastructure",
  consumer: "consumer", chemical: "chemicals", chemicals: "chemicals",
  defence: "defence", defense: "defence", services: "services",
};

/** Resolve a free-text sector query to its canonical universe label (or "" if none). */
function normalizeSector(q: string): string {
  const s = (q || "").trim().toLowerCase();
  if (!s) return "";
  return SECTOR_SYNONYMS[s] || s;
}

// ---- Yahoo crumb + batch quote ----
let crumbCache: { crumb: string; cookie: string } | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache) return crumbCache;
  try {
    const r = await fetch("https://fc.yahoo.com", { headers: { "user-agent": DESKTOP_UA }, cache: "no-store" });
    const h = r.headers as Headers & { getSetCookie?: () => string[] };
    const cookie = (typeof h.getSetCookie === "function" ? h.getSetCookie() : [])
      .map((c) => c.split(";")[0].trim()).filter((c) => c.includes("=")).join("; ");
    const cr = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "user-agent": DESKTOP_UA, cookie }, cache: "no-store",
    });
    const crumb = (await cr.text()).trim();
    if (!crumb || crumb.length > 40) return null;
    crumbCache = { crumb, cookie };
    return crumbCache;
  } catch {
    return null;
  }
}

export interface UniverseQuote {
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
  high?: number;
  low?: number;
  volume: number;
  marketCap: number; // crore
  pe: number | null;
  dividendYield: number | null; // percent
}

/** Fetch live batch quotes from Yahoo v7 for the given base symbols (NSE). */
export async function getBatchQuotes(symbols: string[]): Promise<Map<string, UniverseQuote>> {
  const out = new Map<string, UniverseQuote>();
  const auth = await getCrumb();
  if (!auth) return out;

  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 50) batches.push(symbols.slice(i, i + 50));

  await Promise.all(
    batches.map(async (batch) => {
      const syms = batch.map((s) => `${s}.NS`).join(",");
      const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}&crumb=${encodeURIComponent(auth.crumb)}`;
      try {
        const res = await fetch(url, { headers: { "user-agent": DESKTOP_UA, cookie: auth.cookie }, cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const results: any[] = json?.quoteResponse?.result || [];
        for (const q of results) {
          const base = String(q.symbol || "").replace(/\.(NS|BO)$/i, "").toUpperCase();
          if (!base || q.regularMarketPrice == null) continue;
          out.set(base, {
            symbol: base,
            companyName: q.longName || q.shortName || base,
            price: round2(q.regularMarketPrice) ?? 0,
            change: round2(q.regularMarketChange) ?? 0,
            changePercent: round2(q.regularMarketChangePercent) ?? 0,
            high: round2(q.regularMarketDayHigh) ?? undefined,
            low: round2(q.regularMarketDayLow) ?? undefined,
            volume: Number(q.regularMarketVolume) || 0,
            marketCap: q.marketCap ? Math.round(q.marketCap / 1e7) : 0,
            pe: typeof q.trailingPE === "number" ? round2(q.trailingPE) : null,
            dividendYield: typeof q.trailingAnnualDividendYield === "number" ? round2(q.trailingAnnualDividendYield * 100) : null,
          });
        }
      } catch {
        /* skip batch */
      }
    })
  );
  return out;
}

export interface UniverseFilters {
  sector?: string;
  industry?: string;
  market_cap_min?: number;
  market_cap_max?: number;
  pe_min?: number;
  pe_max?: number;
  price_min?: number;
  price_max?: number;
  dividend_min?: number;
  volume_min?: number;
  limit?: number;
}

/** Screen the curated universe against live Yahoo quotes. Returns ScreenerResult[]. */
export async function screenUniverse(filters: UniverseFilters): Promise<ScreenerResult[]> {
  const sectorQ = normalizeSector(filters.sector || filters.industry || "");
  // If a sector filter is given, only quote that sector's symbols (faster + focused).
  const symbols = (sectorQ
    ? NSE_UNIVERSE.filter((u) => u.sector.toLowerCase() === sectorQ || u.sector.toLowerCase().includes(sectorQ))
    : NSE_UNIVERSE
  ).map((u) => u.symbol);

  const quotes = await getBatchQuotes(symbols.length ? symbols : NSE_UNIVERSE.map((u) => u.symbol));
  if (!quotes.size) return [];

  let rows: ScreenerResult[] = [];
  for (const [base, q] of quotes) {
    const sector = SECTOR_BY_SYMBOL.get(base) || "";
    rows.push({
      symbol: base,
      companyName: q.companyName,
      exchange: "NSE",
      marketCap: q.marketCap,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      volume: q.volume,
      sector,
      industry: sector,
      pe: q.pe,
      pb: null,
      roe: null,
      dividendYield: q.dividendYield,
      beta: null,
    });
  }

  const f = filters;
  if (f.price_min != null) rows = rows.filter((r) => r.price >= f.price_min!);
  if (f.price_max != null) rows = rows.filter((r) => r.price <= f.price_max!);
  if (f.volume_min != null) rows = rows.filter((r) => r.volume >= f.volume_min!);
  if (f.market_cap_min != null) rows = rows.filter((r) => r.marketCap >= f.market_cap_min!);
  if (f.market_cap_max != null) rows = rows.filter((r) => r.marketCap <= f.market_cap_max!);
  if (f.pe_min != null) rows = rows.filter((r) => r.pe != null && r.pe >= f.pe_min!);
  if (f.pe_max != null) rows = rows.filter((r) => r.pe != null && r.pe <= f.pe_max!);
  if (f.dividend_min != null) rows = rows.filter((r) => (r.dividendYield ?? 0) >= f.dividend_min!);
  if (sectorQ) rows = rows.filter((r) => r.sector.toLowerCase() === sectorQ || r.sector.toLowerCase().includes(sectorQ));

  rows.sort((a, b) => b.marketCap - a.marketCap);
  const limit = f.limit && f.limit > 0 ? Math.floor(f.limit) : 50;
  return rows.slice(0, limit);
}
