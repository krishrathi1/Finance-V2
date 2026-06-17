import { NextResponse } from "next/server";

import { getMarketIndexOptions } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    data: getMarketIndexOptions(),
    updatedAt: new Date().toISOString(),
  });
}
