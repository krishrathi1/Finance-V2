import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const { title, summary } = await request.json();

    return NextResponse.json({
      overview: `This news about ${symbol.toUpperCase()} appears significant for the stock.`,
      market_impact: 'Potential moderate positive impact on stock performance',
      watchpoint: 'Monitor company response and market reaction',
      source: 'fallback',
    });
  } catch (error) {
    console.error('News analysis error:', error);
    return NextResponse.json(
      { detail: 'Failed to analyze news' },
      { status: 500 }
    );
  }
}
