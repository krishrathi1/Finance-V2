import { NextRequest, NextResponse } from 'next/server';

// This is a placeholder dashboard endpoint
// In production, you'd fetch real stock data, historical candles, analysis, etc.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    // Mock dashboard data
    const mockDashboard = {
      symbol: symbol.toUpperCase(),
      exchange: 'NSE',
      profile: {
        companyName: `${symbol.toUpperCase()} Limited`,
        sector: 'Energy',
        industry: 'Oil & Gas',
        description: 'Leading energy company',
        website: 'https://example.com',
        ceo: 'CEO Name',
        chairman: 'Chairman Name',
        employees: 50000,
        marketCap: 1500000000000,
        peRatio: 18.5,
        pbRatio: 2.4,
        dividendYield: 2.5,
        incorporationYear: 1957,
        headquarters: 'Mumbai, India',
      },
      quote: {
        cmp: 2850,
        change: 45.50,
        changePercent: 1.62,
        open: 2805,
        high: 2890,
        low: 2800,
        volume: 15000000,
        dayHigh52Week: 3200,
        dayLow52Week: 2400,
        averageVolume: 12000000,
      },
      candlesticks: {
        historical: 1239,
        realtimeToday: true,
      },
      smartScore: {
        score: 7.5,
        explanation: 'Strong fundamentals with good growth prospects',
        aiSource: 'gemini',
      },
      riskScore: {
        score: 4.2,
        explanation: 'Moderate risk due to sector volatility',
        aiSource: 'gemini',
      },
      technicals: {
        momentum: 'positive',
        trend: 'uptrend',
        support: 2800,
        resistance: 2900,
      },
    };

    return NextResponse.json({
      cached: false,
      data: mockDashboard,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
