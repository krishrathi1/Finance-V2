import { NextRequest, NextResponse } from 'next/server';
import { portfolioRisk } from '@/lib/backend/ai/features';
import { requireActiveUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const holdings = Array.isArray(body?.holdings) ? body.holdings.slice(0, 20) : [];

    const result = await portfolioRisk(holdings);

    // The page reads `payload.analysis` (a RiskAnalysis-shaped object) — see
    // app/portfolio/page.tsx handleAIRisk.
    const { source, ...analysis } = result;
    return NextResponse.json({ analysis, source });
  } catch (error) {
    console.error('Portfolio risk error:', error);
    return NextResponse.json({
      analysis: {
        overallRisk: '',
        riskScore: 0,
        diversificationScore: 0,
        sectorConcentration: '',
        topRisks: [],
        recommendations: [],
        summary: 'Portfolio risk assessment is unavailable right now.',
      },
      source: 'fallback',
    });
  }
}
