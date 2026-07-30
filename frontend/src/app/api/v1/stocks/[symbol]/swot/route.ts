import { NextRequest, NextResponse } from 'next/server';
import { swotAnalysis } from '@/server/ai/features';
import { getNseQuote } from '@/server/infrastructure/providers/nse';
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
  // `refresh` is accepted for client cache-busting; no server cache to bust here.
  void request.nextUrl.searchParams.get('refresh');

  try {
    // Light, cheap context: a single NSE quote gives us the company name,
    // P/E and sector hints the SWOT prompt/fallback can use.
    let companyName = '';
    const context: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    try {
      const quote = await getNseQuote(symbol);
      if (quote) {
        if (quote.companyName) {
          companyName = quote.companyName;
          context.companyName = quote.companyName;
        }
        if (quote.peRatio !== null && quote.peRatio !== undefined) {
          context.metrics = { peRatio: quote.peRatio };
        }
      }
    } catch {
      // Ignore context-gathering failures; the AI layer has its own fallback.
    }

    const result = await swotAnalysis(symbol, companyName, context);

    return NextResponse.json({
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      opportunities: result.opportunities,
      threats: result.threats,
      bullCase: result.bullCase,
      bearCase: result.bearCase,
      generatedAt: result.generatedAt,
      source: result.source,
    });
  } catch (error) {
    console.error('SWOT error:', error);
    // GOLDEN RULE: never 500. Return a valid fallback-shaped payload.
    return NextResponse.json({
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
      bullCase: '',
      bearCase: '',
      generatedAt: new Date().toISOString(),
      source: 'fallback',
    });
  }
}
