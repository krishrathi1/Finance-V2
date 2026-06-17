import { NextRequest, NextResponse } from 'next/server';
import { portfolioRisk } from '@/lib/backend/ai/features';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const holdings = Array.isArray(body?.holdings) ? body.holdings : [];

    const result = await portfolioRisk(holdings);

    return NextResponse.json({
      overallRisk: result.overallRisk,
      concentrationRisk: result.concentrationRisk,
      sectorConcentration: result.sectorConcentration,
      betaScore: result.betaScore,
      recommendations: result.recommendations,
      source: result.source,
    });
  } catch (error) {
    console.error('Portfolio risk error:', error);
    return NextResponse.json({
      overallRisk: '',
      concentrationRisk: 'Portfolio risk assessment is unavailable right now.',
      sectorConcentration: '',
      betaScore: null,
      recommendations: [],
      source: 'fallback',
    });
  }
}
