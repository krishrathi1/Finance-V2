import { NextRequest, NextResponse } from 'next/server';

import { getNseQuote } from '@/lib/backend/providers/nse';
import { getYahooQuote } from '@/lib/backend/providers/yahoo';

function yahooQuoteResponse(symbol: string, exchange: string, quote: Awaited<ReturnType<typeof getYahooQuote>>) {
  return {
    symbol: symbol.toUpperCase(),
    companyName: '',
    industry: '',
    sector: '',
    lastPrice: quote?.cmp || 0,
    open: 0,
    close: 0,
    previousClose: quote?.cmp && quote?.change !== null && quote?.change !== undefined ? quote.cmp - quote.change : 0,
    vwap: 0,
    change: quote?.change || 0,
    pChange: quote?.changePercent || 0,
    fiftytwoWeekHigh: quote?.fiftyTwoWeekHigh || 0,
    fiftytwoWeekHighDate: '',
    fiftytwoWeekLow: quote?.fiftyTwoWeekLow || 0,
    fiftytwoWeekLowDate: '',
    intraDayHigh: 0,
    intraDayLow: 0,
    upperCP: 0,
    lowerCP: 0,
    marketCapCr: quote?.marketCap || null,
    peRatio: quote?.peRatio || null,
    industryPE: null,
    pegRatio: null,
    bookValue: null,
    priceToBook: null,
    evToSales: null,
    roe: null,
    roce: null,
    roa: null,
    ebitdaMargin: null,
    netProfitMargin: null,
    operatingMargin: null,
    eps: null,
    dividendYield: quote?.dividendYield || null,
    outstandingSharesCr: null,
    netProfit: 0,
    profitBeforeTax: 0,
    netSales: 0,
    totalIncome: 0,
    debtEquityRatio: 0,
    casaRatio: null,
    netInterestMargin: null,
    faceValue: 0,
    isin: '',
    listingDate: '',
    tradingStatus: quote?.cmp ? 'Active' : 'Unavailable',
    exchange,
    timestamp: new Date().toISOString(),
    source: 'yahoo',
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const exchange = (request.nextUrl.searchParams.get('exchange') || 'NSE').trim().toUpperCase();
    const baseSymbol = symbol.toUpperCase().replace(/\.(NS|BO)$/i, '');
    const marketSymbol = exchange === 'BSE' ? `${baseSymbol}.BO` : `${baseSymbol}.NS`;

    if (exchange === 'BSE') {
      const quote = await getYahooQuote(marketSymbol);
      if (!quote?.cmp) {
        return NextResponse.json(
          { detail: 'Failed to fetch BSE quote data' },
          { status: 502 }
        );
      }
      return NextResponse.json(yahooQuoteResponse(baseSymbol, exchange, quote));
    }

    const providerQuote = await getNseQuote(baseSymbol);
    if (providerQuote?.cmp) {
      return NextResponse.json({
        ...yahooQuoteResponse(baseSymbol, exchange, providerQuote),
        companyName: providerQuote.companyName || '',
        fiftytwoWeekHigh: providerQuote.fiftyTwoWeekHigh || 0,
        fiftytwoWeekLow: providerQuote.fiftyTwoWeekLow || 0,
        peRatio: providerQuote.peRatio || null,
        industryPE: providerQuote.industryPe || null,
        faceValue: providerQuote.faceValue || 0,
        outstandingSharesCr: providerQuote.outstandingShares || null,
        source: 'nse',
      });
    }

    const yahooFallbackQuote = await getYahooQuote(baseSymbol);
    if (yahooFallbackQuote?.cmp) {
      return NextResponse.json(yahooQuoteResponse(baseSymbol, exchange, yahooFallbackQuote));
    }

    // Fetch quote data from NSE API
    const quoteUrl = `https://www.nseindia.com/api/quote-equity?symbol=${baseSymbol}`;

    const quoteResponse = await fetch(quoteUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nseindia.com',
        'Accept': 'application/json',
      },
    });

    if (!quoteResponse.ok) {
      const quote = await getYahooQuote(marketSymbol);
      if (quote?.cmp) return NextResponse.json(yahooQuoteResponse(baseSymbol, exchange, quote));
      return NextResponse.json(
        { detail: `Failed to fetch from NSE API: ${quoteResponse.statusText}` },
        { status: quoteResponse.status }
      );
    }

    const quoteData = await quoteResponse.json();

    // Try to fetch quarterly results for financial metrics
    let quarterlyResults = null;
    try {
      const resultsUrl = `https://www.nseindia.com/api/results-comparision?symbol=${baseSymbol}`;
      const resultsResponse = await fetch(resultsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.nseindia.com',
        },
      });
      if (resultsResponse.ok) {
        const resultsData = await resultsResponse.json();
        quarterlyResults = resultsData.resCmpData?.[0] || null;
      }
    } catch {
      // Quarterly results are optional
    }

    // Extract and transform key data
    const priceInfo = quoteData.priceInfo || {};
    const weekHighLow = priceInfo.weekHighLow || {};
    const intraDayHighLow = priceInfo.intraDayHighLow || {};
    const metadata = quoteData.metadata || {};
    const info = quoteData.info || {};
    const industryInfo = quoteData.industryInfo || {};
    const securityInfo = quoteData.securityInfo || {};

    // Calculate metrics from quarterly results
    const lastPrice = priceInfo.lastPrice || 0;
    const faceValue = securityInfo.faceValue || 10;
    const outstandingShares = securityInfo.issuedSize || 0;

    // Market Cap = Last Price * Outstanding Shares / 10000000 (to get in Crores)
    const marketCapCr = lastPrice && outstandingShares
      ? Math.round((lastPrice * outstandingShares) / 10000000)
      : null;

    // EPS, PE, ROE, etc. from quarterly results
    const eps = quarterlyResults ? Number(quarterlyResults.re_basic_eps_for_cont_dic_opr) || null : null;
    const netProfit = quarterlyResults ? Number(quarterlyResults.re_net_profit) || 0 : 0;
    const profitBeforeTax = quarterlyResults ? Number(quarterlyResults.re_pro_loss_bef_tax) || 0 : 0;
    const netSales = quarterlyResults ? Number(quarterlyResults.re_net_sale) || 0 : 0;
    const totalIncome = quarterlyResults ? Number(quarterlyResults.re_total_inc) || 0 : 0;
    const debtEquityRatio = quarterlyResults ? Number(quarterlyResults.re_debt_eqt_rat) || 0 : 0;

    // PE Ratio
    const peRatio = lastPrice && eps && eps > 0 ? parseFloat((lastPrice / eps).toFixed(2)) : null;

    // Dividend Yield - typically available from NSE
    const dividendYield = priceInfo.dividend_yield || null;

    // EV to Sales - rough calculation if we have market cap and sales
    const evToSales = marketCapCr && netSales && netSales > 0
      ? parseFloat(((marketCapCr * 10000000) / (netSales * 100000)).toFixed(2))
      : null;

    const transformedData = {
      symbol: baseSymbol,
      companyName: info.companyName || '',
      industry: industryInfo.industry || '',
      sector: industryInfo.sector || '',

      // Price Information
      lastPrice: lastPrice,
      open: priceInfo.open || 0,
      close: priceInfo.close || 0,
      previousClose: priceInfo.previousClose || 0,
      vwap: priceInfo.vwap || 0,
      change: priceInfo.change || 0,
      pChange: priceInfo.pChange || 0,

      // High/Low Information
      fiftytwoWeekHigh: weekHighLow.max || 0,
      fiftytwoWeekHighDate: weekHighLow.maxDate || '',
      fiftytwoWeekLow: weekHighLow.min || 0,
      fiftytwoWeekLowDate: weekHighLow.minDate || '',

      // Intraday High/Low
      intraDayHigh: intraDayHighLow.max || 0,
      intraDayLow: intraDayHighLow.min || 0,

      // Circuit Limits
      upperCP: priceInfo.upperCP || 0,
      lowerCP: priceInfo.lowerCP || 0,

      // Valuation Metrics
      marketCapCr: marketCapCr,
      peRatio: peRatio,
      industryPE: metadata.pdSectorPe || null,
      pegRatio: null, // Not available in NSE API
      bookValue: null, // Not readily available
      priceToBook: null, // Not readily available
      evToSales: evToSales,

      // Profitability Metrics
      roe: null, // Not in quote, would need balance sheet data
      roce: null, // Not in quote
      roa: null, // Not in quote
      ebitdaMargin: null, // Not in quote
      netProfitMargin: netSales && netProfit ? parseFloat(((netProfit / netSales) * 100).toFixed(2)) : null,
      operatingMargin: null, // Not in quote

      // Per Share Data
      eps: eps,
      dividendYield: dividendYield,
      outstandingSharesCr: outstandingShares ? parseFloat((outstandingShares / 10000000).toFixed(2)) : null,

      // Financial Data
      netProfit: netProfit,
      profitBeforeTax: profitBeforeTax,
      netSales: netSales,
      totalIncome: totalIncome,

      // Risk Metrics
      debtEquityRatio: debtEquityRatio,
      casaRatio: null, // Banking metric - not applicable for most companies
      netInterestMargin: null, // Banking metric

      // Additional Info
      faceValue: faceValue,
      isin: info.isin || '',
      listingDate: metadata.listingDate || '',
      tradingStatus: securityInfo.tradingStatus || 'Active',
      exchange,

      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Quote data error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch quote data';
    return NextResponse.json(
      { detail: errorMessage },
      { status: 500 }
    );
  }
}
