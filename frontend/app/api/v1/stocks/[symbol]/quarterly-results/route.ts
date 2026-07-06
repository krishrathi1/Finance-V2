import { NextResponse } from 'next/server';
import { getNseQuarterlyResults } from '@/lib/backend/providers/nse';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const normalized = String(symbol || '').trim().toUpperCase();
  try {
    const data = normalized ? await getNseQuarterlyResults(normalized) : null;
    return NextResponse.json({
      symbol: normalized,
      bankNonBanking: 'N',
      results: data?.quarterlyDetailedStandalone || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Quarterly results error:', error);
    return NextResponse.json({
      symbol: normalized,
      bankNonBanking: 'N',
      results: [],
      timestamp: new Date().toISOString(),
    });
  }
}
