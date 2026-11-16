import { NextRequest, NextResponse } from 'next/server';
import { researchReport } from '@/server/ai/features';
import { loadDashboardEnvelope } from '@/server/application/dashboard-envelope';
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
    // Rich context: fetch from dashboard envelope or quote so Gemini has full financial depth
    const context: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    try {
      const envelope = await loadDashboardEnvelope(symbol);
      const d = envelope.data;
      if (d) {
        if (d.companyName) context.companyName = d.companyName;
        if (d.sector) context.sector = d.sector;
        if (d.price?.cmp) context.cmp = d.price.cmp;
        if (d.metrics) context.metrics = d.metrics;
        if (d.technicals) context.technicals = d.technicals;
        if (d.smartScore) context.smartScore = d.smartScore;
        if (d.riskScore) context.riskScore = d.riskScore;
      }
    } catch {
      // Fallback to light context from single quote
      try {
        const quote = await getNseQuote(symbol);
        if (quote) {
          if (quote.companyName) context.companyName = quote.companyName;
          if (quote.cmp) context.cmp = quote.cmp;
          if (quote.peRatio !== null && quote.peRatio !== undefined) {
            context.metrics = { peRatio: quote.peRatio };
          }
        }
      } catch {
        // Ignore context-gathering failures.
      }
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
