import { NextRequest, NextResponse } from 'next/server';
import { nseProvider } from '@/lib/providers/nse';

export async function GET(request: NextRequest) {
  try {
    const indexName = request.nextUrl.searchParams.get('index') || 'NIFTY 50';
    
    // Fetch live data from NSE instead of mock data
    const rows = await nseProvider.getIndexHeatmap(indexName);

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { detail: `No data found for index: ${indexName}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      indexName: indexName,
      updatedAt: new Date().toISOString(),
      rows: rows,
    });
  } catch (error) {
    console.error('Index heatmap error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch index heatmap' },
      { status: 500 }
    );
  }
}
