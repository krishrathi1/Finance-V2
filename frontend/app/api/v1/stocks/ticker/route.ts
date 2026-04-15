import { NextRequest, NextResponse } from 'next/server';
import { nseProvider } from '@/lib/providers/nse';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedSymbols = searchParams.get('symbols')?.split(',') || [];
    
    // Default mock data for individual stocks
    const baseMockTickers = [
      { symbol: 'RELIANCE', cmp: 2850, change: 45.50, changePercent: 1.62 },
      { symbol: 'HDFCBANK', cmp: 1920, change: -15.25, changePercent: -0.78 },
      { symbol: 'INFY', cmp: 1850, change: 28.75, changePercent: 1.58 },
      { symbol: 'TCS', cmp: 3920, change: 62.40, changePercent: 1.62 },
      { symbol: 'SBIN', cmp: 680, change: 12.50, changePercent: 1.86 },
    ];

    let finalData = [...baseMockTickers];

    // If indices are requested, try to fetch real ones
    if (requestedSymbols.some(s => s.toUpperCase().includes('NIFTY') || s.toUpperCase().includes('SENSEX'))) {
      const realIndices = await nseProvider.getAllIndices();
      
      const nifty50 = realIndices.find(idx => idx.symbol === 'NIFTY 50');
      if (nifty50) {
        finalData.push({
          symbol: 'NIFTY 50',
          cmp: nifty50.cmp,
          change: nifty50.change,
          changePercent: nifty50.changePercent
        });

        // Sensex is usually ~3.2x Nifty. 
        // For a better mock if real BSE data isn't available:
        const sensexVal = nifty50.cmp * 3.3;
        finalData.push({
          symbol: 'BSE SENSEX',
          cmp: Math.round(sensexVal * 100) / 100,
          change: Math.round(nifty50.change * 3.3 * 100) / 100,
          changePercent: nifty50.changePercent
        });
      } else {
        // Fallback mock indices if NSE fetch fails
        finalData.push({ symbol: 'NIFTY 50', cmp: 22453.35, change: 123.45, changePercent: 0.55 });
        finalData.push({ symbol: 'BSE SENSEX', cmp: 74248.22, change: 421.12, changePercent: 0.57 });
      }
    }

    return NextResponse.json({
      data: finalData,
    });
  } catch (error) {
    console.error('Ticker error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch ticker data' },
      { status: 500 }
    );
  }
}
