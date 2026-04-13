import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock market news
    const mockNews = [
      {
        title: 'Market gains on strong corporate earnings',
        source: 'Financial Times',
        publishedAt: new Date().toISOString(),
        summary: 'Indian markets closed higher driven by positive earnings reports',
        url: 'https://example.com/news1',
        imageUrl: null,
      },
      {
        title: 'RBI maintains repo rate steady',
        source: 'Reuters',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        summary: 'The Reserve Bank of India kept key rates unchanged',
        url: 'https://example.com/news2',
        imageUrl: null,
      },
    ];

    return NextResponse.json({
      data: mockNews,
    });
  } catch (error) {
    console.error('Market news error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch market news' },
      { status: 500 }
    );
  }
}
