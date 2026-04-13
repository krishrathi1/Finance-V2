import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const indexName = request.nextUrl.searchParams.get('index') || 'NIFTY 50';

    // Mock heatmap data
    const mockRows = [
      { symbol: 'RELIANCE', cmp: 2850, change: 45.50, changePercent: 1.62 },
      { symbol: 'HDFCBANK', cmp: 1920, change: -15.25, changePercent: -0.78 },
      { symbol: 'INFY', cmp: 1850, change: 28.75, changePercent: 1.58 },
    ];

    return NextResponse.json({
      indexName: indexName,
      updatedAt: new Date().toISOString(),
      rows: mockRows,
    });
  } catch (error) {
    console.error('Index heatmap error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch index heatmap' },
      { status: 500 }
    );
  }
}
