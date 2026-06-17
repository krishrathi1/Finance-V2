import { NextRequest, NextResponse } from "next/server";

import { getLiveIndexHeatmap } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const indexName = request.nextUrl.searchParams.get("index") || "NIFTY 50";
    const payload = await getLiveIndexHeatmap(indexName);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Index heatmap error:", error);
    return NextResponse.json(
      {
        indexName: "NIFTY 50",
        updatedAt: new Date().toISOString(),
        rows: [],
        source: "error",
        constituentCount: 0,
      },
      { status: 502 }
    );
  }
}
