/**
 * Maps NSE API response to displayable dashboard sections
 */

export interface NSEDataMap {
  // Header Info
  header: {
    symbol: string;
    companyName: string;
    lastUpdateTime: string;
  };

  // Main Price Display
  priceDisplay: {
    lastPrice: number;
    change: number;
    changePercent: number;
    open: number;
    close: number;
    vwap: number;
    previousClose: number;
  };

  // Ranges
  ranges: {
    todayHigh: number;
    todayLow: number;
    weekHigh: number;
    weekHighDate: string;
    weekLow: number;
    weekLowDate: string;
  };

  // Circuit Breakers
  circuitBreakers: {
    lower: string;
    upper: string;
    priceBand: string;
  };

  // Key Metrics Cards
  metrics: {
    peRatio: number;
    sectorPeRatio: number;
    faceValue: number;
    outstandingShares: number;
  };

  // Classification
  classification: {
    macro: string;
    sector: string;
    industry: string;
    basicIndustry: string;
    primaryIndex: string;
    allIndices: string[];
  };

  // Status Badges
  badges: {
    tradingStatus: string;
    boardStatus: string;
    hasDerivatives: boolean;
    hasLending: boolean;
    isSuspended: boolean;
    isDelisted: boolean;
  };

  // Pre-Open Auction Data
  preOpenAuction: {
    iep: number; // Indicative Equilibrium Price
    finalPrice: number;
    tradedVolume: number;
    change: number;
    changePercent: number;
    orderBook: Array<{
      price: number;
      buyQty: number;
      sellQty: number;
      isIEP?: boolean;
    }>;
    buyImbalance: number;
    sellImbalance: number;
  };

  // Company Info
  companyInfo: {
    isin: string;
    listingDate: string;
    identifier: string;
  };
}

/**
 * Transform NSE quote-equity API response to dashboard format
 */
export function mapNSEQuoteData(data: any): NSEDataMap {
  const info = data.info || {};
  const metadata = data.metadata || {};
  const securityInfo = data.securityInfo || {};
  const priceInfo = data.priceInfo || {};
  const industryInfo = data.industryInfo || {};
  const preOpenMarket = data.preOpenMarket || {};

  return {
    header: {
      symbol: info.symbol || '',
      companyName: info.companyName || '',
      lastUpdateTime: metadata.lastUpdateTime || '',
    },

    priceDisplay: {
      lastPrice: parseFloat(String(priceInfo.lastPrice || 0)),
      change: parseFloat(String(priceInfo.change || 0)),
      changePercent: parseFloat(String(priceInfo.pChange || 0)),
      open: parseFloat(String(priceInfo.open || 0)),
      close: parseFloat(String(priceInfo.close || 0)),
      vwap: parseFloat(String(priceInfo.vwap || 0)),
      previousClose: parseFloat(String(priceInfo.previousClose || 0)),
    },

    ranges: {
      todayHigh: parseFloat(String(priceInfo.intraDayHighLow?.max || 0)),
      todayLow: parseFloat(String(priceInfo.intraDayHighLow?.min || 0)),
      weekHigh: parseFloat(String(priceInfo.weekHighLow?.max || 0)),
      weekHighDate: priceInfo.weekHighLow?.maxDate || '',
      weekLow: parseFloat(String(priceInfo.weekHighLow?.min || 0)),
      weekLowDate: priceInfo.weekHighLow?.minDate || '',
    },

    circuitBreakers: {
      lower: String(priceInfo.lowerCP || ''),
      upper: String(priceInfo.upperCP || ''),
      priceBand: String(priceInfo.pPriceBand || ''),
    },

    metrics: {
      peRatio: parseFloat(String(metadata.pdSymbolPe || 0)),
      sectorPeRatio: parseFloat(String(metadata.pdSectorPe || 0)),
      faceValue: parseFloat(String(securityInfo.faceValue || 0)),
      outstandingShares: parseFloat(String(securityInfo.issuedSize || 0)),
    },

    classification: {
      macro: String(industryInfo.macro || ''),
      sector: String(industryInfo.sector || ''),
      industry: String(industryInfo.industry || ''),
      basicIndustry: String(industryInfo.basicIndustry || ''),
      primaryIndex: String(metadata.pdSectorInd || ''),
      allIndices: Array.isArray(metadata.pdSectorIndAll) ? metadata.pdSectorIndAll : [],
    },

    badges: {
      tradingStatus: String(securityInfo.tradingStatus || ''),
      boardStatus: String(securityInfo.boardStatus || ''),
      hasDerivatives: securityInfo.derivatives === 'Yes',
      hasLending: securityInfo.slb === 'Yes',
      isSuspended: info.isSuspended === true,
      isDelisted: info.isDelisted === true,
    },

    preOpenAuction: {
      iep: parseFloat(String(preOpenMarket.IEP || 0)),
      finalPrice: parseFloat(String(preOpenMarket.finalPrice || 0)),
      tradedVolume: parseFloat(String(preOpenMarket.totalTradedVolume || 0)),
      change: parseFloat(String(preOpenMarket.Change || 0)),
      changePercent: parseFloat(String(preOpenMarket.perChange || 0)),
      orderBook: (preOpenMarket.preopen || []).map((item: any) => ({
        price: parseFloat(String(item.price || 0)),
        buyQty: parseFloat(String(item.buyQty || 0)),
        sellQty: parseFloat(String(item.sellQty || 0)),
        isIEP: item.iep === true,
      })),
      buyImbalance: parseFloat(String(preOpenMarket.totalBuyQuantity || 0)),
      sellImbalance: parseFloat(String(preOpenMarket.totalSellQuantity || 0)),
    },

    companyInfo: {
      isin: String(info.isin || ''),
      listingDate: String(info.listingDate || metadata.listingDate || ''),
      identifier: String(info.identifier || ''),
    },
  };
}
