import { NextRequest, NextResponse } from "next/server";
import { getChartSlice } from "@/server/market/engine";
import { getLiveQuote } from "@/server/market/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
    const range = req.nextUrl.searchParams.get("range") ?? "1M";
    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol is required" }, { status: 400 });
    }
    const history = getChartSlice(symbol, range);
    if (history.length === 0) {
      return NextResponse.json({ success: false, error: "Stock not found" }, { status: 404 });
    }
    const quote = getLiveQuote(symbol);
    return NextResponse.json({
      success: true,
      data: {
        symbol,
        range,
        history,
        livePrice: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/stocks/chart]", err);
    return NextResponse.json({ success: false, error: "Failed to load chart" }, { status: 500 });
  }
}
