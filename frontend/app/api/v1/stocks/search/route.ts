import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/backend/providers/search";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Stock search across the NSE/BSE universe, powered by Yahoo Finance search
 * (keyless, reliable). FMP search requires a paid plan on the current key.
 */
export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ results: [] });
    const results = await searchSymbols(q, 15);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ results: [] });
  }
}
