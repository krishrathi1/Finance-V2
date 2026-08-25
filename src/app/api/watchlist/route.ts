import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLiveQuote } from "@/server/market/engine";
import { findStock } from "@/server/market/universe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await db.watchlistItem.findMany({ orderBy: { createdAt: "desc" } });
    // decorate with live prices
    const data = items.map((item) => {
      const q = getLiveQuote(item.symbol);
      return {
        id: item.id,
        symbol: item.symbol,
        note: item.note,
        name: findStock(item.symbol)?.n ?? item.symbol,
        price: q?.price ?? null,
        changePercent: q?.changePercent ?? null,
      };
    });
    return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/watchlist GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load watchlist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").toUpperCase().trim();
    if (!symbol || !findStock(symbol)) {
      return NextResponse.json({ success: false, error: "Unknown symbol" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
    const item = await db.watchlistItem.upsert({
      where: { symbol },
      create: { symbol, note },
      update: { note },
    });
    return NextResponse.json({ success: true, data: item });
  } catch (err) {
    console.error("[api/watchlist POST]", err);
    return NextResponse.json({ success: false, error: "Failed to save watchlist item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
    if (!symbol) {
      return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
    }
    await db.watchlistItem.deleteMany({ where: { symbol } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/watchlist DELETE]", err);
    return NextResponse.json({ success: false, error: "Failed to remove watchlist item" }, { status: 500 });
  }
}
