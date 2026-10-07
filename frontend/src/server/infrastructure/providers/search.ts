/**
 * Symbol search via Yahoo Finance + local BSE directory (covers full NSE/BSE universe).
 */

import { getJson, DESKTOP_UA } from "@/server/infrastructure/http";
import { searchLocalBseStocks } from "@/server/infrastructure/providers/bse-data";

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
}

/** Search Indian equities by name, symbol, or BSE scrip code. Returns up to `limit` hits. */
export async function searchSymbols(query: string, limit = 15): Promise<SearchHit[]> {
  const q = String(query || "").trim();
  if (!q) return [];

  // Local BSE matches (scrip codes like 500325, company names, or symbols)
  const localBseHits = searchLocalBseStocks(q, 6);

  const cleanQuery = q.replace(/\s+(bse|nse)$/i, "").trim();
  const requestedExchange = /\bbse\b/i.test(q) ? "BSE" : /\bnse\b/i.test(q) ? "NSE" : null;

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery || q)}&quotesCount=25&newsCount=0&listsCount=0`;
  const data = await getJson<any>(url, { timeoutMs: 6000, headers: { "user-agent": DESKTOP_UA } }).catch(() => null);
  const quotes: any[] = Array.isArray(data?.quotes) ? data.quotes : [];

  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  // If user typed a numeric scrip code or specified BSE, prioritize local BSE hits
  if (/^\d+$/.test(q) || requestedExchange === "BSE") {
    for (const bseHit of localBseHits) {
      const key = `${bseHit.symbol}:BSE`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push(bseHit);
      }
    }
  }

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

    const exchange = isNse ? "NSE" : "BSE";
    if (requestedExchange && exchange !== requestedExchange) continue;

    const key = `${base}:${exchange}`;
    if (seen.has(key)) continue;
    seen.add(key);

    hits.push({
      symbol: base,
      name: String(item?.shortname || item?.longname || base),
      exchange,
    });
  }

  // Also include remaining local BSE hits if space permits and exchange matches
  if (!requestedExchange || requestedExchange === "BSE") {
    for (const bseHit of localBseHits) {
      const key = `${bseHit.symbol}:BSE`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push(bseHit);
      }
    }
  }

  return hits.slice(0, limit);
}
