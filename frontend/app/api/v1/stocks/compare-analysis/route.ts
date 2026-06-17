import { NextRequest, NextResponse } from 'next/server';
import { compareAnalysis } from '@/lib/backend/ai/features';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { symbol_a, symbol_b } = await request.json();

    const symbolA = String(symbol_a ?? '').trim();
    const symbolB = String(symbol_b ?? '').trim();

    const result = await compareAnalysis(symbolA, symbolB);

    return NextResponse.json({
      answer: result.answer,
      source: result.source,
    });
  } catch (error) {
    console.error('Compare analysis error:', error);
    return NextResponse.json({
      answer: 'AI comparison analysis is unavailable right now.',
      source: 'fallback',
    });
  }
}
