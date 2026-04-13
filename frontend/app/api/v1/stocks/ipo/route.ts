import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'upcoming';

    // Mock IPO data
    const mockIpos = [
      {
        symbol: 'NEWCO',
        company: 'New Company Ltd',
        date: '2026-05-15',
        exchange: 'NSE',
        priceRange: '₹100-120',
        shares: 5000000,
        marketCap: 600000000,
        actions: 'Apply',
      },
    ];

    return NextResponse.json({
      data: mockIpos,
      type: type,
    });
  } catch (error) {
    console.error('IPO error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch IPO data' },
      { status: 500 }
    );
  }
}
