import { NextRequest, NextResponse } from "next/server";

import { getLiveTickerSnapshot } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MoodLevel = "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getMoodLevel(value: number): MoodLevel {
  if (value <= 20) return "Extreme Fear";
  if (value <= 40) return "Fear";
  if (value <= 60) return "Neutral";
  if (value <= 80) return "Greed";
  return "Extreme Greed";
}

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const snapshot = await getLiveTickerSnapshot(refresh);
    const rows = snapshot.rows.filter(
      (row) => Number.isFinite(row.changePercent) && Number.isFinite(row.cmp) && row.cmp > 0
    );

    if (!rows.length) {
      return NextResponse.json(
        {
          detail: "Live market mood data is unavailable",
          value: null,
          updatedAt: snapshot.updatedAt,
          source: snapshot.source,
          quoteSource: snapshot.quoteSource,
          universeCount: snapshot.universeCount,
          quotedCount: 0,
        },
        { status: 502 }
      );
    }

    const advancing = rows.filter((row) => row.changePercent > 0).length;
    const declining = rows.filter((row) => row.changePercent < 0).length;
    const unchanged = rows.length - advancing - declining;
    const averageChange = rows.reduce((sum, row) => sum + row.changePercent, 0) / rows.length;
    const breadthScore = ((advancing + unchanged * 0.5) / rows.length) * 100;
    const momentumScore = clamp(50 + averageChange * 15, 0, 100);
    const value = Math.round(clamp(breadthScore * 0.65 + momentumScore * 0.35, 0, 100));

    return NextResponse.json({
      value,
      level: getMoodLevel(value),
      updatedAt: snapshot.updatedAt,
      source: snapshot.source,
      quoteSource: snapshot.quoteSource,
      universeCount: snapshot.universeCount,
      quotedCount: rows.length,
      advancing,
      declining,
      unchanged,
      averageChange,
      breadthScore,
      momentumScore,
    });
  } catch (error) {
    console.error("Market mood API error:", error);
    return NextResponse.json(
      { detail: "Failed to fetch live market mood data", value: null },
      { status: 502 }
    );
  }
}
