import { NextResponse } from "next/server";

import { getMarketIndexOptions } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  try {
    return NextResponse.json({
      data: await getMarketIndexOptions(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Index options error:", error);
    return NextResponse.json({ data: [], updatedAt: new Date().toISOString() });
  }
}
