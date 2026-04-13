import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    return NextResponse.json({
      title: `Research Report: ${symbol.toUpperCase()}`,
      report: `Detailed analysis of ${symbol.toUpperCase()} including financial metrics, market position, and outlook.`,
      recommendations: 'Buy',
      targetPrice: 'Above current levels',
      riskLevel: 'Moderate',
      source: 'fallback',
    });
  } catch (error) {
    console.error('Research report error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch research report' },
      { status: 500 }
    );
  }
}
