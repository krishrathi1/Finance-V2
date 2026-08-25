import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLiveQuote } from "@/server/market/engine";
import { findStock } from "@/server/market/universe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const holdings = await db.holding.findMany({ orderBy: { createdAt: "desc" } });
    const data = holdings.map((h) => {
      const q = getLiveQuote(h.symbol);
      const price = q?.price ?? h.buyPrice;
      const currentValue = price * h.quantity;
      const invested = h.buyPrice * h.quantity;
      return {
        id: h.id,
        symbol: h.symbol,
        companyName: h.companyName,
        quantity: h.quantity,
        buyPrice: h.buyPrice,
        buyDate: h.buyDate?.toISOString() ?? null,
        targetPrice: h.targetPrice,
        notes: h.notes,
        currentPrice: price,
        changePercent: q?.changePercent ?? null,
        currentValue,
        invested,
        pnl: currentValue - invested,
        pnlPercent: invested > 0 ? ((currentValue - invested) / invested) * 100 : 0,
      };
    });
    return NextResponse.json({ success: true, data, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/portfolio GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load portfolio" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").toUpperCase().trim();
    const stock = findStock(symbol);
    if (!stock) {
      return NextResponse.json({ success: false, error: "Unknown symbol" }, { status: 400 });
    }
    const quantity = Number(body.quantity);
    const buyPrice = Number(body.buyPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0) {
      return NextResponse.json({ success: false, error: "quantity and buyPrice must be positive numbers" }, { status: 400 });
    }
    const buyDate = body.buyDate ? new Date(body.buyDate) : null;
    const targetPrice = Number.isFinite(Number(body.targetPrice)) && Number(body.targetPrice) > 0 ? Number(body.targetPrice) : null;
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;

    const holding = await db.holding.create({
      data: {
        symbol,
        companyName: stock.n,
        quantity,
        buyPrice,
        buyDate: buyDate && !isNaN(buyDate.getTime()) ? buyDate : null,
        targetPrice,
        notes,
      },
    });
    return NextResponse.json({ success: true, data: holding });
  } catch (err) {
    console.error("[api/portfolio POST]", err);
    return NextResponse.json({ success: false, error: "Failed to add holding" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (Number.isFinite(Number(body.quantity)) && Number(body.quantity) > 0) data.quantity = Number(body.quantity);
    if (Number.isFinite(Number(body.buyPrice)) && Number(body.buyPrice) > 0) data.buyPrice = Number(body.buyPrice);
    if (Number.isFinite(Number(body.targetPrice))) data.targetPrice = Number(body.targetPrice) > 0 ? Number(body.targetPrice) : null;
    if (typeof body.notes === "string") data.notes = body.notes.slice(0, 500);
    if (body.buyDate) {
      const d = new Date(body.buyDate);
      if (!isNaN(d.getTime())) data.buyDate = d;
    }
    const holding = await db.holding.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: holding });
  } catch (err) {
    console.error("[api/portfolio PUT]", err);
    return NextResponse.json({ success: false, error: "Failed to update holding" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await db.holding.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/portfolio DELETE]", err);
    return NextResponse.json({ success: false, error: "Failed to remove holding" }, { status: 500 });
  }
}
