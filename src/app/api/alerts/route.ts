import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLiveQuote } from "@/server/market/engine";
import { findStock } from "@/server/market/universe";

export const dynamic = "force-dynamic";

/** GET evaluates armed alerts against live prices (server-authoritative sweep). */
export async function GET() {
  try {
    const alerts = await db.priceAlert.findMany({ orderBy: { createdAt: "desc" } });
    const symbols = [...new Set(alerts.map((a) => a.symbol))];
    const quotes = new Map(symbols.map((s) => [s, getLiveQuote(s)]));

    const triggered: string[] = [];
    const data = alerts.map((a) => {
      const q = quotes.get(a.symbol);
      let triggeredAt = a.triggeredAt;
      let triggeredPrice = a.triggeredPrice;
      let armed = a.armed;
      if (q && a.armed) {
        const crossed = a.condition === "above" ? q.price >= a.targetPrice : q.price <= a.targetPrice;
        // arm only on a genuine crossing: previous close must not already satisfy the condition
        const prevCrossed = a.condition === "above" ? q.prevClose >= a.targetPrice : q.prevClose <= a.targetPrice;
        if (crossed && !prevCrossed) {
          triggeredAt = new Date();
          triggeredPrice = q.price;
          armed = false;
          triggered.push(a.symbol);
        }
      }
      return {
        id: a.id,
        symbol: a.symbol,
        name: findStock(a.symbol)?.n ?? a.symbol,
        targetPrice: a.targetPrice,
        condition: a.condition,
        note: a.note,
        armed,
        triggeredAt: triggeredAt?.toISOString() ?? null,
        triggeredPrice,
        currentPrice: q?.price ?? null,
        currentChangePercent: q?.changePercent ?? null,
      };
    });

    // persist any newly triggered alerts
    if (triggered.length > 0) {
      await Promise.all(
        data
          .filter((d) => triggered.includes(d.symbol) && !d.armed)
          .map((d) =>
            db.priceAlert.update({
              where: { id: d.id },
              data: { armed: d.armed, triggeredAt: new Date(), triggeredPrice: d.triggeredPrice },
            })
          )
      );
    }

    return NextResponse.json({
      success: true,
      data,
      triggeredCount: triggered.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/alerts GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load alerts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol ?? "").toUpperCase().trim();
    if (!findStock(symbol)) {
      return NextResponse.json({ success: false, error: "Unknown symbol" }, { status: 400 });
    }
    const targetPrice = Number(body.targetPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ success: false, error: "targetPrice must be positive" }, { status: 400 });
    }
    const condition = body.condition === "below" ? "below" : "above";
    const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;

    const alert = await db.priceAlert.create({
      data: { symbol, targetPrice, condition, note },
    });
    return NextResponse.json({ success: true, data: alert });
  } catch (err) {
    console.error("[api/alerts POST]", err);
    return NextResponse.json({ success: false, error: "Failed to create alert" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await db.priceAlert.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/alerts DELETE]", err);
    return NextResponse.json({ success: false, error: "Failed to remove alert" }, { status: 500 });
  }
}
