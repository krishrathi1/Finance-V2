import { NextRequest, NextResponse } from 'next/server';
import { earningsTldr } from '@/server/ai/features';
import { getNseQuote, getNseQuarterlyResults } from '@/server/infrastructure/providers/nse';
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
    // Light context: quarterly results feed the earnings summary, plus the
    // company name for nicer phrasing.
    const context: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    try {
      const [quote, quarterly] = await Promise.all([
        getNseQuote(symbol),
        getNseQuarterlyResults(symbol),
      ]);
      if (quote?.companyName) context.companyName = quote.companyName;
      if (quarterly?.quarterly?.length) {
        context.quarterlyData = quarterly.quarterly;
      }
    } catch {
      // Ignore context-gathering failures.
    }

    const result = await earningsTldr(symbol, context);

    return NextResponse.json({
      summary: result.summary,
      highlights: result.highlights,
      source: result.source,
    });
  } catch (error) {
    console.error('Earnings TLDR error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      summary: 'Earnings summary is unavailable right now.',
      highlights: [],
      source: 'fallback',
    });
  }
}
