import { NextRequest, NextResponse } from "next/server";
import { getTicker } from "@/server/market/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const symbolsParam = req.nextUrl.searchParams.get("symbols");
    const symbols = symbolsParam ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
    const data = getTicker(symbols);
    return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/market/ticker]", err);
    return NextResponse.json({ success: false, error: "Failed to load ticker" }, { status: 500 });
  }
}
