import { NextRequest, NextResponse } from 'next/server';

// This is a placeholder dashboard endpoint
// In production, you'd fetch real stock data, historical candles, analysis, etc.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    // Mock dashboard data with realistic values
    const mockDashboard = {
      symbol: symbol.toUpperCase(),
      exchange: 'NSE',
      profile: {
        companyName: `${symbol.toUpperCase()} Limited`,
        sector: 'Energy',
        industry: 'Oil & Gas',
        description: 'Leading energy company in India with integrated operations across upstream, downstream, and petrochemicals',
        website: 'https://example.com',
        ceo: 'CEO Name',
        chairman: 'Chairman Name',
        employees: 50000,
        marketCap: 1500000,
        peRatio: 18.5,
        pbRatio: 5.85,
        dividendYield: 2.5,
        roe: 8.5,
        roce: 12.3,
        roa: 3.2,
        ebitdaMargin: 25.5,
        eps: 154.2,
        faceValue: 10,
        outstandingShares: 100000,
        netProfitMargin: 8.5,
        evToSales: 4.2,
        bookValue: 485.5,
        incorporationYear: 1957,
        headquarters: 'Mumbai, India',
        previousName: 'N/A',
      },
      quote: {
        cmp: 2850,
        change: 45.50,
        changePercent: 1.62,
        open: 2805,
        high: 2890,
        low: 2800,
        previousClose: 2804.50,
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
        aiExplanation: 'Strong fundamentals with good growth prospects',
        aiSource: 'gemini',
      },
      riskScore: {
        score: 4.2,
        aiExplanation: 'Moderate risk due to sector volatility',
        aiSource: 'gemini',
      },
      technicals: {
        momentum: 'positive',
        trend: 'uptrend',
        support: 2800,
        resistance: 2900,
      },
      financials: {
        marketCapCr: 1500000,
        peRatio: 18.5,
        pegRatio: 1.8,
        roe: 8.5,
        roce: 12.3,
        roa: 3.2,
        ebitdaMargin: 25.5,
        casaRatio: 45.3,
        dividendYield: 2.5,
        eps: 154.2,
        netInterestMargin: 3.2,
        evToSales: 4.2,
        bookValue: 485.5,
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
