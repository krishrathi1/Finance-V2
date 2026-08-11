import { NextRequest, NextResponse } from "next/server";
import { loadDashboardEnvelope } from "@/server/application/dashboard-envelope";
import { getCurrentUser } from "@/lib/current-user";
import { rateLimit, clientIpFromHeaders } from "@/server/infrastructure/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * HTTP surface for the stock dashboard.
 *
 * Caching, single-flight and the stale/sample fallback ladder live in
 * `loadDashboardEnvelope`, shared with the server-rendered stock page so both
 * behave identically. What stays here is what only makes sense for an
 * untrusted HTTP caller: rate limiting, and gating paid Gemini enrichment on a
 * real session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sp = request.nextUrl.searchParams;
  const timeframe = (sp.get("timeframe") || "5Y").toUpperCase();
  const exchange = (sp.get("exchange") || "NSE").trim().toUpperCase() || "NSE";
  const refresh = sp.get("refresh") === "true";

  if (refresh) {
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
  // unauthenticated query parameter. `refresh=true` alone doesn't enable it;
  // the caller must also be a logged-in (non-banned) user.
  const user = refresh ? await getCurrentUser(request) : null;
  const allowGemini = refresh && Boolean(user);

  const envelope = await loadDashboardEnvelope(symbol, {
    timeframe,
    exchange,
    refresh,
    allowGemini,
  });

  return NextResponse.json({
    cached: envelope.cached,
    data: envelope.data,
    ...(envelope.stale ? { stale: true } : {}),
    ...(envelope.fallback ? { fallback: true } : {}),
    ...(envelope.warning ? { warning: envelope.warning } : {}),
  });
}
