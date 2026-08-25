import { NextRequest, NextResponse } from "next/server";
import { UNIVERSE } from "@/server/market/universe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 1) {
      return NextResponse.json({ success: true, data: [], updatedAt: new Date().toISOString() });
    }
    const results = UNIVERSE.filter(
      (s) => s.s.toLowerCase().includes(q) || s.n.toLowerCase().includes(q)
    )
      .sort((a, b) => {
        const aStarts = a.s.toLowerCase().startsWith(q);
        const bStarts = b.s.toLowerCase().startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return b.mc - a.mc;
      })
      .slice(0, 12)
      .map((s) => ({ symbol: s.s, name: s.n, sector: s.sec, exchange: "NSE" }));
    return NextResponse.json({ success: true, data: results, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/stocks/search]", err);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
