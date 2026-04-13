import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock screener results
    const mockResults = [
      {
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        pe: 18.5,
        pb: 2.4,
        dividendYield: 2.5,
        marketCap: 1500000000000,
      },
      {
        symbol: 'HDFCBANK',
        name: 'HDFC Bank',
        pe: 20.2,
        pb: 3.1,
        dividendYield: 1.2,
        marketCap: 1200000000000,
      },
    ];

    return NextResponse.json({
      results: mockResults,
    });
  } catch (error) {
    console.error('Screener error:', error);
    return NextResponse.json(
      { detail: 'Screener failed' },
      { status: 500 }
    );
  }
}
