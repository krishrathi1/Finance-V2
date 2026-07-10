import { NextRequest, NextResponse } from "next/server";
import { parseScreenerQuery } from "@/lib/backend/ai/features";
import { toFloat } from "@/lib/backend/http";
import { screenUniverse, type UniverseFilters } from "@/lib/backend/providers/universe";
import { requireActiveUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toFilters(parsed: Record<string, unknown>): UniverseFilters {
  const n = (v: unknown) => {
    const f = toFloat(v);
    return f === null ? undefined : f;
  };
  return {
    sector: typeof parsed.sector === "string" && parsed.sector ? String(parsed.sector) : undefined,
    industry: typeof parsed.industry === "string" && parsed.industry ? String(parsed.industry) : undefined,
    market_cap_min: n(parsed.market_cap_min),
    market_cap_max: n(parsed.market_cap_max),
    pe_min: n(parsed.pe_min),
    pe_max: n(parsed.pe_max),
    price_min: n(parsed.price_min),
    price_max: n(parsed.price_max),
    dividend_min: n(parsed.dividend_min),
    volume_min: n(parsed.volume_min),
    limit: n(parsed.limit),
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    if (!query) return NextResponse.json({ results: [], parsedFilters: {} });

    const parsed = await parseScreenerQuery(query);
    const parsedFilters = (parsed?.filters && typeof parsed.filters === "object" ? parsed.filters : {}) as Record<string, unknown>;
    const results = await screenUniverse(toFilters(parsedFilters));
    return NextResponse.json({ results, parsedFilters });
  } catch (error) {
    console.error("AI screener error:", error);
    return NextResponse.json({ results: [], parsedFilters: {} });
  }
}
