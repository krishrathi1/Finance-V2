import { NextRequest, NextResponse } from 'next/server';
import { researchReport } from '@/server/ai/features';
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

    const result = await researchReport(symbol, context);

    return NextResponse.json({
      title: result.title,
      report: result.report,
      recommendations: result.recommendations,
      targetPrice: result.targetPrice,
      riskLevel: result.riskLevel,
      source: result.source,
    });
  } catch (error) {
    console.error('Research report error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      title: `${symbol} Research Report`,
      report: 'Research report is unavailable right now.',
      recommendations: [],
      targetPrice: null,
      riskLevel: 'medium',
      source: 'fallback',
    });
  }
}
