import { NextRequest, NextResponse } from "next/server";
import { DIRECTORY, resolveStock } from "@/server/market/universe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 1) {
      return NextResponse.json({ success: true, data: [], updatedAt: new Date().toISOString() });
    }

    // Search across the full NSE + BSE directory (curated + extended entries).
    // Rank: symbol/name starts-with first, then larger market caps.
    const matches = DIRECTORY.filter(
      (e) => e.s.toLowerCase().includes(q) || e.n.toLowerCase().includes(q)
    )
      .map((e) => {
        const seed = resolveStock(e.s);
        return {
          symbol: e.s,
          name: e.n,
          sector: e.sec,
          exchange: e.ex,
          mc: seed?.mc ?? 0,
          starts: e.s.toLowerCase().startsWith(q) || e.n.toLowerCase().startsWith(q),
        };
      })
      .sort((a, b) => {
        if (a.starts !== b.starts) return a.starts ? -1 : 1;
        return b.mc - a.mc;
      })
      .slice(0, 12)
      .map(({ mc: _mc, starts: _starts, ...rest }) => rest);

    return NextResponse.json({ success: true, data: matches, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/stocks/search]", err);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
