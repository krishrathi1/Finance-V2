import { NextRequest, NextResponse } from "next/server";
import { toFloat } from "@/lib/backend/http";
import { screenUniverse, type UniverseFilters } from "@/lib/backend/providers/universe";

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
    const results = await screenUniverse(filters);
    return NextResponse.json({ results, count: results.length, cached: false });
  } catch (error) {
    console.error("Screener error:", error);
    return NextResponse.json({ results: [], count: 0 });
  }
}
