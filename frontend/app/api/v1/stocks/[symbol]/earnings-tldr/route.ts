import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    return NextResponse.json({
      summary: `Latest earnings for ${symbol.toUpperCase()} show steady performance`,
      highlights: [
        'Revenue growth maintained',
        'Margins relatively stable',
        'Strong cash generation',
      ],
      source: 'fallback',
    });
  } catch (error) {
    console.error('Earnings TLDR error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch earnings summary' },
      { status: 500 }
    );
  }
}
