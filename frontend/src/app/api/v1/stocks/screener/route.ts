import { NextRequest, NextResponse } from "next/server";
import { toFloat } from "@/server/infrastructure/http";
import { screenUniverse, type UniverseFilters } from "@/server/infrastructure/providers/universe";
import { parseScreenerQuery, matchesQuery } from "@/server/application/screener-query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const n = (k: string) => toFloat(sp.get(k)) ?? undefined;
    const filters: UniverseFilters = {
      sector: sp.get("sector") || undefined,
      industry: sp.get("industry") || undefined,
      market_cap_min: n("market_cap_min"),
      market_cap_max: n("market_cap_max"),
      pe_min: n("pe_min"),
      pe_max: n("pe_max"),
      price_min: n("price_min"),
      price_max: n("price_max"),
      dividend_min: n("dividend_min"),
      volume_min: n("volume_min"),
      limit: n("limit"),
    };
    // Free-text custom query (Screener.in style), applied after the coarse
    // provider-side filters. `unparsed` is returned rather than swallowed so the
    // UI can say which fragment was ignored instead of implying a stricter
    // screen than actually ran.
    const { clauses, unparsed } = parseScreenerQuery(sp.get("query") || "");
    const screened = await screenUniverse(filters);
    const results = clauses.length
      ? screened.filter((row) => matchesQuery(row as unknown as Record<string, unknown>, clauses))
      : screened;

    return NextResponse.json({
      results,
      count: results.length,
      cached: false,
      query: { clauses, unparsed, matched: results.length, scanned: screened.length },
    });
  } catch (error) {
    console.error("Screener error:", error);
    return NextResponse.json({ results: [], count: 0 });
  }
}
