import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { symbol_a, symbol_b } = await request.json();

    return NextResponse.json({
      answer: `Comparing ${symbol_a} and ${symbol_b}. Both are strong companies in their respective sectors with different risk-return profiles.`,
      source: 'fallback',
    });
  } catch (error) {
    console.error('Compare analysis error:', error);
    return NextResponse.json(
      { detail: 'Failed to compare stocks' },
      { status: 500 }
    );
  }
}
