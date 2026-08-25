import { NextRequest, NextResponse } from "next/server";
import { getScreenerRows } from "@/server/analytics/dashboard";
import { SECTORS } from "@/server/market/universe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sector = sp.get("sector") ?? "";
    const search = (sp.get("q") ?? "").toLowerCase();
    const minMcap = numOrNull(sp.get("minMcap"));
    const maxMcap = numOrNull(sp.get("maxMcap"));
    const minPe = numOrNull(sp.get("minPe"));
    const maxPe = numOrNull(sp.get("maxPe"));
    const minPrice = numOrNull(sp.get("minPrice"));
    const maxPrice = numOrNull(sp.get("maxPrice"));
    const minDy = numOrNull(sp.get("minDy"));
    const minRoe = numOrNull(sp.get("minRoe"));
    const sortKey = sp.get("sort") ?? "marketCapCr";
    const sortDir = sp.get("dir") === "asc" ? 1 : -1;
    const limit = Math.min(200, Math.max(10, Number(sp.get("limit") ?? 100)));
    const preset = sp.get("preset") ?? "";

    let rows = getScreenerRows();

    // Expert presets
    if (preset === "volume-shockers") rows = rows.filter((r) => r.changePercent > 3);
    if (preset === "high52") rows = rows.filter((r) => r.changePercent > 1.5 && r.riskScore < 3.5);
    if (preset === "clean-forensics") rows = rows.filter((r) => r.smartScore >= 3.5 && r.riskScore <= 2.5);
    if (preset === "dividend") rows = rows.filter((r) => r.dividendYield >= 2.5);
    if (preset === "value-growth") rows = rows.filter((r) => r.pe !== null && r.pe < 25 && r.profitGrowth > 15);
    if (preset === "debt-free") rows = rows.filter((r) => r.sector === "Technology" && r.profitGrowth > 10);
    if (preset === "quality-large") rows = rows.filter((r) => r.marketCapCr > 200000 && r.roe > 18);

    if (sector) rows = rows.filter((r) => r.sector === sector);
    if (search) rows = rows.filter((r) => r.symbol.toLowerCase().includes(search) || r.name.toLowerCase().includes(search));
    if (minMcap !== null) rows = rows.filter((r) => r.marketCapCr >= minMcap);
    if (maxMcap !== null) rows = rows.filter((r) => r.marketCapCr <= maxMcap);
    if (minPe !== null) rows = rows.filter((r) => r.pe !== null && r.pe >= minPe);
    if (maxPe !== null) rows = rows.filter((r) => r.pe !== null && r.pe <= maxPe);
    if (minPrice !== null) rows = rows.filter((r) => r.price >= minPrice);
    if (maxPrice !== null) rows = rows.filter((r) => r.price <= maxPrice);
    if (minDy !== null) rows = rows.filter((r) => r.dividendYield >= minDy);
    if (minRoe !== null) rows = rows.filter((r) => r.roe >= minRoe);

    rows = [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, number | null>)[sortKey];
      const bv = (b as unknown as Record<string, number | null>)[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * sortDir;
      return (av - bv) * sortDir;
    });

    return NextResponse.json({
      success: true,
      data: {
        results: rows.slice(0, limit),
        count: rows.length,
        sectors: SECTORS,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/stocks/screener]", err);
    return NextResponse.json({ success: false, error: "Screener failed" }, { status: 500 });
  }
}

function numOrNull(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
