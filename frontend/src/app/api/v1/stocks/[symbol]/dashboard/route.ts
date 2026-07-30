import { NextRequest, NextResponse } from "next/server";
import { buildDashboard } from "@/server/application/dashboard";
import { getSampleDashboard } from "@/server/domain/sample";
import { getFresh, getStale, setCache } from "@/server/infrastructure/cache";
import { getCurrentUser } from "@/lib/current-user";
import { rateLimit, clientIpFromHeaders } from "@/server/infrastructure/rate-limit";

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
  } else {
    // refresh=true forces a full live-provider rebuild, bypassing the 30s
    // cache — and since every distinct symbol is its own cache key, per-key
    // limits don't bound abuse. Rate-limit by IP instead.
    const ip = clientIpFromHeaders(request.headers);
    const limited = await rateLimit(`dashboard-refresh:${ip}`, 20, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { detail: "Too many refresh requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
      );
    }
  }

  // Gemini enrichment hits paid LLM quota — never derive that from a public,
  // unauthenticated query parameter. `refresh=true` alone no longer enables
  // it; the caller must also be a logged-in (non-banned) user.
  const user = refresh ? await getCurrentUser(request) : null;
  const allowGemini = refresh && Boolean(user);

  try {
    let build = inFlightBuilds.get(cacheKey);
    if (!build) {
      build = buildDashboard(symbol, { timeframe, exchange, allowGemini });
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
