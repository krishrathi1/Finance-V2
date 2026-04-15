import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    const mockNews = [
      {
        title: `${symbol}: Strong Q3 Results Drive Investor Confidence`,
        source: 'Financial Express',
        publishedAt: new Date(Date.now() - 86400000).toISOString(),
        summary: `${symbol} reported strong Q3 earnings with 15% YoY growth in revenue. The company exceeded analyst expectations.`,
        url: `https://example.com/news/${symbol}/1`,
        imageUrl: null,
        sentimentScore: 0.8,
      },
      {
        title: `${symbol} Expands Operations to New Markets`,
        source: 'Business Standard',
        publishedAt: new Date(Date.now() - 172800000).toISOString(),
        summary: `The company announced expansion into three new geographic markets, expected to boost revenue by 20%.`,
        url: `https://example.com/news/${symbol}/2`,
        imageUrl: null,
        sentimentScore: 0.75,
      },
      {
        title: `Market Analysis: ${symbol} Trading at Fair Valuation`,
        source: 'ET Markets',
        publishedAt: new Date(Date.now() - 259200000).toISOString(),
        summary: `Analysts suggest ${symbol} is trading at reasonable valuations with strong growth potential in coming quarters.`,
        url: `https://example.com/news/${symbol}/3`,
        imageUrl: null,
        sentimentScore: 0.7,
      },
      {
        title: `${symbol}: Managing Inflationary Pressures`,
        source: 'Moneycontrol',
        publishedAt: new Date(Date.now() - 345600000).toISOString(),
        summary: `${symbol} management discusses strategies to manage rising costs while maintaining margins in the current economic environment.`,
        url: `https://example.com/news/${symbol}/4`,
        imageUrl: null,
        sentimentScore: 0.55,
      },
    ];

    return NextResponse.json({
      data: mockNews,
      symbol: symbol.toUpperCase(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Stock news error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch news';
    return NextResponse.json(
      { detail: errorMessage },
      { status: 500 }
    );
  }
}
