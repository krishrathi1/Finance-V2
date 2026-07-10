import { NextRequest, NextResponse } from 'next/server';
import { newsAnalysis } from '@/lib/backend/ai/features';
import { requireActiveUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const auth = await requireActiveUser(request);
  if ('error' in auth) return auth.error;

  const { symbol } = await params;

  try {
    const body = await request.json().catch(() => ({}));

    // Client sends snake_case; the AI feature layer expects camelCase keys.
    const article = {
      title: typeof body?.title === 'string' ? body.title : '',
      summary: typeof body?.summary === 'string' ? body.summary : '',
      source: typeof body?.source === 'string' ? body.source : '',
      publishedAt: typeof body?.published_at === 'string' ? body.published_at : '',
      sentimentScore:
        body?.sentiment_score !== null && body?.sentiment_score !== undefined
          ? Number(body.sentiment_score)
          : null,
    };

    const result = await newsAnalysis(symbol, article);

    // NOTE: the client reads snake_case `market_impact`.
    return NextResponse.json({
      overview: result.overview,
      market_impact: result.marketImpact,
      watchpoint: result.watchpoint,
      source: result.source,
    });
  } catch (error) {
    console.error('News analysis error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      overview: 'News analysis is unavailable right now.',
      market_impact:
        'AI analysis is unavailable right now, so treat this update as one input rather than a full conclusion.',
      watchpoint: 'Check the next result, filing, or management comment before making a decision.',
      source: 'fallback',
    });
  }
}
