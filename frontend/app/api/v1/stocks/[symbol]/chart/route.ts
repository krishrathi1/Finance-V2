import { NextRequest, NextResponse } from 'next/server';

import { getNseQuote } from '@/lib/backend/providers/nse';
import { getYahooCandles, getYahooQuote } from '@/lib/backend/providers/yahoo';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function daysToCount(days: string) {
  const key = String(days || '1W').toUpperCase();
  if (key === '1D') return 7;
  if (key === '1W') return 14;
  if (key === '1M') return 45;
  if (key === '1Y') return 370;
  if (key === '5Y') return 1825;
  const parsed = Number.parseInt(key, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

function previousCalendarDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function syncHistoryWithQuote(
  history: Array<{ date: string; close: number }>,
  quote: Awaited<ReturnType<typeof getYahooQuote>>
) {
  const price = typeof quote?.cmp === 'number' && Number.isFinite(quote.cmp) ? quote.cmp : null;
  if (price === null || price <= 0) return history;

  const today = new Date().toISOString().slice(0, 10);
  const change = typeof quote?.change === 'number' && Number.isFinite(quote.change) ? quote.change : null;
  const previousClose = change !== null ? price - change : null;
  const rows = [...history];
  const last = rows.length ? rows[rows.length - 1] : null;
  const livePoint = { date: today, close: Number(price.toFixed(2)) };

  if (!rows.length && previousClose !== null && previousClose > 0 && Math.abs(previousClose - price) > 0.005) {
    rows.push({ date: previousCalendarDate(today), close: Number(previousClose.toFixed(2)) });
  }

  if (!rows.length) {
    rows.push(livePoint);
  } else if (last?.date === today) {
    rows[rows.length - 1] = livePoint;
  } else if (!last || Math.abs(Number(last.close) - price) > 0.005) {
    rows.push(livePoint);
  }

  return rows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const searchParams = request.nextUrl.searchParams;
    const days = searchParams.get('days') || '1W'; // Default to 1 week
    const exchange = (searchParams.get('exchange') || 'NSE').trim().toUpperCase();
    const baseSymbol = symbol.toUpperCase().replace(/\.(NS|BO)$/i, '');
    const marketSymbol = exchange === 'BSE' ? `${baseSymbol}.BO` : `${baseSymbol}.NS`;
    const dayCount = daysToCount(days);

    let [candles, quote] = await Promise.all([
      getYahooCandles(marketSymbol, dayCount),
      exchange === 'BSE' ? getYahooQuote(marketSymbol) : getNseQuote(baseSymbol),
    ]);

    if (!candles?.length && exchange !== 'BSE') {
      candles = await getYahooCandles(baseSymbol, dayCount);
    }
    if (!quote?.cmp && exchange !== 'BSE') {
      quote = await getYahooQuote(baseSymbol);
    }

    if (candles?.length || quote?.cmp) {
      const history = syncHistoryWithQuote(
        (candles || []).map((point) => ({
          date: point.date,
          close: Number(point.close) || 0,
        })).filter((point) => point.date && point.close > 0),
        quote
      );

      return NextResponse.json({
        identifier: marketSymbol,
        name: baseSymbol,
        history,
        closePrice: quote?.cmp ?? history[history.length - 1]?.close ?? null,
        timestamp: new Date().toISOString(),
        source: 'yahoo',
      });
    }

    // Convert symbol to NSE format (e.g., RELIANCE -> RELIANCEEQN)
    const nseSymbol = baseSymbol + 'EQN';

    // Fetch from NSE API
    const apiUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolChartData&symbol=${encodeURIComponent(nseSymbol)}&days=${encodeURIComponent(days)}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nseindia.com',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
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
