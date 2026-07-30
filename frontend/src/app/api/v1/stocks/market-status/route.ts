import { NextResponse } from "next/server";

import { getNseMarketStatus } from "@/server/infrastructure/providers/nse";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getNseMarketStatus();
  if (!status) {
    return NextResponse.json({ detail: "Live market status unavailable." }, { status: 503 });
  }
  return NextResponse.json(status, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}