import { NextRequest, NextResponse } from 'next/server';
import { competitorVerdict } from '@/lib/backend/ai/features';
import { getNseQuote } from '@/lib/backend/providers/nse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    // Light context: the subject stock's own P/E for peer comparison.
    const context: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    try {
      const quote = await getNseQuote(symbol);
      if (quote && quote.peRatio !== null && quote.peRatio !== undefined) {
        context.metrics = { pe: quote.peRatio, peRatio: quote.peRatio };
      }
    } catch {
      // Ignore context-gathering failures.
    }

    const result = await competitorVerdict(symbol, context);

    return NextResponse.json({
      verdict: result.verdict,
      analysis: result.analysis,
      source: result.source,
    });
  } catch (error) {
    console.error('Competitor verdict error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      verdict: 'Competitor analysis is unavailable right now.',
      analysis: {},
      source: 'fallback',
    });
  }
}
