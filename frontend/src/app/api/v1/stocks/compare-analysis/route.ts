import { NextRequest, NextResponse } from 'next/server';
import { compareAnalysis } from '@/server/ai/features';
import { buildDashboard } from '@/server/application/dashboard';
import { requireActiveUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  try {
    const { symbol_a, symbol_b } = await request.json();

    const symbolA = String(symbol_a ?? '').trim();
    const symbolB = String(symbol_b ?? '').trim();
    if (!/^[A-Z0-9&.-]{1,20}$/i.test(symbolA) || !/^[A-Z0-9&.-]{1,20}$/i.test(symbolB)) {
      return NextResponse.json({ detail: 'Two valid stock symbols are required' }, { status: 400 });
    }

    const [contextA, contextB] = await Promise.all([
      buildDashboard(symbolA),
      buildDashboard(symbolB),
    ]);
    const result = await compareAnalysis(symbolA, symbolB, { contextA, contextB });

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
