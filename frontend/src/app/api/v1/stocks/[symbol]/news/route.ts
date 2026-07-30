import { NextRequest, NextResponse } from "next/server";
import { baseSymbol } from "@/server/infrastructure/http";
import { getGoogleNews } from "@/server/infrastructure/providers/news-rss";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Per-symbol news via Google News RSS (keyless, reliable). NewsAPI's free tier
 * is rate-limited (429), so RSS is the primary source here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = baseSymbol(symbol);
  const company = request.nextUrl.searchParams.get("company")?.trim();
  const timestamp = new Date().toISOString();

  try {
    const items = await getGoogleNews(`${company || sym} stock`, 12);
    const data = items.map((n) => ({ ...n, imageUrl: null }));
    return NextResponse.json({ data, symbol: sym.toUpperCase(), timestamp });
  } catch (error) {
    console.error("[stock news] route error:", error);
    return NextResponse.json({ data: [], symbol: sym.toUpperCase(), timestamp });
  }
}
