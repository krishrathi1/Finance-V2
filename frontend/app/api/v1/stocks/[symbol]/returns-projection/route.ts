import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const amount = parseFloat(searchParams.get('amount') || '10000');
    const cagr = parseFloat(searchParams.get('cagr') || '12');
    const years = parseFloat(searchParams.get('years') || '5');

    const projectedValue = amount * Math.pow(1 + cagr / 100, years);
    const gain = projectedValue - amount;

    return NextResponse.json({
      investmentAmount: amount,
      projectedValue: Math.round(projectedValue * 100) / 100,
      gain: Math.round(gain * 100) / 100,
      cagr: cagr,
      years: years,
      disclaimer: 'This is a hypothetical projection based on assumed CAGR. Actual returns may vary.',
    });
  } catch (error) {
    console.error('Returns projection error:', error);
    return NextResponse.json(
      { detail: 'Failed to calculate returns projection' },
      { status: 500 }
    );
  }
}
