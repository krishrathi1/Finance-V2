import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    return NextResponse.json({
      answer: `${symbol.toUpperCase()} shows interesting fundamentals. Consider your risk tolerance and investment horizon before making decisions.`,
      source: 'fallback',
    });
  } catch (error) {
    console.error('Watchlist analysis error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch watchlist analysis' },
      { status: 500 }
    );
  }
}
