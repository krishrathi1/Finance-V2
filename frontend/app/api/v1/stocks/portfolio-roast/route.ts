import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { holdings } = await request.json();

    return NextResponse.json({
      analysis: 'Portfolio shows decent fundamentals with room for improvement',
      positives: [
        'Good mix of large-cap stocks',
        'Reasonable sector diversification',
      ],
      concerns: [
        'Could improve dividend yield',
        'Consider adding emerging companies',
      ],
      overallScore: 7,
      source: 'fallback',
    });
  } catch (error) {
    console.error('Portfolio roast error:', error);
    return NextResponse.json(
      { detail: 'Failed to generate portfolio analysis' },
      { status: 500 }
    );
  }
}
