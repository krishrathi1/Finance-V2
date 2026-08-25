import { NextResponse } from "next/server";
import { getMarketOverview } from "@/server/market/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = getMarketOverview();
    return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/market/overview]", err);
    return NextResponse.json({ success: false, error: "Failed to load market overview" }, { status: 500 });
  }
}
