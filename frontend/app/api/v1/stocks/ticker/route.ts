import { NextRequest, NextResponse } from "next/server";

import { getLiveTickerRows, getLiveTickerSnapshot } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const requestedSymbols = request.nextUrl.searchParams
      .get("symbols")
      ?.split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean) || [];

    const snapshot = requestedSymbols.length
      ? {
          rows: await getLiveTickerRows(requestedSymbols, { refresh }),
          universeCount: requestedSymbols.length,
          source: "requested",
          quoteSource: "provider",
          updatedAt: new Date().toISOString(),
        }
      : await getLiveTickerSnapshot(refresh);

    return NextResponse.json({
      data: snapshot.rows,
      updatedAt: snapshot.updatedAt,
      source: snapshot.source,
      quoteSource: snapshot.quoteSource,
      universeCount: snapshot.universeCount,
      quotedCount: snapshot.rows.length,
    });
  } catch (error) {
    console.error("Ticker API error:", error);
    return NextResponse.json(
      { detail: "Failed to fetch live ticker data", data: [] },
      { status: 502 }
    );
  }
}
