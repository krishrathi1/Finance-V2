import { NextRequest, NextResponse } from "next/server";
import { buildDashboard } from "@/lib/backend/dashboard";
import { getSampleDashboard } from "@/lib/backend/sample";
import { getFresh, getStale, setCache } from "@/lib/backend/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FRESH_TTL_MS = 30_000;
const inFlightBuilds = new Map<string, ReturnType<typeof buildDashboard>>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sp = request.nextUrl.searchParams;
  const timeframe = (sp.get("timeframe") || "5Y").toUpperCase();
  const exchange = (sp.get("exchange") || "NSE").trim().toUpperCase() || "NSE";
  const refresh = sp.get("refresh") === "true";

  const sym = symbol.toUpperCase();
  const cacheKey = `dashboard:${sym}:${timeframe}:${exchange}`;

  if (!refresh) {
    const fresh = getFresh(cacheKey);
    if (fresh) return NextResponse.json({ cached: true, data: fresh });
  }

  try {
    let build = inFlightBuilds.get(cacheKey);
    if (!build) {
      build = buildDashboard(symbol, { timeframe, exchange, allowGemini: refresh });
      inFlightBuilds.set(cacheKey, build);
      const clearBuild = () => {
        if (inFlightBuilds.get(cacheKey) === build) inFlightBuilds.delete(cacheKey);
      };
      void build.then(clearBuild, clearBuild);
    }
    const data = await build;
    setCache(cacheKey, data, FRESH_TTL_MS);
    return NextResponse.json({ cached: false, data });
  } catch (error) {
    console.error(`[dashboard] build failed for ${sym}:`, error);
    const stale = getStale(cacheKey);
    if (stale) {
      return NextResponse.json({ cached: true, stale: true, data: stale });
    }
    const fallback = getSampleDashboard(symbol);
    (fallback as any).timeframe = timeframe;
    return NextResponse.json({
      cached: true,
      stale: true,
      fallback: true,
      warning: "Live dashboard data is temporarily unavailable. Showing a placeholder while we reconnect to market data.",
      data: fallback,
    });
  }
}
