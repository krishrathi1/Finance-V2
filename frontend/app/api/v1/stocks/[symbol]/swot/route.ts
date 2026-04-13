import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    // Mock SWOT analysis
    const swotData = {
      strengths: [
        'Strong brand presence in the sector',
        'Consistent revenue growth track record',
        'Healthy balance sheet with low debt',
        'Diverse product portfolio',
        'Strong market position',
      ],
      weaknesses: [
        'Dependent on domestic market',
        'Margins under pressure from rising input costs',
        'Limited international presence',
        'High capital intensity',
      ],
      opportunities: [
        'Expanding into new geographies',
        'Growing digital adoption in the sector',
        'Potential for strategic acquisitions',
        'New product development',
        'Emerging market opportunities',
      ],
      threats: [
        'Intensifying competition from global players',
        'Regulatory changes could impact operations',
        'Currency fluctuation risks',
        'Geopolitical uncertainties',
        'Economic slowdown risks',
      ],
      bullCase:
        'If the company successfully executes its expansion strategy and maintains current margins, the stock could see meaningful upside driven by revenue growth and improving return ratios.',
      bearCase:
        'Prolonged margin compression from rising costs, combined with slowing demand or regulatory headwinds, could limit near-term upside and pressure valuations.',
    };

    return NextResponse.json(swotData);
  } catch (error) {
    console.error('SWOT error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch SWOT analysis' },
      { status: 500 }
    );
  }
}
