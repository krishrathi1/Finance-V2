import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const { question } = await request.json();

    // Mock AI response
    const mockAnswer = `Based on ${symbol.toUpperCase()}'s recent performance and market conditions, this is a general analysis. For detailed investment advice, please consult a financial advisor.`;

    return NextResponse.json({
      answer: mockAnswer,
      source: 'fallback',
      symbol: symbol.toUpperCase(),
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { detail: 'Failed to process question' },
      { status: 500 }
    );
  }
}
