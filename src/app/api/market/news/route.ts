import { NextRequest, NextResponse } from "next/server";
import { getMarketNews } from "@/server/market/news";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const count = Number(req.nextUrl.searchParams.get("count") ?? 18);
    const data = getMarketNews(Math.min(30, Math.max(6, count)));
    return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/market/news]", err);
    return NextResponse.json({ success: false, error: "Failed to load news" }, { status: 500 });
  }
}
