import { NextRequest, NextResponse } from 'next/server';
import { newsProvider } from '@/lib/providers/news';

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    
    // Fetch live news from NewsAPI instead of mock data
    const articles = await newsProvider.getMarketNews();

    // The API client in frontend/lib/api.ts expects a { data: [...] } envelope
    return NextResponse.json({
      success: true,
      data: articles || []
    });
  } catch (error) {
    console.error('Market news error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch market news', data: [] },
      { status: 500 }
    );
  }
}
