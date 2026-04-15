import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    // Fetch from NSE API
    const apiUrl = `https://www.nseindia.com/api/results-comparision?symbol=${symbol.toUpperCase()}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nseindia.com',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { detail: `Failed to fetch from NSE API: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform NSE response to a cleaner format
    const transformedResults = (data.resCmpData || []).map((item: any) => ({
      period: `${item.re_from_dt} to ${item.re_to_dt}`,
      endDate: item.re_to_dt,
      startDate: item.re_from_dt,
      createdDate: item.re_create_dt,
      type: item.re_res_type, // U = Unaudited, A = Audited
      netSales: Number(item.re_net_sale) || 0,
      netProfit: Number(item.re_net_profit) || 0,
      basicEPS: Number(item.re_basic_eps_for_cont_dic_opr) || 0,
      dilutedEPS: Number(item.re_dilut_eps_for_cont_dic_opr) || 0,
      profitBeforeTax: Number(item.re_pro_loss_bef_tax) || 0,
      profitAfterTax: Number(item.re_net_profit) || 0,
      staffCost: Number(item.re_staff_cost) || 0,
      depreciationExpense: Number(item.re_depr_und_exp) || 0,
      interestExpense: Number(item.re_int_new) || 0,
      rawMaterialConsumption: Number(item.re_rawmat_consump) || 0,
      totalExpense: Number(item.re_oth_tot_exp) || 0,
      totalIncome: Number(item.re_total_inc) || 0,
      otherIncome: Number(item.re_oth_inc_new) || 0,
      currentTax: Number(item.re_curr_tax) || 0,
      deferredTax: Number(item.re_deff_tax) || 0,
      otherExpense: Number(item.re_oth_exp) || 0,
      // Financial Ratios
      debtEquityRatio: Number(item.re_debt_eqt_rat) || 0,
      interestServiceCoverage: Number(item.re_int_ser_cov) || 0,
      debtServiceCoverage: Number(item.re_debt_ser_cov) || 0,
      // Notes
      descriptionSegment: item.re_desc_note_seg || '',
      descriptionFinancial: item.re_desc_note_fin || '',
      remarks: item.re_remarks || '',
    }));

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      bankNonBanking: data.bankNonBnking || 'N',
      results: transformedResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Quarterly results error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch quarterly results';
    return NextResponse.json(
      { detail: errorMessage },
      { status: 500 }
    );
  }
}
