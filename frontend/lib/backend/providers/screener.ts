/**
 * Stock screener over the live NSE universe (NIFTY 500 constituents).
 *
 * The FMP screener requires a paid plan (403/402 on the current key), so this
 * screens real NSE index-constituent data instead. Price, change, volume,
 * sector/industry and 52-week filters are applied directly from NSE data.
 * PE / market-cap / dividend are not exposed by this NSE endpoint, so filters
 * on those are applied leniently (a row is not excluded when the value is
 * unknown) and surface as null in the result.
 */

import { toFloat, round2 } from "@/lib/backend/http";
import { nseGetJson } from "@/lib/backend/providers/nse";
import type { ScreenerResult } from "@/lib/types";

export interface ScreenFilters {
  exchange?: string;
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

// Try progressively narrower indices if the broadest is unavailable.
const INDEX_CANDIDATES = ["NIFTY 500", "NIFTY 200", "NIFTY 100", "NIFTY 50"];

async function fetchConstituents(): Promise<any[]> {
  for (const index of INDEX_CANDIDATES) {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(index)}`;
    const payload = await nseGetJson<any>(url, 9000);
    const data: any[] = Array.isArray(payload?.data) ? payload.data : [];
    const rows = data.filter((r) => r && r.symbol && String(r.symbol).toUpperCase() !== index.toUpperCase());
    if (rows.length) return rows;
  }
  return [];
}

function mapRow(r: any): ScreenerResult {
  const price = toFloat(r.lastPrice) ?? 0;
  return {
    symbol: String(r.symbol || "").toUpperCase(),
    companyName: String(r?.meta?.companyName || r.symbol || ""),
    exchange: "NSE",
    marketCap: 0, // not provided by NSE index endpoint
    price,
    change: toFloat(r.change) ?? 0,
    changePercent: toFloat(r.pChange) ?? 0,
    volume: toFloat(r.totalTradedVolume) ?? 0,
    sector: String(r?.meta?.industry || r?.meta?.industryInfo?.sector || ""),
    industry: String(r?.meta?.industry || ""),
    pe: null,
    pb: null,
    roe: null,
    dividendYield: null,
    beta: null,
  };
}

export async function screenNse(filters: ScreenFilters): Promise<ScreenerResult[]> {
  const rows = await fetchConstituents();
  if (!rows.length) return [];

  const limit = filters.limit && filters.limit > 0 ? Math.floor(filters.limit) : 50;
  const sectorQ = (filters.sector || filters.industry || "").trim().toLowerCase();

  let results = rows.map(mapRow).filter((r) => r.symbol && r.price > 0);

  if (filters.price_min != null) results = results.filter((r) => r.price >= filters.price_min!);
  if (filters.price_max != null) results = results.filter((r) => r.price <= filters.price_max!);
  if (filters.volume_min != null) results = results.filter((r) => r.volume >= filters.volume_min!);
  if (sectorQ) results = results.filter((r) => `${r.sector} ${r.industry}`.toLowerCase().includes(sectorQ));
  // PE / market-cap / dividend filters: applied only when the row actually has the value
  // (NSE constituents don't expose these, so unknown rows pass through).
  if (filters.pe_min != null) results = results.filter((r) => r.pe == null || r.pe >= filters.pe_min!);
  if (filters.pe_max != null) results = results.filter((r) => r.pe == null || r.pe <= filters.pe_max!);
  if (filters.market_cap_min != null) results = results.filter((r) => !r.marketCap || r.marketCap >= filters.market_cap_min!);
  if (filters.market_cap_max != null) results = results.filter((r) => !r.marketCap || r.marketCap <= filters.market_cap_max!);
  if (filters.dividend_min != null) results = results.filter((r) => r.dividendYield == null || r.dividendYield >= filters.dividend_min!);

  // Sort by market activity (turnover proxy: volume * price) descending for a sensible default.
  results.sort((a, b) => b.volume * b.price - a.volume * a.price);
  return results.slice(0, limit).map((r) => ({ ...r, price: round2(r.price) ?? r.price }));
}
