import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';

    // Mock search results
    const mockResults = [
      { symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE' },
      { symbol: 'INFY', name: 'Infosys', exchange: 'NSE' },
      { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE' },
      { symbol: 'HDFCBANK', name: 'HDFC Bank', exchange: 'NSE' },
    ].filter(
      (item) =>
        item.symbol.toLowerCase().includes(q.toLowerCase()) ||
        item.name.toLowerCase().includes(q.toLowerCase())
    );

    return NextResponse.json({
      results: mockResults,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { detail: 'Search failed' },
      { status: 500 }
    );
  }
}
