import { NextRequest, NextResponse } from 'next/server';

// This is a placeholder. In production, you'd fetch real market data
// For now, returning mock data to prevent 404
export async function GET(request: NextRequest) {
  try {
    // Mock ticker data
    const mockTickers = [
      { symbol: 'RELIANCE', cmp: 2850, change: 45.50, changePercent: 1.62 },
      { symbol: 'HDFCBANK', cmp: 1920, change: -15.25, changePercent: -0.78 },
      { symbol: 'INFY', cmp: 1850, change: 28.75, changePercent: 1.58 },
      { symbol: 'TCS', cmp: 3920, change: 62.40, changePercent: 1.62 },
      { symbol: 'SBIN', cmp: 680, change: 12.50, changePercent: 1.86 },
    ];

    return NextResponse.json({
      data: mockTickers,
    });
  } catch (error) {
    console.error('Ticker error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch ticker data' },
      { status: 500 }
    );
  }
}
