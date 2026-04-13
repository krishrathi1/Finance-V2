import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { holdings } = await request.json();

    return NextResponse.json({
      overallRisk: 'Moderate',
      concentrationRisk: 'Low',
      sectorConcentration: 'Well diversified',
      betaScore: 1.2,
      recommendations: [
        'Consider increasing diversification across sectors',
        'Monitor concentration in top holdings',
      ],
      source: 'fallback',
    });
  } catch (error) {
    console.error('Portfolio risk error:', error);
    return NextResponse.json(
      { detail: 'Failed to assess portfolio risk' },
      { status: 500 }
    );
  }
}
