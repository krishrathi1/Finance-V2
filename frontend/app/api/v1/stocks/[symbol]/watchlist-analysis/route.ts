import { NextRequest, NextResponse } from 'next/server';
import { watchlistAnalysis } from '@/lib/backend/ai/features';
import { getNseQuote } from '@/lib/backend/providers/nse';
import { requireActiveUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  const { symbol } = await params;

  try {
    // Light context: company name / P/E from a single NSE quote.
    const context: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    try {
      const quote = await getNseQuote(symbol);
      if (quote) {
        if (quote.companyName) context.companyName = quote.companyName;
        if (quote.peRatio !== null && quote.peRatio !== undefined) {
          context.metrics = { peRatio: quote.peRatio };
        }
      }
    } catch {
      // Ignore context-gathering failures.
    }

    const result = await watchlistAnalysis(symbol, context);

    return NextResponse.json({
      answer: result.answer,
      source: result.source,
    });
  } catch (error) {
    console.error('Watchlist analysis error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      answer: 'AI review is unavailable right now.',
      source: 'fallback',
    });
  }
}
