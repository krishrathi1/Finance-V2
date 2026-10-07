/**
 * BSE Market Data & Scrip Mapping.
 *
 * Provides BSE scrip code lookup (e.g. 500325 -> RELIANCE),
 * popular BSE universe for screening and market tickers,
 * and BSE search resolution.
 */

export interface BseStockInfo {
  scripCode: string;
  symbol: string;
  name: string;
  sector: string;
}

export const BSE_STOCKS: BseStockInfo[] = [
  // Sensex 30 / Large Caps
  { scripCode: "500325", symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy" },
  { scripCode: "532540", symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "IT" },
  { scripCode: "500180", symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking" },
  { scripCode: "532174", symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking" },
  { scripCode: "500209", symbol: "INFY", name: "Infosys Ltd", sector: "IT" },
  { scripCode: "500696", symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG" },
  { scripCode: "500875", symbol: "ITC", name: "ITC Ltd", sector: "FMCG" },
  { scripCode: "500112", symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
  { scripCode: "532454", symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom" },
  { scripCode: "500510", symbol: "LT", name: "Larsen & Toubro Ltd", sector: "Infrastructure" },
  { scripCode: "500247", symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", sector: "Banking" },
  { scripCode: "532215", symbol: "AXISBANK", name: "Axis Bank Ltd", sector: "Banking" },
  { scripCode: "500034", symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "Finance" },
  { scripCode: "532978", symbol: "BAJAJFINSV", name: "Bajaj Finserv Ltd", sector: "Finance" },
  { scripCode: "500520", symbol: "M&M", name: "Mahindra & Mahindra Ltd", sector: "Auto" },
  { scripCode: "500570", symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Auto" },
  { scripCode: "532500", symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Auto" },
  { scripCode: "524715", symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Pharma" },
  { scripCode: "500114", symbol: "TITAN", name: "Titan Company Ltd", sector: "Consumer" },
  { scripCode: "500820", symbol: "ASIANPAINT", name: "Asian Paints Ltd", sector: "Consumer" },
  { scripCode: "500470", symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metal" },
  { scripCode: "532555", symbol: "NTPC", name: "NTPC Ltd", sector: "Power" },
  { scripCode: "532898", symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd", sector: "Power" },
  { scripCode: "532538", symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", sector: "Cement" },
  { scripCode: "532281", symbol: "HCLTECH", name: "HCL Technologies Ltd", sector: "IT" },
  { scripCode: "507685", symbol: "WIPRO", name: "Wipro Ltd", sector: "IT" },
  { scripCode: "532755", symbol: "TECHM", name: "Tech Mahindra Ltd", sector: "IT" },
  { scripCode: "532977", symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd", sector: "Auto" },
  { scripCode: "500790", symbol: "NESTLEIND", name: "Nestle India Ltd", sector: "FMCG" },
  { scripCode: "532187", symbol: "INDUSINDBK", name: "IndusInd Bank Ltd", sector: "Banking" },
  
  // High-conviction Large/Mid-caps & Next 50
  { scripCode: "512599", symbol: "ADANIENT", name: "Adani Enterprises Ltd", sector: "Infrastructure" },
  { scripCode: "532921", symbol: "ADANIPORTS", name: "Adani Ports and SEZ Ltd", sector: "Infrastructure" },
  { scripCode: "533096", symbol: "ADANIPOWER", name: "Adani Power Ltd", sector: "Power" },
  { scripCode: "541450", symbol: "ADANIGREEN", name: "Adani Green Energy Ltd", sector: "Power" },
  { scripCode: "500408", symbol: "TATAPOWER", name: "Tata Power Company Ltd", sector: "Power" },
  { scripCode: "500800", symbol: "TATACONSUM", name: "Tata Consumer Products Ltd", sector: "FMCG" },
  { scripCode: "500010", symbol: "HDFC", name: "Housing Development Finance Corporation Ltd", sector: "Finance" },
  { scripCode: "540777", symbol: "HDFCLIFE", name: "HDFC Life Insurance Company Ltd", sector: "Insurance" },
  { scripCode: "540719", symbol: "SBILIFE", name: "SBI Life Insurance Company Ltd", sector: "Insurance" },
  { scripCode: "543066", symbol: "SBICARD", name: "SBI Cards and Payment Services Ltd", sector: "Finance" },
  { scripCode: "543526", symbol: "LICI", name: "Life Insurance Corporation of India", sector: "Insurance" },
  { scripCode: "532134", symbol: "BANKBARODA", name: "Bank of Baroda", sector: "Banking" },
  { scripCode: "532461", symbol: "PNB", name: "Punjab National Bank", sector: "Banking" },
  { scripCode: "539437", symbol: "IDFCFIRSTB", name: "IDFC First Bank Ltd", sector: "Banking" },
  { scripCode: "500469", symbol: "FEDERALBNK", name: "Federal Bank Ltd", sector: "Banking" },
  { scripCode: "540611", symbol: "AUBANK", name: "AU Small Finance Bank Ltd", sector: "Banking" },
  { scripCode: "500124", symbol: "DRREDDY", name: "Dr. Reddy's Laboratories Ltd", sector: "Pharma" },
  { scripCode: "500087", symbol: "CIPLA", name: "Cipla Ltd", sector: "Pharma" },
  { scripCode: "532488", symbol: "DIVISLAB", name: "Divi's Laboratories Ltd", sector: "Pharma" },
  { scripCode: "508869", symbol: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Ltd", sector: "Pharma" },
  { scripCode: "500257", symbol: "LUPIN", name: "Lupin Ltd", sector: "Pharma" },
  { scripCode: "524804", symbol: "AUROPHARMA", name: "Aurobindo Pharma Ltd", sector: "Pharma" },
  { scripCode: "500420", symbol: "TORNTPHARM", name: "Torrent Pharmaceuticals Ltd", sector: "Pharma" },
  { scripCode: "532321", symbol: "ZYDUSLIFE", name: "Zydus Lifesciences Ltd", sector: "Pharma" },
  { scripCode: "500825", symbol: "BRITANNIA", name: "Britannia Industries Ltd", sector: "FMCG" },
  { scripCode: "500096", symbol: "DABUR", name: "Dabur India Ltd", sector: "FMCG" },
  { scripCode: "531642", symbol: "MARICO", name: "Marico Ltd", sector: "FMCG" },
  { scripCode: "532424", symbol: "GODREJCP", name: "Godrej Consumer Products Ltd", sector: "FMCG" },
  { scripCode: "542772", symbol: "VBL", name: "Varun Beverages Ltd", sector: "FMCG" },
  { scripCode: "500830", symbol: "COLPAL", name: "Colgate-Palmolive (India) Ltd", sector: "FMCG" },
  { scripCode: "500228", symbol: "JSWSTEEL", name: "JSW Steel Ltd", sector: "Metal" },
  { scripCode: "500440", symbol: "HINDALCO", name: "Hindalco Industries Ltd", sector: "Metal" },
  { scripCode: "500295", symbol: "VEDL", name: "Vedanta Ltd", sector: "Metal" },
  { scripCode: "532286", symbol: "JINDALSTEL", name: "Jindal Steel & Power Ltd", sector: "Metal" },
  { scripCode: "500113", symbol: "SAIL", name: "Steel Authority of India Ltd", sector: "Metal" },
  { scripCode: "526371", symbol: "NMDC", name: "NMDC Ltd", sector: "Metal" },
  { scripCode: "500300", symbol: "GRASIM", name: "Grasim Industries Ltd", sector: "Cement" },
  { scripCode: "500387", symbol: "SHREECEM", name: "Shree Cement Ltd", sector: "Cement" },
  { scripCode: "500425", symbol: "AMBUJACEM", name: "Ambuja Cements Ltd", sector: "Cement" },
  { scripCode: "500410", symbol: "ACC", name: "ACC Ltd", sector: "Cement" },
  { scripCode: "500182", symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd", sector: "Auto" },
  { scripCode: "505200", symbol: "EICHERMOT", name: "Eicher Motors Ltd", sector: "Auto" },
  { scripCode: "532343", symbol: "TVSMOTOR", name: "TVS Motor Company Ltd", sector: "Auto" },
  { scripCode: "500477", symbol: "ASHOKLEY", name: "Ashok Leyland Ltd", sector: "Auto" },
  { scripCode: "517334", symbol: "MOTHERSON", name: "Samvardhana Motherson International Ltd", sector: "Auto" },
  { scripCode: "500312", symbol: "ONGC", name: "Oil & Natural Gas Corporation Ltd", sector: "Energy" },
  { scripCode: "530965", symbol: "IOC", name: "Indian Oil Corporation Ltd", sector: "Energy" },
  { scripCode: "500547", symbol: "BPCL", name: "Bharat Petroleum Corporation Ltd", sector: "Energy" },
  { scripCode: "532155", symbol: "GAIL", name: "GAIL (India) Ltd", sector: "Energy" },
  { scripCode: "533278", symbol: "COALINDIA", name: "Coal India Ltd", sector: "Energy" },
  { scripCode: "532868", symbol: "DLF", name: "DLF Ltd", sector: "Realty" },
  { scripCode: "533150", symbol: "GODREJPROP", name: "Godrej Properties Ltd", sector: "Realty" },
  { scripCode: "533273", symbol: "OBEROIRLTY", name: "Oberoi Realty Ltd", sector: "Realty" },
  { scripCode: "540376", symbol: "DMART", name: "Avenue Supermarts Ltd", sector: "Consumer" },
  { scripCode: "500251", symbol: "TRENT", name: "Trent Ltd", sector: "Consumer" },
  { scripCode: "500331", symbol: "PIDILITIND", name: "Pidilite Industries Ltd", sector: "Chemicals" },
  { scripCode: "517354", symbol: "HAVELLS", name: "Havells India Ltd", sector: "Consumer" },
  { scripCode: "540699", symbol: "DIXON", name: "Dixon Technologies (India) Ltd", sector: "Consumer" },
  { scripCode: "542651", symbol: "POLYCAB", name: "Polycab India Ltd", sector: "Consumer" },
  { scripCode: "542830", symbol: "IRCTC", name: "Indian Railway Catering & Tourism Corp Ltd", sector: "Services" },
  { scripCode: "543320", symbol: "ZOMATO", name: "Zomato Ltd", sector: "Services" },
  { scripCode: "543396", symbol: "PAYTM", name: "One 97 Communications Ltd (Paytm)", sector: "Services" },
  { scripCode: "532777", symbol: "NAUKRI", name: "Info Edge (India) Ltd", sector: "Services" },
  { scripCode: "500049", symbol: "BEL", name: "Bharat Electronics Ltd", sector: "Defence" },
  { scripCode: "541153", symbol: "HAL", name: "Hindustan Aeronautics Ltd", sector: "Defence" },
  { scripCode: "544047", symbol: "IREDA", name: "Indian Renewable Energy Development Agency Ltd", sector: "Finance" },
  { scripCode: "544028", symbol: "TATATECH", name: "Tata Technologies Ltd", sector: "IT" },
  { scripCode: "543940", symbol: "JIOFIN", name: "Jio Financial Services Ltd", sector: "Finance" },
  { scripCode: "532667", symbol: "SUZLON", name: "Suzlon Energy Ltd", sector: "Power" },
  { scripCode: "532648", symbol: "YESBANK", name: "Yes Bank Ltd", sector: "Banking" },
  { scripCode: "500020", symbol: "BOMDYEING", name: "Bombay Dyeing & Mfg Co Ltd", sector: "Consumer" },
  { scripCode: "570001", symbol: "TATAMTRDVR", name: "Tata Motors Ltd DVR", sector: "Auto" },
  { scripCode: "532822", symbol: "IDEA", name: "Vodafone Idea Ltd", sector: "Telecom" },
  { scripCode: "542066", symbol: "ATGL", name: "Adani Total Gas Ltd", sector: "Energy" },
];

const CODE_TO_STOCK = new Map<string, BseStockInfo>();
const SYMBOL_TO_STOCK = new Map<string, BseStockInfo>();

for (const stock of BSE_STOCKS) {
  CODE_TO_STOCK.set(stock.scripCode, stock);
  SYMBOL_TO_STOCK.set(stock.symbol.toUpperCase(), stock);
}

/** Look up a BSE stock by its 6-digit scrip code. */
export function getBseStockByCode(code: string): BseStockInfo | null {
  const c = String(code || "").trim();
  return CODE_TO_STOCK.get(c) || null;
}

/** Look up a BSE stock by its ticker symbol. */
export function getBseStockBySymbol(symbol: string): BseStockInfo | null {
  const sym = String(symbol || "").trim().toUpperCase().replace(/\.(BO|NS)$/i, "");
  return SYMBOL_TO_STOCK.get(sym) || null;
}

/**
 * Resolve any input (numeric BSE scrip code, or symbol) into a BSE-ready symbol.
 * E.g. "500325" -> { symbol: "RELIANCE", name: "Reliance Industries Ltd", exchange: "BSE" }
 */
export function resolveBseInput(input: string): { symbol: string; name: string; exchange: "BSE" } | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // Check 6-digit scrip code
  if (/^\d{6}$/.test(raw)) {
    const found = CODE_TO_STOCK.get(raw);
    if (found) {
      return { symbol: found.symbol, name: found.name, exchange: "BSE" };
    }
  }

  // Check symbol name
  const upper = raw.toUpperCase().replace(/\.BO$/i, "");
  const found = SYMBOL_TO_STOCK.get(upper);
  if (found) {
    return { symbol: found.symbol, name: found.name, exchange: "BSE" };
  }

  return null;
}

/** Search BSE stocks locally by query (scrip code, symbol, or company name). */
export function searchLocalBseStocks(query: string, limit = 10): Array<{ symbol: string; name: string; exchange: string }> {
  const q = String(query || "").trim().toUpperCase();
  if (!q) return [];

  const results: Array<{ symbol: string; name: string; exchange: string }> = [];

  for (const stock of BSE_STOCKS) {
    if (
      stock.scripCode.startsWith(q) ||
      stock.symbol.includes(q) ||
      stock.name.toUpperCase().includes(q)
    ) {
      results.push({
        symbol: stock.symbol,
        name: `${stock.name} (BSE: ${stock.scripCode})`,
        exchange: "BSE",
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}
