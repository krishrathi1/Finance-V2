import { NextRequest, NextResponse } from "next/server";
import { searchFmp } from "@/lib/backend/providers/fmp";
import { DESKTOP_UA } from "@/lib/backend/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SearchRow = { symbol: string; name: string; exchange: string };

const NSE_HEADERS: Record<string, string> = {
  "user-agent": DESKTOP_UA,
  "accept-language": "en-US,en;q=0.9",
  accept: "application/json, text/plain, */*",
  referer: "https://www.nseindia.com/",
  "x-requested-with": "XMLHttpRequest",
};

/** Strip the .NS/.BO exchange suffix from a displayed symbol. */
function stripSuffix(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "");
}

/**
 * NSE autocomplete search via the cookie-primed pattern. The cookie-primed
 * nseProvider in "@/lib/providers/nse" does not expose a search helper, so we
 * replicate the priming (hit the homepage to obtain cookies, then call the
 * autocomplete endpoint with those cookies). Returns [] on any failure.
 */
async function searchNse(query: string): Promise<SearchRow[]> {
  const q = String(query || "").trim();
  if (!q) return [];
  try {
    // Prime cookies from the NSE homepage.
    const home = await fetch("https://www.nseindia.com", {
      headers: NSE_HEADERS,
      cache: "no-store",
    });
    const cookies = home.headers.get("set-cookie") || "";

    const url = `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { ...NSE_HEADERS, Cookie: cookies },
      cache: "no-store",
    });
    if (!res.ok) return [];

    const payload = await res.json().catch(() => null);
    const symbols: any[] = Array.isArray(payload?.symbols) ? payload.symbols : [];

    return symbols
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        symbol: stripSuffix(String(item.symbol || "")),
        name: String(item.symbol_info || item.symbol || ""),
        exchange: "NSE",
      }))
      .filter((row: SearchRow) => Boolean(row.symbol));
  } catch (err) {
    console.warn(`[search] searchNse failed: ${String(err)}`);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ results: [] });
    }

    // FMP is the primary source; NSE autocomplete supplements/broadens coverage.
    const [fmpRows, nseRows] = await Promise.all([
      searchFmp(q).catch(() => [] as SearchRow[]),
      searchNse(q).catch(() => [] as SearchRow[]),
    ]);

    const merged: SearchRow[] = [];
    const seen = new Set<string>();

    // FMP first (primary), then NSE — dedupe by base symbol.
    for (const row of [...fmpRows, ...nseRows]) {
      const symbol = stripSuffix(String(row.symbol || ""));
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      merged.push({
        symbol,
        name: String(row.name || symbol),
        exchange: String(row.exchange || "NSE") || "NSE",
      });
      if (merged.length >= 15) break;
    }

    return NextResponse.json({ results: merged });
  } catch (error) {
    console.error("Search error:", error);
    // Golden rule: never 500 — return an empty but valid payload.
    return NextResponse.json({ results: [] });
  }
}
