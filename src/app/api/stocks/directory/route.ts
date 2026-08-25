import { NextRequest, NextResponse } from "next/server";
import { DIRECTORY, resolveStock } from "@/server/market/universe";
import { getLiveQuote } from "@/server/market/engine";

export const dynamic = "force-dynamic";

/** Grouping letter of a symbol: A–Z, or "#" when it starts with a digit. */
function letterOf(symbol: string): string {
  const c = symbol[0]?.toUpperCase() ?? "#";
  return /^[A-Z]$/.test(c) ? c : "#";
}

const LETTERS = new Set([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"]);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const exchange = (sp.get("exchange") ?? "ALL").toUpperCase(); // NSE | BSE | ALL
    const sector = (sp.get("sector") ?? "").trim();
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "60", 10) || 60, 1), 200);
    const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
    const letterParam = (sp.get("letter") ?? "A").toUpperCase();

    // While searching, the letter filter is bypassed (search spans A–Z).
    const searching = q.length > 0;
    const letter = LETTERS.has(letterParam) ? letterParam : "A";

    // Base filter: exchange + sector + query
    const filtered = DIRECTORY.filter((e) => {
      if (exchange === "NSE" && e.ex !== "NSE") return false;
      if (exchange === "BSE" && e.ex !== "BSE") return false;
      if (sector && e.sec !== sector) return false;
      if (q && !(e.s.toLowerCase().includes(q) || e.n.toLowerCase().includes(q))) return false;
      return true;
    });

    // Per-letter counts for the A–Z rail (honours exchange/sector/q filters)
    const letterCounts: Record<string, number> = {};
    for (const e of filtered) {
      const L = letterOf(e.s);
      letterCounts[L] = (letterCounts[L] ?? 0) + 1;
    }

    // Selection: search results across all letters, or one letter bucket
    const selected = searching ? filtered : filtered.filter((e) => letterOf(e.s) === letter);

    const exchangeCounts = { NSE: 0, BSE: 0, total: selected.length };
    for (const e of selected) exchangeCounts[e.ex]++;

    // Sector list for the current exchange (stable dropdown options)
    const sectors = [...new Set(
      DIRECTORY.filter((e) => exchange === "ALL" || e.ex === exchange).map((e) => e.sec)
    )].sort();

    const sorted = [...selected].sort((a, b) => a.s.localeCompare(b.s));
    const total = sorted.length;
    const page = sorted.slice(offset, offset + limit);

    // Live quotes are computed only for the requested page (series are cached
    // per symbol per day, so paging through letters stays fast).
    const rows = page.map((e) => {
      const seed = resolveStock(e.s);
      const quote = seed ? getLiveQuote(e.s) : null;
      return {
        symbol: e.s,
        name: e.n,
        sector: e.sec,
        exchange: e.ex,
        price: quote?.price ?? seed?.p ?? 0,
        change: quote?.change ?? 0,
        changePercent: quote?.changePercent ?? 0,
        marketCapCr: seed?.mc ?? 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: { rows, total, letterCounts, exchangeCounts, sectors },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/stocks/directory]", err);
    return NextResponse.json({ success: false, error: "Failed to load directory" }, { status: 500 });
  }
}
