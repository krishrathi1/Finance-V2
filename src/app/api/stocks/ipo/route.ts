import { NextRequest, NextResponse } from "next/server";
import { getIpoData } from "@/server/market/ipo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") === "recent" ? "recent" : "upcoming";
    const data = getIpoData(type);
    return NextResponse.json({ success: true, data: { items: data, type }, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/stocks/ipo]", err);
    return NextResponse.json({ success: false, error: "Failed to load IPO data" }, { status: 500 });
  }
}
