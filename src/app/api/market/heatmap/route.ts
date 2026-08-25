import { NextRequest, NextResponse } from "next/server";
import { getHeatmapForIndex } from "@/server/market/overview";
import { INDEX_NAMES } from "@/server/market/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const index = req.nextUrl.searchParams.get("index") ?? "NIFTY50";
    const data = getHeatmapForIndex(index);
    return NextResponse.json({
      success: true,
      data: { ...data, indexName: INDEX_NAMES[index] ?? index },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/market/heatmap]", err);
    return NextResponse.json({ success: false, error: "Failed to load heatmap" }, { status: 500 });
  }
}
