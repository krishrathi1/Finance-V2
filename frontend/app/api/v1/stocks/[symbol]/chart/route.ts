import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const searchParams = request.nextUrl.searchParams;
    const days = searchParams.get('days') || '1W'; // Default to 1 week

    // Convert symbol to NSE format (e.g., RELIANCE -> RELIANCEEQN)
    const nseSymbol = symbol.toUpperCase() + 'EQN';

    // Fetch from NSE API
    const apiUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolChartData&symbol=${nseSymbol}&days=${days}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nseindia.com',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { detail: `Failed to fetch from NSE API: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const graphData = data.grapthData || data.graphData || [];

    // Transform NSE graph data to PriceChart format
    // NSE format: [timestamp, price, status, null, null]
    // PriceChart format: { date: string, close: number }
    const transformedHistory = graphData.map((point: any[]) => {
      const timestamp = point[0];
      const price = point[1];
      const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
      return {
        date,
        close: Number(price) || 0,
      };
    });

    // Return both formats - raw for API consumers, history for chart
    const transformedData = {
      identifier: nseSymbol,
      name: symbol.toUpperCase(),
      graphData: graphData, // Raw NSE format
      history: transformedHistory, // Transformed for PriceChart
      closePrice: data.closePrice || null,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Chart data error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch chart data';
    return NextResponse.json(
      { detail: errorMessage },
      { status: 500 }
    );
  }
}
