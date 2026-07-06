import { NextRequest, NextResponse } from 'next/server';
import { chatAnswer } from '@/lib/backend/ai/features';
import { getNseQuote } from '@/lib/backend/providers/nse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 1000) : '';
    if (!question) {
      return NextResponse.json({ detail: 'Question is required' }, { status: 400 });
    }

    // Light context: company name / P/E from a single NSE quote.
    const context: Record<string, unknown> = { symbol: symbol.toUpperCase() };
    try {
      const quote = await getNseQuote(symbol);
      if (quote) {
        if (quote.companyName) context.companyName = quote.companyName;
        if (quote.peRatio !== null && quote.peRatio !== undefined) {
          context.metrics = { peRatio: quote.peRatio };
        }
      }
    } catch {
      // Ignore context-gathering failures.
    }

    const result = await chatAnswer(symbol, question, context);

    return NextResponse.json({
      answer: result.answer,
      source: result.source,
    });
  } catch (error) {
    console.error('Chat error:', error);
    // GOLDEN RULE: never 500.
    return NextResponse.json({
      answer: 'AI engine is unavailable right now.',
      source: 'fallback',
    });
  }
}
