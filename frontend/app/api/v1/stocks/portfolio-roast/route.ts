import { NextRequest, NextResponse } from 'next/server';
import { portfolioRoast } from '@/lib/backend/ai/features';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
    const totalValue =
      typeof body?.totalValue === 'number' ? body.totalValue : undefined;

    const result = await portfolioRoast(holdings, totalValue);

    return NextResponse.json({
      analysis: result.analysis,
      positives: result.positives,
      concerns: result.concerns,
      overallScore: result.overallScore,
      source: result.source,
    });
  } catch (error) {
    console.error('Portfolio roast error:', error);
    return NextResponse.json({
      analysis: 'Portfolio analysis is unavailable right now.',
      positives: [],
      concerns: [],
      overallScore: '',
      source: 'fallback',
    });
  }
}
