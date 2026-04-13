import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Map of known endpoints
  const mockEndpoints: Record<string, any> = {
    '/api/v1/stocks/search': { results: [] },
    '/api/v1/stocks/index-heatmap': { indexName: 'NIFTY 50', rows: [] },
    '/api/v1/stocks/market-news': { data: [] },
    '/api/v1/stocks/screener': { results: [] },
    '/api/v1/stocks/ipo': { data: [] },
  };

  // Check if this is a known endpoint
  for (const [endpoint, data] of Object.entries(mockEndpoints)) {
    if (pathname.startsWith(endpoint)) {
      return NextResponse.json(data);
    }
  }

  // Default 404 for unknown endpoints
  return NextResponse.json(
    { detail: `Stocks endpoint ${pathname} not yet implemented` },
    { status: 404 }
  );
}

export async function POST(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return NextResponse.json(
    { detail: `Stocks endpoint ${pathname} not yet implemented` },
    { status: 404 }
  );
}
