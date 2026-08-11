import { buildDashboard } from "@/server/application/dashboard";
import { getSampleDashboard } from "@/server/domain/sample";
import { getFresh, getStale, setCache } from "@/server/infrastructure/cache";
import type { DashboardData } from "@/shared/types";

/**
 * Server-side dashboard resolution: cache lookup, single-flight build, and the
 * stale/sample fallback ladder.
 *
 * This exists so a Server Component can render a stock page without issuing an
 * HTTP request to *its own* API. That round trip looked harmless but made the
 * page depend on the app being reachable at `INTERNAL_API_BASE` from inside
 * itself, which fails in several ordinary situations:
 *
 *   - during `next build`, when nothing is listening yet, so prerendered pages
 *     bake "Unable to load stock details" into their static HTML;
 *   - whenever the app runs on a port other than the configured one;
 *   - in containers where the base URL isn't routable from within.
 *
 * Every one of those surfaces as an opaque `TypeError: fetch failed` on a page
 * whose data layer is working perfectly. Calling the builder directly removes
 * the class of failure entirely, and skips a needless serialize/parse cycle.
 *
 * The route handler shares this so the two paths can't drift in their caching
 * or fallback behaviour; the handler keeps what's genuinely HTTP-specific
 * (rate limiting, and deciding whether the caller may spend Gemini quota).
 */

export type DashboardEnvelope = {
  data: DashboardData;
  cached: boolean;
  stale: boolean;
  fallback: boolean;
  warning?: string;
};

export const DASHBOARD_FRESH_TTL_MS = 30_000;

/**
 * De-duplicates concurrent builds of the same key. Without it, a burst of
 * requests for one symbol (a crawler, or several page sections mounting at
 * once) each start their own provider fan-out.
 */
const inFlightBuilds = new Map<string, ReturnType<typeof buildDashboard>>();

export function dashboardCacheKey(symbol: string, timeframe: string, exchange: string): string {
  return `dashboard:${symbol.toUpperCase()}:${timeframe}:${exchange}`;
}

export async function loadDashboardEnvelope(
  symbol: string,
  options: {
    timeframe?: string;
    exchange?: string;
    /** Skip the fresh-cache read and rebuild from live providers. */
    refresh?: boolean;
    /** Gemini enrichment costs paid quota — callers opt in explicitly. */
    allowGemini?: boolean;
  } = {}
): Promise<DashboardEnvelope> {
  const timeframe = (options.timeframe || "5Y").toUpperCase();
  const exchange = (options.exchange || "NSE").trim().toUpperCase() || "NSE";
  const cacheKey = dashboardCacheKey(symbol, timeframe, exchange);

  if (!options.refresh) {
    const fresh = getFresh(cacheKey);
    if (fresh) return { data: fresh as DashboardData, cached: true, stale: false, fallback: false };
  }

  try {
    let build = inFlightBuilds.get(cacheKey);
    if (!build) {
      build = buildDashboard(symbol, {
        timeframe,
        exchange,
        allowGemini: Boolean(options.allowGemini),
      });
      inFlightBuilds.set(cacheKey, build);
      const clearBuild = () => {
        if (inFlightBuilds.get(cacheKey) === build) inFlightBuilds.delete(cacheKey);
      };
      void build.then(clearBuild, clearBuild);
    }
    const data = await build;
    setCache(cacheKey, data, DASHBOARD_FRESH_TTL_MS);
    return { data, cached: false, stale: false, fallback: false };
  } catch (error) {
    console.error(`[dashboard] build failed for ${symbol.toUpperCase()}:`, error);

    // Prefer genuinely stale real data over a placeholder — a price from a few
    // minutes ago is far more useful than sample numbers.
    const stale = getStale(cacheKey);
    if (stale) {
      return { data: stale as DashboardData, cached: true, stale: true, fallback: false };
    }

    const fallback = getSampleDashboard(symbol) as DashboardData & { timeframe?: string };
    fallback.timeframe = timeframe;
    return {
      data: fallback,
      cached: true,
      stale: true,
      fallback: true,
      warning:
        "Live dashboard data is temporarily unavailable. Showing a placeholder while we reconnect to market data.",
    };
  }
}
