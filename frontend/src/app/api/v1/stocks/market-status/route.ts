import { NextResponse } from "next/server";

import { getNseMarketStatus } from "@/server/infrastructure/providers/nse";
import { getIndianMarketStatus, type ExchangeMarketSnapshot } from "@/shared/market-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getNseMarketStatus();
    if (status) {
      return NextResponse.json(status, {
        headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
      });
    }
  } catch (error) {
    console.error("Live market status unavailable from NSE provider:", error);
  }

  // Gracefully fallback to calendar/time-based IST market status (never return 503)
  const scheduled = getIndianMarketStatus();
  const fallbackSnapshot: ExchangeMarketSnapshot = {
    capitalMarketOpen: scheduled.isOpen,
    anyMarketOpen: scheduled.isOpen,
    openMarkets: scheduled.isOpen ? ["Capital Market"] : [],
  };

  return NextResponse.json(fallbackSnapshot, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}