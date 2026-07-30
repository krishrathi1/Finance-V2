import { NextRequest, NextResponse } from "next/server";

import { watchlistDigest } from "@/server/ai/features";
import { getNseQuote } from "@/server/infrastructure/providers/nse";
import { requireActiveUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SYMBOLS = 20;

export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const listName = typeof body?.listName === "string" && body.listName.trim() ? body.listName.trim() : "My Watchlist";
  const rawSymbols: string[] = Array.isArray(body?.symbols)
    ? body.symbols.map((s: unknown) => String(s ?? "").trim().toUpperCase()).filter(Boolean)
    : [];
  const symbols: string[] = Array.from(new Set(rawSymbols)).slice(0, MAX_SYMBOLS);

  try {
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const quote = await getNseQuote(symbol);
          return quote ? { symbol, quote } : null;
        } catch {
          return null;
        }
      }),
    );

    const entries = quotes
      .filter((q): q is { symbol: string; quote: NonNullable<Awaited<ReturnType<typeof getNseQuote>>> } => q !== null)
      .map(({ symbol, quote }) => ({
        symbol,
        companyName: quote.companyName,
        cmp: quote.cmp,
        changePercent: quote.changePercent,
        peRatio: quote.peRatio,
      }));

    const result = await watchlistDigest(listName, entries);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Watchlist digest error:", error);
    return NextResponse.json({
      headline: "AI digest is unavailable right now.",
      movers: [],
      themes: [],
      focusList: [],
      summary: "Try again in a moment.",
      source: "fallback",
    });
  }
}
