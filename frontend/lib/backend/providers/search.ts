/**
 * Symbol search via Yahoo Finance (keyless, covers the full NSE/BSE universe).
 * Used after the FMP search endpoint became unavailable (403) on the current key.
 */

import { getJson, DESKTOP_UA } from "@/lib/backend/http";

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
}

/** Search Indian equities by name/symbol. Returns up to `limit` hits, NSE preferred. */
export async function searchSymbols(query: string, limit = 15): Promise<SearchHit[]> {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`;
  const data = await getJson<any>(url, { timeoutMs: 6000, headers: { "user-agent": DESKTOP_UA } });
  const quotes: any[] = Array.isArray(data?.quotes) ? data.quotes : [];

  const byBase = new Map<string, SearchHit>();
  for (const item of quotes) {
    const sym: string = String(item?.symbol || "");
    if (!sym) continue;
    // Indian listings only: NSI (NSE) and BSE.
    const isNse = sym.endsWith(".NS") || item?.exchange === "NSI";
    const isBse = sym.endsWith(".BO") || item?.exchange === "BSE";
    if (!isNse && !isBse) continue;
    if (item?.quoteType && item.quoteType !== "EQUITY") continue;
    const base = sym.replace(/\.(NS|BO)$/i, "").toUpperCase();
    if (!base) continue;
    const hit: SearchHit = {
      symbol: base,
      name: String(item?.shortname || item?.longname || base),
      exchange: isNse ? "NSE" : "BSE",
    };
    const existing = byBase.get(base);
    // Prefer the NSE listing when both exist.
    if (!existing || (existing.exchange === "BSE" && hit.exchange === "NSE")) {
      byBase.set(base, hit);
    }
  }
  return Array.from(byBase.values()).slice(0, limit);
}
