import { NextRequest, NextResponse } from 'next/server';
import { newsProvider } from '@/lib/providers/news';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    void request.nextUrl.searchParams.get('refresh');
    
    // Fetch live news from NewsAPI instead of mock data
    const articles = await newsProvider.getMarketNews();

    // The API client in frontend/lib/api.ts expects a { data: [...] } envelope
    return NextResponse.json({
      success: true,
      data: articles || []
    });
  } catch (error) {
    console.error('Market news error:', error);
    return NextResponse.json({ detail: 'Live market news is temporarily unavailable', data: [] });
  }
}
