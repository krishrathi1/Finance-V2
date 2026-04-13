import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    return NextResponse.json({
      verdict: 'Competitive position is moderate',
      analysis: `${symbol.toUpperCase()} competes well in its segment with comparable valuations to peers.`,
      source: 'fallback',
    });
  } catch (error) {
    console.error('Competitor verdict error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch competitor verdict' },
      { status: 500 }
    );
  }
}
