import { NextRequest, NextResponse } from 'next/server';
import { portfolioRoast } from '@/server/ai/features';
import { requireActiveUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
    const totalValue =
      typeof body?.totalValue === 'number' ? body.totalValue : undefined;

    const result = await portfolioRoast(holdings, totalValue);

    // The component reads `res.roast` (a RoastResult-shaped object) — see
    // components/sections/portfolio-doctor.tsx handleRoast.
    const { source, ...roast } = result;
    return NextResponse.json({ roast, source });
  } catch (error) {
    console.error('Portfolio roast error:', error);
    return NextResponse.json({
      roast: {
        grade: '',
        gradeBadge: '',
        roast: 'Portfolio analysis is unavailable right now.',
        praiseOne: '',
        topRed: '',
        topGreen: '',
        fixes: [],
        verdict: '',
      },
      source: 'fallback',
    });
  }
}
