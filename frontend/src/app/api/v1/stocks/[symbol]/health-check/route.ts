import { NextRequest, NextResponse } from 'next/server';
import { getNseQuote } from '@/server/infrastructure/providers/nse';
import { getYahooQuote } from '@/server/infrastructure/providers/yahoo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    // Quick real check: prefer NSE, fall back to Yahoo. Either succeeding
    // means the symbol is resolvable and quoting -> "healthy".
    let cmp: number | null = null;
    try {
      const nse = await getNseQuote(symbol);
      if (nse && nse.cmp !== null && nse.cmp !== undefined) cmp = nse.cmp;
    } catch {
      // Ignore and try Yahoo.
    }
    if (cmp === null) {
      try {
        const yahoo = await getYahooQuote(symbol);
        if (yahoo && yahoo.cmp !== null && yahoo.cmp !== undefined) cmp = yahoo.cmp;
      } catch {
        // Ignore; treated as degraded below.
      }
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      status: cmp !== null ? 'healthy' : 'degraded',
      cmp,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      status: 'degraded',
      cmp: null,
      timestamp: new Date().toISOString(),
    });
  }
}
