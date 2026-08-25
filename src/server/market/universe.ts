// Curated universe of ~150 NSE-listed companies with realistic approximate
// fundamentals. The engine walks prices deterministically around these anchors.

export interface StockSeed {
  s: string; // symbol
  n: string; // company name
  sec: string; // sector
  ind: string; // industry
  p: number; // anchor price (₹)
  mc: number; // market cap (₹ Cr)
  pe: number | null; // P/E (null = loss-making)
  pb: number; // P/B
  roe: number; // ROE %
  roce: number; // ROCE %
  de: number; // debt / equity
  ph: number; // promoter holding %
  fii: number; // FII holding %
  dii: number; // DII holding %
  dy: number; // dividend yield %
  rg: number; // revenue growth YoY %
  pg: number; // profit growth YoY %
  v: number; // volatility factor
  d: number; // drift bias (annual, e.g. 0.12 = +12%)
  n50?: boolean; // NIFTY 50 member
}

export const UNIVERSE: StockSeed[] = [
  // ── Energy ──────────────────────────────────────────────
  { s: "RELIANCE", n: "Reliance Industries", sec: "Energy", ind: "Oil & Gas Refining", p: 1290, mc: 1750000, pe: 26, pb: 2.2, roe: 8.8, roce: 10.2, de: 0.44, ph: 50.3, fii: 21.5, dii: 17.1, dy: 0.4, rg: 7, pg: 6, v: 0.95, d: 0.1, n50: true },
  { s: "ONGC", n: "Oil & Natural Gas Corp", sec: "Energy", ind: "Oil & Gas E&P", p: 250, mc: 315000, pe: 8.5, pb: 1.0, roe: 13.5, roce: 14.8, de: 0.42, ph: 58.9, fii: 10.4, dii: 18.2, dy: 3.9, rg: 4, pg: -6, v: 1.15, d: 0.04, n50: true },
  { s: "IOC", n: "Indian Oil Corp", sec: "Energy", ind: "Oil & Gas Refining", p: 142, mc: 200000, pe: 12, pb: 1.1, roe: 9.4, roce: 11.1, de: 0.94, ph: 51.5, fii: 8.1, dii: 23.4, dy: 3.2, rg: 2, pg: -12, v: 1.1, d: 0.02 },
  { s: "BPCL", n: "Bharat Petroleum Corp", sec: "Energy", ind: "Oil & Gas Refining", p: 312, mc: 135000, pe: 8.2, pb: 1.6, roe: 21.5, roce: 22.4, de: 0.61, ph: 52.9, fii: 12.7, dii: 21.6, dy: 3.4, rg: 3, pg: 18, v: 1.15, d: 0.05, n50: true },
  { s: "GAIL", n: "GAIL (India)", sec: "Energy", ind: "Oil & Gas Midstream", p: 192, mc: 126000, pe: 10.4, pb: 1.3, roe: 13.2, roce: 14.9, de: 0.51, ph: 51.5, fii: 11.3, dii: 22.5, dy: 2.6, rg: 5, pg: 9, v: 1.0, d: 0.05 },
  { s: "PETRONET", n: "Petronet LNG", sec: "Energy", ind: "Oil & Gas Midstream", p: 322, mc: 48000, pe: 11.5, pb: 3.4, roe: 28.4, roce: 29.8, de: 0.08, ph: 50, fii: 15.8, dii: 22.4, dy: 3.4, rg: 6, pg: 5, v: 0.95, d: 0.03 },
  { s: "OIL", n: "Oil India", sec: "Energy", ind: "Oil & Gas E&P", p: 452, mc: 55000, pe: 8.1, pb: 1.2, roe: 16.8, roce: 18.2, de: 0.21, ph: 56.7, fii: 9.5, dii: 20.4, dy: 3.1, rg: 8, pg: 12, v: 1.2, d: 0.06 },
  { s: "COALINDIA", n: "Coal India", sec: "Energy", ind: "Thermal Coal", p: 412, mc: 254000, pe: 7.4, pb: 3.2, roe: 43.5, roce: 51.2, de: 0.07, ph: 63.1, fii: 7.9, dii: 20.6, dy: 6.2, rg: 2, pg: 3, v: 1.05, d: 0.06, n50: true },
  { s: "ADANIGREEN", n: "Adani Green Energy", sec: "Utilities", ind: "Solar Power", p: 1050, mc: 167000, pe: 92, pb: 14.5, roe: 15.8, roce: 9.4, de: 5.2, ph: 60.9, fii: 13.2, dii: 4.1, dy: 0.06, rg: 22, pg: 28, v: 2.2, d: 0.09 },
  { s: "ADANIPOWER", n: "Adani Power", sec: "Utilities", ind: "Independent Power", p: 580, mc: 223000, pe: 15.2, pb: 4.4, roe: 29.5, roce: 21.8, de: 1.3, ph: 74.2, fii: 6.8, dii: 6.2, dy: 0.1, rg: 26, pg: 65, v: 2.1, d: 0.08 },
  { s: "ATGL", n: "Adani Total Gas", sec: "Utilities", ind: "Gas Distribution", p: 720, mc: 79000, pe: 168, pb: 17.8, roe: 11.2, roce: 14.6, de: 0.62, ph: 37.4, fii: 14.8, dii: 4.6, dy: 0.08, rg: 9, pg: 7, v: 2.3, d: 0.02 },

  // ── Financial Services ──────────────────────────────────
  { s: "HDFCBANK", n: "HDFC Bank", sec: "Financial Services", ind: "Diversified Banks", p: 1680, mc: 1285000, pe: 19.2, pb: 2.8, roe: 14.6, roce: 12.1, de: 0, ph: 0, fii: 47.1, dii: 32.4, dy: 1.1, rg: 15, pg: 10, v: 0.85, d: 0.12, n50: true },
  { s: "ICICIBANK", n: "ICICI Bank", sec: "Financial Services", ind: "Diversified Banks", p: 1240, mc: 875000, pe: 17.6, pb: 3.2, roe: 18.1, roce: 14.6, de: 0, ph: 0, fii: 44.8, dii: 39.1, dy: 0.8, rg: 16, pg: 15, v: 0.9, d: 0.15, n50: true },
  { s: "SBIN", n: "State Bank of India", sec: "Financial Services", ind: "Diversified Banks", p: 820, mc: 732000, pe: 10.1, pb: 1.7, roe: 17.2, roce: 12.4, de: 0, ph: 57.5, fii: 11.2, dii: 24.6, dy: 1.5, rg: 13, pg: 14, v: 1.0, d: 0.13, n50: true },
  { s: "KOTAKBANK", n: "Kotak Mahindra Bank", sec: "Financial Services", ind: "Diversified Banks", p: 1780, mc: 354000, pe: 18.6, pb: 2.6, roe: 14.2, roce: 11.8, de: 0, ph: 25.9, fii: 34.2, dii: 30.1, dy: 0.6, rg: 14, pg: 12, v: 0.9, d: 0.08, n50: true },
  { s: "AXISBANK", n: "Axis Bank", sec: "Financial Services", ind: "Diversified Banks", p: 1132, mc: 350000, pe: 12.8, pb: 2.1, roe: 16.4, roce: 13.2, de: 0, ph: 8.2, fii: 46.8, dii: 32.6, dy: 0.4, rg: 14, pg: 16, v: 0.95, d: 0.12, n50: true },
  { s: "INDUSINDBK", n: "IndusInd Bank", sec: "Financial Services", ind: "Diversified Banks", p: 985, mc: 77000, pe: 9.4, pb: 1.1, roe: 12.1, roce: 10.4, de: 0, ph: 16.5, fii: 42.1, dii: 30.2, dy: 1.9, rg: 9, pg: -18, v: 1.35, d: -0.04, n50: true },
  { s: "BAJFINANCE", n: "Bajaj Finance", sec: "Financial Services", ind: "Credit Services", p: 7120, mc: 441000, pe: 29.6, pb: 5.4, roe: 19.8, roce: 14.2, de: 3.6, ph: 54.7, fii: 20.3, dii: 14.8, dy: 0.5, rg: 26, pg: 22, v: 1.15, d: 0.11, n50: true },
  { s: "BAJAJFINSV", n: "Bajaj Finserv", sec: "Financial Services", ind: "Insurance Brokers", p: 1650, mc: 262000, pe: 32, pb: 3.1, roe: 12.8, roce: 11.4, de: 3.2, ph: 54.5, fii: 14.1, dii: 8.9, dy: 0.4, rg: 22, pg: 15, v: 1.05, d: 0.09, n50: true },
  { s: "JIOFIN", n: "Jio Financial Services", sec: "Financial Services", ind: "Credit Services", p: 320, mc: 203000, pe: 102, pb: 2.4, roe: 2.1, roce: 3.4, de: 0.6, ph: 47.1, fii: 11.5, dii: 3.2, dy: 0.3, rg: 45, pg: 120, v: 1.3, d: 0.05, n50: true },
  { s: "SHRIRAMFIN", n: "Shriram Finance", sec: "Financial Services", ind: "Credit Services", p: 3100, mc: 116000, pe: 13.2, pb: 2.1, roe: 16.4, roce: 12.8, de: 3.8, ph: 25.4, fii: 33.8, dii: 26.4, dy: 1.2, rg: 18, pg: 20, v: 1.1, d: 0.1, n50: true },
  { s: "CHOLAFIN", n: "Cholamandalam Investment", sec: "Financial Services", ind: "Credit Services", p: 1552, mc: 129000, pe: 25.4, pb: 5.1, roe: 21.4, roce: 15.6, de: 3.2, ph: 50.3, fii: 19.8, dii: 19.2, dy: 0.4, rg: 24, pg: 26, v: 1.05, d: 0.12 },
  { s: "MUTHOOTFIN", n: "Muthoot Finance", sec: "Financial Services", ind: "Credit Services", p: 2210, mc: 89000, pe: 15.1, pb: 3.2, roe: 22.1, roce: 18.4, de: 2.4, ph: 73.4, fii: 12.6, dii: 7.9, dy: 2.8, rg: 16, pg: 18, v: 1.0, d: 0.1 },
  { s: "PFC", n: "Power Finance Corp", sec: "Financial Services", ind: "Credit Services", p: 424, mc: 140000, pe: 6.4, pb: 1.3, roe: 20.8, roce: 12.6, de: 6.8, ph: 55.9, fii: 14.2, dii: 16.8, dy: 3.6, rg: 14, pg: 22, v: 1.2, d: 0.11, n50: true },
  { s: "RECLTD", n: "REC Ltd", sec: "Financial Services", ind: "Credit Services", p: 482, mc: 127000, pe: 6.9, pb: 1.5, roe: 22.4, roce: 13.4, de: 6.2, ph: 52.6, fii: 15.1, dii: 18.4, dy: 3.4, rg: 15, pg: 24, v: 1.2, d: 0.12, n50: true },
  { s: "SBILIFE", n: "SBI Life Insurance", sec: "Financial Services", ind: "Life Insurance", p: 1780, mc: 178000, pe: 74, pb: 9.8, roe: 14.2, roce: 12.1, de: 0.1, ph: 55.4, fii: 24.1, dii: 12.6, dy: 0.2, rg: 14, pg: 11, v: 0.9, d: 0.08, n50: true },
  { s: "HDFCLIFE", n: "HDFC Life Insurance", sec: "Financial Services", ind: "Life Insurance", p: 742, mc: 159000, pe: 82, pb: 8.9, roe: 11.4, roce: 10.2, de: 0.1, ph: 50.3, fii: 28.4, dii: 14.2, dy: 0.3, rg: 12, pg: 9, v: 0.95, d: 0.07, n50: true },
  { s: "ICICIPRULI", n: "ICICI Prudential Life", sec: "Financial Services", ind: "Life Insurance", p: 724, mc: 101000, pe: 58, pb: 8.2, roe: 13.1, roce: 11.6, de: 0.1, ph: 0, fii: 38.2, dii: 29.4, dy: 0.3, rg: 13, pg: 10, v: 1.0, d: 0.07 },
  { s: "LICI", n: "Life Insurance Corp of India", sec: "Financial Services", ind: "Life Insurance", p: 942, mc: 596000, pe: 13.8, pb: 9.1, roe: 68.2, roce: 42.1, de: 0, ph: 96.5, fii: 0.1, dii: 1.6, dy: 0.7, rg: 11, pg: 6, v: 0.95, d: 0.06 },
  { s: "HDFCAMC", n: "HDFC Asset Management", sec: "Financial Services", ind: "Asset Management", p: 4210, mc: 90000, pe: 44, pb: 10.2, roe: 24.6, roce: 31.4, de: 0, ph: 52.6, fii: 16.8, dii: 8.4, dy: 1.6, rg: 16, pg: 20, v: 0.95, d: 0.09 },
  { s: "ANGELONE", n: "Angel One", sec: "Financial Services", ind: "Capital Markets", p: 2620, mc: 24000, pe: 28, pb: 7.8, roe: 28.4, roce: 34.2, de: 0.4, ph: 58.1, fii: 13.6, dii: 6.4, dy: 0.6, rg: 28, pg: 42, v: 1.5, d: 0.08 },
  { s: "BSE", n: "BSE Ltd", sec: "Financial Services", ind: "Capital Markets", p: 2610, mc: 35000, pe: 58, pb: 12.4, roe: 21.4, roce: 26.8, de: 0, ph: 0, fii: 12.4, dii: 8.1, dy: 0.9, rg: 55, pg: 80, v: 1.6, d: 0.14 },
  { s: "CDSL", n: "Central Depository Services", sec: "Financial Services", ind: "Capital Markets", p: 1310, mc: 26000, pe: 46, pb: 11.2, roe: 24.8, roce: 29.6, de: 0, ph: 0, fii: 18.4, dii: 5.2, dy: 0.7, rg: 32, pg: 38, v: 1.5, d: 0.1 },
  { s: "POLICYBZR", n: "PB Fintech", sec: "Financial Services", ind: "Insurance Brokers", p: 1755, mc: 80000, pe: 118, pb: 8.4, roe: 6.4, roce: 7.8, de: 0.05, ph: 54.1, fii: 20.6, dii: 6.8, dy: 0, rg: 42, pg: 180, v: 1.6, d: 0.16, n50: true },
  { s: "PAYTM", n: "One97 Communications", sec: "Financial Services", ind: "Software - Application", p: 905, mc: 57000, pe: null, pb: 4.6, roe: -2.4, roce: -3.1, de: 0.02, ph: 0, fii: 22.4, dii: 9.1, dy: 0, rg: 24, pg: 145, v: 1.8, d: 0.1 },
  { s: "CANBK", n: "Canara Bank", sec: "Financial Services", ind: "Diversified Banks", p: 106, mc: 96000, pe: 5.9, pb: 1.0, roe: 15.8, roce: 9.4, de: 0, ph: 62.9, fii: 8.4, dii: 20.6, dy: 2.2, rg: 11, pg: 12, v: 1.15, d: 0.09 },
  { s: "PNB", n: "Punjab National Bank", sec: "Financial Services", ind: "Diversified Banks", p: 104, mc: 120000, pe: 8.2, pb: 1.1, roe: 13.4, roce: 7.8, de: 0, ph: 70.1, fii: 4.6, dii: 21.4, dy: 1.2, rg: 12, pg: 14, v: 1.25, d: 0.07 },
  { s: "BANKBARODA", n: "Bank of Baroda", sec: "Financial Services", ind: "Diversified Banks", p: 252, mc: 130000, pe: 7.1, pb: 1.0, roe: 14.6, roce: 8.9, de: 0, ph: 63.9, fii: 8.9, dii: 19.8, dy: 2.0, rg: 11, pg: 13, v: 1.15, d: 0.08 },
  { s: "UNIONBANK", n: "Union Bank of India", sec: "Financial Services", ind: "Diversified Banks", p: 132, mc: 97000, pe: 6.8, pb: 1.0, roe: 15.1, roce: 8.6, de: 0, ph: 74.8, fii: 6.2, dii: 18.9, dy: 2.4, rg: 10, pg: 12, v: 1.2, d: 0.07 },
  { s: "INDIANB", n: "Indian Bank", sec: "Financial Services", ind: "Diversified Banks", p: 578, mc: 79000, pe: 7.2, pb: 1.1, roe: 15.4, roce: 8.4, de: 0, ph: 79.2, fii: 4.1, dii: 15.6, dy: 2.1, rg: 12, pg: 11, v: 1.2, d: 0.08 },
  { s: "IDFCFIRSTB", n: "IDFC First Bank", sec: "Financial Services", ind: "Diversified Banks", p: 71, mc: 52000, pe: 26, pb: 1.0, roe: 3.9, roce: 4.6, de: 0, ph: 37.4, fii: 25.1, dii: 14.8, dy: 0, rg: 17, pg: 320, v: 1.4, d: 0.05 },
  { s: "FEDERALBNK", n: "Federal Bank", sec: "Financial Services", ind: "Diversified Banks", p: 212, mc: 82000, pe: 10.2, pb: 1.2, roe: 12.4, roce: 9.1, de: 0, ph: 0, fii: 39.8, dii: 30.4, dy: 0.8, rg: 13, pg: 12, v: 1.0, d: 0.1 },
  { s: "AUBANK", n: "AU Small Finance Bank", sec: "Financial Services", ind: "Regional Banks", p: 622, mc: 46000, pe: 21.8, pb: 2.6, roe: 12.1, roce: 10.4, de: 0, ph: 22.9, fii: 36.4, dii: 22.1, dy: 0.4, rg: 28, pg: 38, v: 1.2, d: 0.09 },
  { s: "LICHSGFIN", n: "LIC Housing Finance", sec: "Financial Services", ind: "Credit Services", p: 602, mc: 33000, pe: 11.8, pb: 1.0, roe: 8.9, roce: 7.2, de: 6.4, ph: 45.3, fii: 28.4, dii: 19.6, dy: 1.8, rg: 9, pg: 8, v: 1.1, d: 0.05 },

  // ── Technology ──────────────────────────────────────────
  { s: "TCS", n: "Tata Consultancy Services", sec: "Technology", ind: "IT Services", p: 3150, mc: 1140000, pe: 25.8, pb: 12.4, roe: 51.2, roce: 64.8, de: 0.07, ph: 71.8, fii: 12.4, dii: 10.9, dy: 1.5, rg: 6, pg: 8, v: 0.9, d: 0.1, n50: true },
  { s: "INFY", n: "Infosys", sec: "Technology", ind: "IT Services", p: 1560, mc: 648000, pe: 24.2, pb: 7.8, roe: 32.4, roce: 40.2, de: 0.09, ph: 14.6, fii: 33.4, dii: 37.2, dy: 2.1, rg: 6, pg: 9, v: 0.95, d: 0.11, n50: true },
  { s: "HCLTECH", n: "HCL Technologies", sec: "Technology", ind: "IT Services", p: 1662, mc: 451000, pe: 25.1, pb: 6.8, roe: 27.8, roce: 32.4, de: 0.08, ph: 60.8, fii: 19.6, dii: 14.2, dy: 2.6, rg: 7, pg: 10, v: 0.95, d: 0.1, n50: true },
  { s: "WIPRO", n: "Wipro", sec: "Technology", ind: "IT Services", p: 252, mc: 263000, pe: 21.4, pb: 3.4, roe: 15.9, roce: 18.2, de: 0.2, ph: 72.7, fii: 8.9, dii: 8.4, dy: 0.5, rg: 3, pg: 6, v: 1.0, d: 0.04, n50: true },
  { s: "TECHM", n: "Tech Mahindra", sec: "Technology", ind: "IT Services", p: 1524, mc: 149000, pe: 31.6, pb: 5.1, roe: 16.4, roce: 18.9, de: 0.1, ph: 35.1, fii: 24.8, dii: 32.6, dy: 1.4, rg: 2, pg: 45, v: 1.1, d: 0.06, n50: true },
  { s: "LTIM", n: "LTIMindtree", sec: "Technology", ind: "IT Services", p: 5620, mc: 166000, pe: 31.2, pb: 6.2, roe: 20.4, roce: 24.6, de: 0.05, ph: 68.6, fii: 11.2, dii: 11.4, dy: 0.9, rg: 8, pg: 12, v: 1.05, d: 0.08, n50: true },
  { s: "PERSISTENT", n: "Persistent Systems", sec: "Technology", ind: "IT Services", p: 5640, mc: 87000, pe: 64, pb: 14.2, roe: 23.4, roce: 28.1, de: 0.04, ph: 30.6, fii: 24.1, dii: 18.4, dy: 0.6, rg: 22, pg: 26, v: 1.3, d: 0.13 },
  { s: "MPHASIS", n: "Mphasis", sec: "Technology", ind: "IT Services", p: 2710, mc: 101000, pe: 29.4, pb: 5.8, roe: 20.4, roce: 24.2, de: 0.06, ph: 0, fii: 38.4, dii: 28.1, dy: 1.6, rg: 9, pg: 11, v: 1.05, d: 0.08 },
  { s: "COFORGE", n: "Coforge", sec: "Technology", ind: "IT Services", p: 8520, mc: 116000, pe: 55, pb: 12.1, roe: 22.4, roce: 26.8, de: 0.12, ph: 0, fii: 34.6, dii: 16.2, dy: 0.4, rg: 28, pg: 32, v: 1.35, d: 0.14 },
  { s: "KPITTECH", n: "KPIT Technologies", sec: "Technology", ind: "IT Services", p: 1410, mc: 38000, pe: 44, pb: 11.4, roe: 26.8, roce: 31.2, de: 0.03, ph: 39.2, fii: 26.4, dii: 14.1, dy: 0.5, rg: 24, pg: 30, v: 1.4, d: 0.12 },
  { s: "TATAELXSI", n: "Tata Elxsi", sec: "Technology", ind: "IT Services", p: 6210, mc: 39000, pe: 54, pb: 10.8, roe: 20.6, roce: 27.4, de: 0.02, ph: 43.1, fii: 17.4, dii: 13.6, dy: 1.2, rg: 6, pg: 2, v: 1.3, d: 0.02 },
  { s: "LTTS", n: "L&T Technology Services", sec: "Technology", ind: "IT Services", p: 5120, mc: 54000, pe: 34, pb: 7.2, roe: 21.4, roce: 25.6, de: 0.04, ph: 74.2, fii: 10.4, dii: 7.8, dy: 0.9, rg: 9, pg: 12, v: 1.15, d: 0.08 },
  { s: "OFSS", n: "Oracle Financial Services", sec: "Technology", ind: "Software - Application", p: 11240, mc: 97000, pe: 39, pb: 13.2, roe: 34.6, roce: 41.2, de: 0.01, ph: 0, fii: 29.4, dii: 21.6, dy: 2.2, rg: 12, pg: 14, v: 1.05, d: 0.1 },

  // ── Healthcare ──────────────────────────────────────────
  { s: "SUNPHARMA", n: "Sun Pharmaceutical", sec: "Healthcare", ind: "Drug Manufacturers", p: 1752, mc: 420000, pe: 35, pb: 5.6, roe: 16.8, roce: 19.4, de: 0.05, ph: 54.4, fii: 17.8, dii: 17.2, dy: 0.9, rg: 12, pg: 18, v: 0.9, d: 0.12, n50: true },
  { s: "DIVISLAB", n: "Divi's Laboratories", sec: "Healthcare", ind: "Drug Manufacturers", p: 5920, mc: 157000, pe: 75, pb: 11.2, roe: 15.4, roce: 17.8, de: 0.01, ph: 51.9, fii: 14.6, dii: 13.4, dy: 0.5, rg: 11, pg: 34, v: 1.0, d: 0.09, n50: true },
  { s: "DRREDDY", n: "Dr Reddy's Laboratories", sec: "Healthcare", ind: "Drug Manufacturers", p: 1254, mc: 105000, pe: 18.2, pb: 3.4, roe: 19.2, roce: 21.4, de: 0.09, ph: 26.7, fii: 17.1, dii: 20.8, dy: 1.1, rg: 12, pg: 14, v: 0.95, d: 0.1, n50: true },
  { s: "CIPLA", n: "Cipla", sec: "Healthcare", ind: "Drug Manufacturers", p: 1524, mc: 123000, pe: 23.8, pb: 4.2, roe: 18.4, roce: 21.2, de: 0.04, ph: 33.4, fii: 25.6, dii: 22.4, dy: 0.9, rg: 9, pg: 13, v: 0.9, d: 0.11, n50: true },
  { s: "LUPIN", n: "Lupin", sec: "Healthcare", ind: "Drug Manufacturers", p: 2054, mc: 93000, pe: 29.6, pb: 4.6, roe: 16.2, roce: 18.1, de: 0.16, ph: 35.2, fii: 19.4, dii: 19.8, dy: 0.6, rg: 16, pg: 38, v: 1.1, d: 0.11, n50: true },
  { s: "TORNTPHARM", n: "Torrent Pharmaceuticals", sec: "Healthcare", ind: "Drug Manufacturers", p: 3452, mc: 116000, pe: 55, pb: 9.4, roe: 17.4, roce: 19.8, de: 0.11, ph: 71.8, fii: 9.4, dii: 7.1, dy: 0.4, rg: 14, pg: 22, v: 0.95, d: 0.12 },
  { s: "ZYDUSLIFE", n: "Zydus Lifesciences", sec: "Healthcare", ind: "Drug Manufacturers", p: 982, mc: 99000, pe: 19.8, pb: 3.6, roe: 18.6, roce: 21.4, de: 0.05, ph: 74.8, fii: 8.6, dii: 8.4, dy: 0.8, rg: 14, pg: 16, v: 0.95, d: 0.1 },
  { s: "APOLLOHOSP", n: "Apollo Hospitals", sec: "Healthcare", ind: "Medical Care Facilities", p: 7210, mc: 104000, pe: 74, pb: 9.8, roe: 13.4, roce: 15.2, de: 0.28, ph: 29.3, fii: 34.2, dii: 22.1, dy: 0.3, rg: 14, pg: 46, v: 1.0, d: 0.13, n50: true },
  { s: "MAXHEALTH", n: "Max Healthcare Institute", sec: "Healthcare", ind: "Medical Care Facilities", p: 1102, mc: 107000, pe: 64, pb: 6.4, roe: 10.4, roce: 12.1, de: 0.12, ph: 39.5, fii: 34.6, dii: 19.8, dy: 0.3, rg: 18, pg: 24, v: 1.05, d: 0.12 },
  { s: "FORTIS", n: "Fortis Healthcare", sec: "Healthcare", ind: "Medical Care Facilities", p: 784, mc: 59000, pe: 58, pb: 4.6, roe: 8.2, roce: 9.4, de: 0.16, ph: 0, fii: 38.4, dii: 24.6, dy: 0.3, rg: 12, pg: 28, v: 1.05, d: 0.1 },
  { s: "ALKEM", n: "Alkem Laboratories", sec: "Healthcare", ind: "Drug Manufacturers", p: 5510, mc: 66000, pe: 39, pb: 6.2, roe: 16.4, roce: 18.9, de: 0.04, ph: 46.8, fii: 14.2, dii: 11.4, dy: 0.7, rg: 11, pg: 14, v: 0.9, d: 0.09 },
  { s: "ABBOTINDIA", n: "Abbott India", sec: "Healthcare", ind: "Drug Manufacturers", p: 30120, mc: 64000, pe: 54, pb: 15.4, roe: 29.4, roce: 34.6, de: 0.02, ph: 0, fii: 28.4, dii: 18.6, dy: 0.9, rg: 10, pg: 12, v: 0.85, d: 0.1 },
  { s: "GLENMARK", n: "Glenmark Pharmaceuticals", sec: "Healthcare", ind: "Drug Manufacturers", p: 1652, mc: 46000, pe: 29, pb: 4.1, roe: 14.6, roce: 16.4, de: 0.24, ph: 50.6, fii: 24.1, dii: 14.8, dy: 0.5, rg: 13, pg: 42, v: 1.15, d: 0.1 },
  { s: "IPCALAB", n: "Ipca Laboratories", sec: "Healthcare", ind: "Drug Manufacturers", p: 1810, mc: 45000, pe: 31, pb: 5.4, roe: 18.4, roce: 20.8, de: 0.05, ph: 43.4, fii: 21.6, dii: 12.4, dy: 0.6, rg: 15, pg: 24, v: 1.05, d: 0.1 },
  { s: "LAURUSLABS", n: "Laurus Labs", sec: "Healthcare", ind: "Drug Manufacturers", p: 552, mc: 37000, pe: 58, pb: 5.8, roe: 10.4, roce: 12.6, de: 0.08, ph: 35.1, fii: 27.4, dii: 15.2, dy: 0.2, rg: 14, pg: 65, v: 1.3, d: 0.08 },
  { s: "BIOCON", n: "Biocon", sec: "Healthcare", ind: "Biotechnology", p: 352, mc: 42000, pe: 41, pb: 3.2, roe: 7.8, roce: 8.9, de: 0.42, ph: 60.4, fii: 15.8, dii: 12.4, dy: 0.3, rg: 9, pg: 18, v: 1.1, d: 0.06 },
  { s: "SYNGENE", n: "Syngene International", sec: "Healthcare", ind: "Biotechnology", p: 802, mc: 32000, pe: 48, pb: 5.6, roe: 11.8, roce: 13.4, de: 0.06, ph: 69.9, fii: 12.4, dii: 9.8, dy: 0.3, rg: 11, pg: 12, v: 1.05, d: 0.06 },
  { s: "NATCOPHARM", n: "Natco Pharma", sec: "Healthcare", ind: "Drug Manufacturers", p: 1210, mc: 40000, pe: 31, pb: 4.8, roe: 16.2, roce: 18.4, de: 0.01, ph: 66.2, fii: 11.4, dii: 8.6, dy: 0.4, rg: 16, pg: 34, v: 1.2, d: 0.1 },

  // ── Consumer Cyclical ───────────────────────────────────
  { s: "MARUTI", n: "Maruti Suzuki India", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 12820, mc: 403000, pe: 27, pb: 4.6, roe: 17.2, roce: 21.4, de: 0.01, ph: 58.3, fii: 22.4, dii: 17.1, dy: 1.0, rg: 12, pg: 16, v: 0.9, d: 0.13, n50: true },
  { s: "TATAMOTORS", n: "Tata Motors", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 702, mc: 259000, pe: 10.4, pb: 3.1, roe: 31.4, roce: 21.8, de: 0.14, ph: 42.6, fii: 18.4, dii: 17.2, dy: 0.7, rg: 8, pg: -4, v: 1.25, d: 0.05, n50: true },
  { s: "M&M", n: "Mahindra & Mahindra", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 3005, mc: 374000, pe: 30.4, pb: 4.8, roe: 16.8, roce: 13.2, de: 0.61, ph: 18.6, fii: 27.4, dii: 25.8, dy: 0.6, rg: 18, pg: 26, v: 1.05, d: 0.15, n50: true },
  { s: "BAJAJ-AUTO", n: "Bajaj Auto", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 8710, mc: 243000, pe: 32, pb: 9.4, roe: 29.6, roce: 36.4, de: 0.01, ph: 55.0, fii: 14.8, dii: 10.4, dy: 1.7, rg: 16, pg: 21, v: 0.95, d: 0.12, n50: true },
  { s: "EICHERMOT", n: "Eicher Motors", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 5508, mc: 151000, pe: 33, pb: 6.8, roe: 21.4, roce: 26.2, de: 0.01, ph: 49.1, fii: 26.4, dii: 15.8, dy: 0.7, rg: 14, pg: 22, v: 0.95, d: 0.14, n50: true },
  { s: "HEROMOTOCO", n: "Hero MotoCorp", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 4302, mc: 86000, pe: 20.2, pb: 4.4, roe: 22.4, roce: 27.8, de: 0.02, ph: 34.8, fii: 29.4, dii: 21.6, dy: 2.1, rg: 9, pg: 12, v: 1.0, d: 0.09, n50: true },
  { s: "TVSMOTOR", n: "TVS Motor Company", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 2810, mc: 133000, pe: 56, pb: 12.4, roe: 22.8, roce: 26.4, de: 0.06, ph: 57.4, fii: 15.8, dii: 11.4, dy: 0.4, rg: 16, pg: 24, v: 1.05, d: 0.12 },
  { s: "ASHOKLEY", n: "Ashok Leyland", sec: "Consumer Cyclical", ind: "Auto Manufacturers", p: 232, mc: 68000, pe: 21, pb: 4.1, roe: 20.4, roce: 22.1, de: 0.28, ph: 51.9, fii: 16.4, dii: 19.2, dy: 0.9, rg: 10, pg: 14, v: 1.25, d: 0.09 },
  { s: "MOTHERSON", n: "Samvardhana Motherson", sec: "Consumer Cyclical", ind: "Auto Parts", p: 152, mc: 103000, pe: 25, pb: 2.4, roe: 10.4, roce: 12.1, de: 0.62, ph: 65.2, fii: 15.4, dii: 10.8, dy: 0.5, rg: 14, pg: 18, v: 1.15, d: 0.1, n50: true },
  { s: "TITAN", n: "Titan Company", sec: "Consumer Cyclical", ind: "Luxury Goods", p: 3502, mc: 311000, pe: 89, pb: 26.4, roe: 31.2, roce: 34.8, de: 0.34, ph: 52.9, fii: 18.4, dii: 14.6, dy: 0.4, rg: 22, pg: 24, v: 1.0, d: 0.13, n50: true },
  { s: "TRENT", n: "Trent", sec: "Consumer Cyclical", ind: "Department Stores", p: 5210, mc: 185000, pe: 122, pb: 34.2, roe: 28.4, roce: 32.1, de: 0.24, ph: 37.0, fii: 24.1, dii: 16.8, dy: 0.1, rg: 42, pg: 65, v: 1.25, d: 0.16, n50: true },
  { s: "DMART", n: "Avenue Supermarts", sec: "Consumer Defensive", ind: "Discount Stores", p: 4208, mc: 273000, pe: 94, pb: 13.2, roe: 14.6, roce: 17.4, de: 0.02, ph: 74.6, fii: 9.4, dii: 7.8, dy: 0, rg: 21, pg: 18, v: 1.0, d: 0.08, n50: true },
  { s: "NYKAA", n: "FSN E-Commerce (Nykaa)", sec: "Consumer Cyclical", ind: "Internet Retail", p: 202, mc: 58000, pe: 192, pb: 24.1, roe: 2.4, roce: 6.8, de: 0.03, ph: 52.3, fii: 14.6, dii: 4.2, dy: 0, rg: 24, pg: 88, v: 1.6, d: 0.08 },
  { s: "ETERNAL", n: "Eternal (Zomato)", sec: "Consumer Cyclical", ind: "Internet Retail", p: 282, mc: 266000, pe: 348, pb: 9.8, roe: 1.8, roce: 2.6, de: 0.01, ph: 0, fii: 44.2, dii: 16.4, dy: 0, rg: 64, pg: 260, v: 1.55, d: 0.14, n50: true },
  { s: "SWIGGY", n: "Swiggy", sec: "Consumer Cyclical", ind: "Internet Retail", p: 422, mc: 105000, pe: null, pb: 11.4, roe: -6.2, roce: -5.1, de: 0.01, ph: 35.1, fii: 22.4, dii: 8.1, dy: 0, rg: 38, pg: 120, v: 1.7, d: 0.04 },
  { s: "JUBLFOOD", n: "Jubilant FoodWorks", sec: "Consumer Cyclical", ind: "Restaurants", p: 702, mc: 46000, pe: 88, pb: 8.4, roe: 9.8, roce: 11.2, de: 0.28, ph: 41.2, fii: 28.4, dii: 20.1, dy: 0.2, rg: 26, pg: 32, v: 1.2, d: 0.09 },
  { s: "DEVYANI", n: "Devyani International", sec: "Consumer Cyclical", ind: "Restaurants", p: 174, mc: 65000, pe: 68, pb: 9.1, roe: 8.4, roce: 9.6, de: 0.18, ph: 56.8, fii: 22.1, dii: 9.4, dy: 0.2, rg: 28, pg: 34, v: 1.3, d: 0.08 },
  { s: "POLYCAB", n: "Polycab India", sec: "Industrials", ind: "Electrical Equipment", p: 6520, mc: 98000, pe: 41, pb: 8.4, roe: 21.4, roce: 26.1, de: 0.05, ph: 62.9, fii: 14.6, dii: 10.4, dy: 0.6, rg: 22, pg: 26, v: 1.05, d: 0.13, n50: true },
  { s: "HAVELLS", n: "Havells India", sec: "Industrials", ind: "Electrical Equipment", p: 1572, mc: 98000, pe: 56, pb: 10.2, roe: 18.6, roce: 22.4, de: 0.03, ph: 59.6, fii: 24.8, dii: 13.4, dy: 0.5, rg: 14, pg: 18, v: 1.0, d: 0.11 },
  { s: "VOLTAS", n: "Voltas", sec: "Industrials", ind: "Specialty Industrial Machinery", p: 1402, mc: 46000, pe: 41, pb: 6.8, roe: 16.4, roce: 15.1, de: 0.06, ph: 30.2, fii: 28.6, dii: 30.4, dy: 0.4, rg: 18, pg: 42, v: 1.15, d: 0.12 },
  { s: "DIXON", n: "Dixon Technologies", sec: "Consumer Cyclical", ind: "Electronic Components", p: 15120, mc: 90000, pe: 108, pb: 32.4, roe: 28.4, roce: 34.2, de: 0.18, ph: 32.6, fii: 21.4, dii: 16.8, dy: 0.1, rg: 52, pg: 68, v: 1.5, d: 0.16 },
  { s: "CROMPTON", n: "Crompton Greaves Consumer", sec: "Consumer Cyclical", ind: "Household Appliances", p: 332, mc: 42000, pe: 58, pb: 7.8, roe: 13.4, roce: 16.8, de: 0.03, ph: 0, fii: 34.2, dii: 26.4, dy: 0.5, rg: 9, pg: 14, v: 1.05, d: 0.08 },
  { s: "BLUESTARCO", n: "Blue Star", sec: "Industrials", ind: "Building Products", p: 1902, mc: 40000, pe: 52, pb: 10.4, roe: 20.4, roce: 24.8, de: 0.04, ph: 44.2, fii: 22.6, dii: 14.1, dy: 0.4, rg: 24, pg: 34, v: 1.1, d: 0.12 },
  { s: "KALYANKJIL", n: "Kalyan Jewellers", sec: "Consumer Cyclical", ind: "Luxury Goods", p: 552, mc: 51000, pe: 58, pb: 14.6, roe: 24.8, roce: 21.4, de: 0.36, ph: 53.1, fii: 15.4, dii: 6.2, dy: 0.2, rg: 34, pg: 42, v: 1.4, d: 0.13 },
  { s: "PAGEIND", n: "Page Industries", sec: "Consumer Cyclical", ind: "Apparel", p: 45020, mc: 50000, pe: 59, pb: 19.4, roe: 33.4, roce: 41.2, de: 0.01, ph: 0, fii: 24.6, dii: 16.4, dy: 0.6, rg: 12, pg: 16, v: 0.9, d: 0.08 },

  // ── Industrials ─────────────────────────────────────────
  { s: "LT", n: "Larsen & Toubro", sec: "Industrials", ind: "Engineering & Construction", p: 3602, mc: 495000, pe: 33, pb: 5.1, roe: 15.8, roce: 14.2, de: 1.14, ph: 0, fii: 22.4, dii: 37.6, dy: 0.9, rg: 16, pg: 18, v: 0.9, d: 0.14, n50: true },
  { s: "SIEMENS", n: "Siemens", sec: "Industrials", ind: "Specialty Industrial Machinery", p: 2812, mc: 199000, pe: 55, pb: 8.4, roe: 15.6, roce: 17.8, de: 0.08, ph: 75.0, fii: 9.4, dii: 6.8, dy: 0.6, rg: 14, pg: 46, v: 1.0, d: 0.13 },
  { s: "ABB", n: "ABB India", sec: "Industrials", ind: "Specialty Industrial Machinery", p: 5012, mc: 106000, pe: 62, pb: 12.8, roe: 21.4, roce: 24.6, de: 0.05, ph: 75.0, fii: 12.4, dii: 5.1, dy: 0.4, rg: 16, pg: 34, v: 1.05, d: 0.12 },
  { s: "CGPOWER", n: "CG Power & Industrial Solutions", sec: "Industrials", ind: "Electrical Equipment", p: 652, mc: 99000, pe: 82, pb: 12.4, roe: 16.4, roce: 19.8, de: 0.14, ph: 58.2, fii: 18.4, dii: 12.6, dy: 0.2, rg: 24, pg: 38, v: 1.3, d: 0.14 },
  { s: "HAL", n: "Hindustan Aeronautics", sec: "Industrials", ind: "Aerospace & Defense", p: 4302, mc: 288000, pe: 35, pb: 9.4, roe: 27.8, roce: 32.4, de: 0.01, ph: 71.6, fii: 12.4, dii: 12.8, dy: 0.8, rg: 12, pg: 16, v: 1.15, d: 0.15, n50: true },
  { s: "BEL", n: "Bharat Electronics", sec: "Industrials", ind: "Aerospace & Defense", p: 292, mc: 213000, pe: 45, pb: 11.4, roe: 25.4, roce: 31.2, de: 0.01, ph: 51.1, fii: 17.4, dii: 20.6, dy: 0.7, rg: 16, pg: 28, v: 1.15, d: 0.16, n50: true },
  { s: "BHARATFORG", n: "Bharat Forge", sec: "Industrials", ind: "Aerospace & Defense", p: 1302, mc: 60000, pe: 62, pb: 6.4, roe: 10.4, roce: 11.6, de: 0.22, ph: 45.2, fii: 19.4, dii: 13.8, dy: 0.4, rg: 18, pg: 34, v: 1.2, d: 0.1 },
  { s: "MAZDOCK", n: "Mazagon Dock Shipbuilders", sec: "Industrials", ind: "Aerospace & Defense", p: 2402, mc: 97000, pe: 44, pb: 9.8, roe: 22.6, roce: 26.4, de: 0.01, ph: 84.8, fii: 4.2, dii: 6.4, dy: 0.5, rg: 22, pg: 36, v: 1.35, d: 0.13 },
  { s: "COCHINSHIP", n: "Cochin Shipyard", sec: "Industrials", ind: "Aerospace & Defense", p: 1602, mc: 42000, pe: 41, pb: 9.2, roe: 23.4, roce: 27.1, de: 0.01, ph: 72.9, fii: 5.4, dii: 5.8, dy: 0.5, rg: 26, pg: 42, v: 1.4, d: 0.11 },
  { s: "BDL", n: "Bharat Dynamics", sec: "Industrials", ind: "Aerospace & Defense", p: 1202, mc: 44000, pe: 92, pb: 11.8, roe: 12.8, roce: 15.4, de: 0.01, ph: 74.9, fii: 3.4, dii: 8.2, dy: 0.3, rg: 28, pg: 44, v: 1.45, d: 0.1 },
  { s: "SOLARINDS", n: "Solar Industries India", sec: "Industrials", ind: "Aerospace & Defense", p: 9202, mc: 83000, pe: 62, pb: 14.2, roe: 23.4, roce: 26.8, de: 0.08, ph: 53.4, fii: 15.6, dii: 9.4, dy: 0.2, rg: 28, pg: 32, v: 1.2, d: 0.13 },
  { s: "CUMMINSIND", n: "Cummins India", sec: "Industrials", ind: "Specialty Industrial Machinery", p: 3102, mc: 85000, pe: 39, pb: 8.9, roe: 23.4, roce: 27.6, de: 0.02, ph: 51.0, fii: 24.1, dii: 14.6, dy: 1.4, rg: 15, pg: 28, v: 1.0, d: 0.12 },
  { s: "TITAGARH", n: "Titagarh Rail Systems", sec: "Industrials", ind: "Railroads", p: 902, mc: 31000, pe: 41, pb: 7.4, roe: 18.4, roce: 21.2, de: 0.06, ph: 43.7, fii: 14.6, dii: 9.8, dy: 0.3, rg: 32, pg: 38, v: 1.4, d: 0.1 },
  { s: "RVNL", n: "Rail Vikas Nigam", sec: "Industrials", ind: "Engineering & Construction", p: 372, mc: 77000, pe: 54, pb: 5.8, roe: 10.8, roce: 12.4, de: 0.72, ph: 72.8, fii: 6.2, dii: 8.4, dy: 0.4, rg: 12, pg: 14, v: 1.45, d: 0.08 },
  { s: "IRFC", n: "Indian Railway Finance Corp", sec: "Financial Services", ind: "Credit Services", p: 132, mc: 172000, pe: 28, pb: 3.4, roe: 12.6, roce: 6.8, de: 8.2, ph: 86.3, fii: 0.9, dii: 5.4, dy: 1.2, rg: 7, pg: 5, v: 1.35, d: 0.05 },
  { s: "IRCTC", n: "IRCTC", sec: "Industrials", ind: "Travel Services", p: 752, mc: 60000, pe: 45, pb: 12.6, roe: 28.4, roce: 34.2, de: 0.01, ph: 62.4, fii: 7.4, dii: 8.6, dy: 0.9, rg: 8, pg: 9, v: 1.1, d: 0.06 },
  { s: "ADANIPORTS", n: "Adani Ports & SEZ", sec: "Industrials", ind: "Marine Ports", p: 1352, mc: 292000, pe: 28, pb: 4.6, roe: 17.4, roce: 15.2, de: 0.86, ph: 65.8, fii: 14.2, dii: 12.4, dy: 0.4, rg: 18, pg: 26, v: 1.35, d: 0.13, n50: true },
  { s: "INDIGO", n: "InterGlobe Aviation", sec: "Industrials", ind: "Airlines", p: 5202, mc: 201000, pe: 25, pb: 22.4, roe: 68.4, roce: 42.1, de: 3.8, ph: 63.1, fii: 19.4, dii: 9.8, dy: 0.5, rg: 16, pg: 22, v: 1.1, d: 0.14, n50: true },
  { s: "GMRINFRA", n: "GMR Airports", sec: "Industrials", ind: "Airports & Air Services", p: 84, mc: 88000, pe: 68, pb: 4.2, roe: 6.4, roce: 7.2, de: 1.24, ph: 33.6, fii: 26.4, dii: 18.2, dy: 0.2, rg: 18, pg: 34, v: 1.5, d: 0.1 },
  { s: "BHEL", n: "Bharat Heavy Electricals", sec: "Industrials", ind: "Specialty Industrial Machinery", p: 232, mc: 81000, pe: 108, pb: 4.1, roe: 3.8, roce: 4.2, de: 0.28, ph: 63.1, fii: 6.4, dii: 19.8, dy: 0.3, rg: 9, pg: 42, v: 1.5, d: 0.07 },

  // ── Basic Materials ─────────────────────────────────────
  { s: "ULTRACEMCO", n: "UltraTech Cement", sec: "Basic Materials", ind: "Cement", p: 11520, mc: 829000, pe: 45, pb: 5.4, roe: 12.4, roce: 12.8, de: 0.34, ph: 59.9, fii: 17.4, dii: 14.2, dy: 0.6, rg: 14, pg: 22, v: 0.9, d: 0.12, n50: true },
  { s: "AMBUJACEM", n: "Ambuja Cements", sec: "Basic Materials", ind: "Cement", p: 582, mc: 143000, pe: 31, pb: 3.2, roe: 10.4, roce: 10.8, de: 0.12, ph: 70.3, fii: 10.4, dii: 8.6, dy: 0.5, rg: 9, pg: 32, v: 1.05, d: 0.1 },
  { s: "ACC", n: "ACC", sec: "Basic Materials", ind: "Cement", p: 2102, mc: 40000, pe: 38, pb: 3.4, roe: 9.4, roce: 9.8, de: 0.08, ph: 0, fii: 19.6, dii: 24.1, dy: 0.5, rg: 8, pg: 28, v: 1.05, d: 0.09 },
  { s: "SHREECEM", n: "Shree Cement", sec: "Basic Materials", ind: "Cement", p: 28010, mc: 101000, pe: 44, pb: 4.6, roe: 10.8, roce: 11.4, de: 0.09, ph: 62.5, fii: 13.4, dii: 9.8, dy: 0.7, rg: 10, pg: 18, v: 1.0, d: 0.09 },
  { s: "DALBHARAT", n: "Dalmia Bharat", sec: "Basic Materials", ind: "Cement", p: 2102, mc: 50000, pe: 39, pb: 3.1, roe: 8.4, roce: 8.9, de: 0.22, ph: 0, fii: 20.4, dii: 22.6, dy: 0.5, rg: 9, pg: 24, v: 1.05, d: 0.09 },
  { s: "TATASTEEL", n: "Tata Steel", sec: "Basic Materials", ind: "Steel", p: 162, mc: 201000, pe: 48, pb: 2.1, roe: 4.6, roce: 6.8, de: 1.12, ph: 33.1, fii: 19.4, dii: 26.8, dy: 2.2, rg: 3, pg: -12, v: 1.25, d: 0.03, n50: true },
  { s: "JSWSTEEL", n: "JSW Steel", sec: "Basic Materials", ind: "Steel", p: 1052, mc: 258000, pe: 44, pb: 3.2, roe: 7.4, roce: 9.6, de: 1.34, ph: 44.8, fii: 20.6, dii: 21.4, dy: 1.0, rg: 4, pg: -6, v: 1.2, d: 0.06, n50: true },
  { s: "HINDALCO", n: "Hindalco Industries", sec: "Basic Materials", ind: "Aluminum", p: 682, mc: 153000, pe: 9.2, pb: 1.4, roe: 15.4, roce: 12.4, de: 0.62, ph: 34.6, fii: 26.4, dii: 24.6, dy: 0.6, rg: 8, pg: 18, v: 1.15, d: 0.11, n50: true },
  { s: "VEDL", n: "Vedanta", sec: "Basic Materials", ind: "Diversified Metals", p: 462, mc: 181000, pe: 12.4, pb: 2.4, roe: 19.6, roce: 14.8, de: 1.24, ph: 56.3, fii: 11.2, dii: 16.8, dy: 5.2, rg: 6, pg: 8, v: 1.35, d: 0.07 },
  { s: "JINDALSTEL", n: "Jindal Steel & Power", sec: "Basic Materials", ind: "Steel", p: 952, mc: 116000, pe: 21, pb: 2.2, roe: 10.8, roce: 11.6, de: 0.92, ph: 61.1, fii: 16.4, dii: 14.6, dy: 0.5, rg: 8, pg: 16, v: 1.2, d: 0.09 },
  { s: "NMDC", n: "NMDC", sec: "Basic Materials", ind: "Steel", p: 72, mc: 63000, pe: 9.4, pb: 2.6, roe: 28.4, roce: 31.2, de: 0.08, ph: 60.8, fii: 12.4, dii: 20.6, dy: 3.4, rg: 4, pg: -8, v: 1.2, d: 0.05 },
  { s: "SAIL", n: "Steel Authority of India", sec: "Basic Materials", ind: "Steel", p: 122, mc: 51000, pe: 24, pb: 1.6, roe: 7.2, roce: 7.8, de: 0.84, ph: 65.2, fii: 8.4, dii: 19.4, dy: 0.8, rg: 5, pg: 12, v: 1.35, d: 0.04 },
  { s: "NATIONALUM", n: "National Aluminium", sec: "Basic Materials", ind: "Aluminum", p: 182, mc: 33000, pe: 8.4, pb: 2.1, roe: 25.4, roce: 27.2, de: 0.11, ph: 51.3, fii: 14.6, dii: 22.4, dy: 4.2, rg: 3, pg: -14, v: 1.25, d: 0.04 },
  { s: "HINDZINC", n: "Hindustan Zinc", sec: "Basic Materials", ind: "Diversified Metals", p: 462, mc: 195000, pe: 15.2, pb: 8.4, roe: 55.4, roce: 62.1, de: 0.66, ph: 63.9, fii: 11.4, dii: 12.8, dy: 6.8, rg: 12, pg: 48, v: 1.1, d: 0.1 },
  { s: "ASIANPAINT", n: "Asian Paints", sec: "Basic Materials", ind: "Specialty Chemicals", p: 2452, mc: 235000, pe: 51, pb: 12.4, roe: 24.6, roce: 31.2, de: 0.11, ph: 52.6, fii: 16.8, dii: 12.4, dy: 1.4, rg: 1, pg: -18, v: 0.95, d: 0.02, n50: true },
  { s: "BERGEPAINT", n: "Berger Paints India", sec: "Basic Materials", ind: "Specialty Chemicals", p: 502, mc: 58000, pe: 41, pb: 8.2, roe: 20.4, roce: 25.6, de: 0.08, ph: 0, fii: 28.4, dii: 24.6, dy: 1.0, rg: 5, pg: 6, v: 1.0, d: 0.06 },
  { s: "PIDILITIND", n: "Pidilite Industries", sec: "Basic Materials", ind: "Specialty Chemicals", p: 2902, mc: 148000, pe: 65, pb: 16.4, roe: 25.8, roce: 31.4, de: 0.04, ph: 69.7, fii: 13.4, dii: 8.9, dy: 0.6, rg: 8, pg: 9, v: 0.85, d: 0.08 },
  { s: "SRF", n: "SRF", sec: "Basic Materials", ind: "Specialty Chemicals", p: 2802, mc: 83000, pe: 61, pb: 5.8, roe: 9.8, roce: 11.2, de: 0.42, ph: 50.4, fii: 19.6, dii: 14.8, dy: 0.4, rg: 9, pg: 12, v: 1.15, d: 0.08 },
  { s: "UPL", n: "UPL", sec: "Basic Materials", ind: "Agricultural Inputs", p: 662, mc: 50000, pe: 31, pb: 1.8, roe: 6.4, roce: 8.1, de: 1.32, ph: 45.2, fii: 21.4, dii: 17.6, dy: 0.5, rg: 6, pg: 14, v: 1.25, d: 0.05 },
  { s: "PIIND", n: "PI Industries", sec: "Basic Materials", ind: "Agricultural Inputs", p: 3902, mc: 59000, pe: 45, pb: 6.8, roe: 15.4, roce: 17.8, de: 0.11, ph: 45.2, fii: 24.6, dii: 15.4, dy: 0.5, rg: 14, pg: 22, v: 1.05, d: 0.11 },
  { s: "COROMANDEL", n: "Coromandel International", sec: "Basic Materials", ind: "Agricultural Inputs", p: 1752, mc: 51000, pe: 26, pb: 4.2, roe: 16.4, roce: 18.6, de: 0.08, ph: 56.2, fii: 16.4, dii: 13.2, dy: 0.7, rg: 11, pg: 16, v: 1.05, d: 0.1 },
  { s: "ASTRAL", n: "Astral", sec: "Basic Materials", ind: "Building Products", p: 1502, mc: 40000, pe: 62, pb: 8.4, roe: 14.2, roce: 15.8, de: 0.15, ph: 53.6, fii: 17.4, dii: 12.6, dy: 0.3, rg: 12, pg: 14, v: 1.1, d: 0.07 },
  { s: "SUPREMEIND", n: "Supreme Industries", sec: "Basic Materials", ind: "Building Products", p: 4202, mc: 53000, pe: 51, pb: 8.1, roe: 16.4, roce: 18.9, de: 0.06, ph: 0, fii: 28.6, dii: 20.4, dy: 0.7, rg: 13, pg: 18, v: 1.0, d: 0.1 },

  // ── Consumer Defensive ──────────────────────────────────
  { s: "ITC", n: "ITC", sec: "Consumer Defensive", ind: "Tobacco", p: 412, mc: 515000, pe: 26, pb: 7.8, roe: 30.4, roce: 37.2, de: 0.01, ph: 0, fii: 42.4, dii: 41.6, dy: 3.2, rg: 7, pg: 8, v: 0.75, d: 0.11, n50: true },
  { s: "HINDUNILVR", n: "Hindustan Unilever", sec: "Consumer Defensive", ind: "Household & Personal Products", p: 2402, mc: 564000, pe: 52, pb: 10.4, roe: 20.4, roce: 26.1, de: 0.02, ph: 61.9, fii: 13.4, dii: 13.8, dy: 1.8, rg: 3, pg: 2, v: 0.7, d: 0.04, n50: true },
  { s: "NESTLEIND", n: "Nestle India", sec: "Consumer Defensive", ind: "Packaged Foods", p: 2302, mc: 222000, pe: 65, pb: 58.4, roe: 89.4, roce: 118.2, de: 0.08, ph: 62.8, fii: 11.4, dii: 8.2, dy: 1.4, rg: 6, pg: 5, v: 0.7, d: 0.06, n50: true },
  { s: "BRITANNIA", n: "Britannia Industries", sec: "Consumer Defensive", ind: "Packaged Foods", p: 5402, mc: 130000, pe: 55, pb: 15.4, roe: 28.6, roce: 38.4, de: 0.06, ph: 0, fii: 24.6, dii: 22.4, dy: 1.5, rg: 5, pg: 4, v: 0.8, d: 0.05, n50: true },
  { s: "VARUNBEV", n: "Varun Beverages", sec: "Consumer Defensive", ind: "Beverages", p: 502, mc: 168000, pe: 59, pb: 13.2, roe: 23.4, roce: 28.6, de: 0.34, ph: 62.6, fii: 26.4, dii: 5.8, dy: 0.5, rg: 24, pg: 28, v: 1.0, d: 0.13 },
  { s: "MARICO", n: "Marico", sec: "Consumer Defensive", ind: "Household & Personal Products", p: 652, mc: 84000, pe: 49, pb: 12.1, roe: 25.4, roce: 32.4, de: 0.02, ph: 59.5, fii: 24.6, dii: 12.4, dy: 1.6, rg: 8, pg: 12, v: 0.8, d: 0.09 },
  { s: "DABUR", n: "Dabur India", sec: "Consumer Defensive", ind: "Household & Personal Products", p: 502, mc: 89000, pe: 46, pb: 9.4, roe: 20.8, roce: 24.6, de: 0.09, ph: 66.2, fii: 19.4, dii: 10.6, dy: 1.2, rg: 6, pg: 7, v: 0.8, d: 0.06 },
  { s: "GODREJCP", n: "Godrej Consumer Products", sec: "Consumer Defensive", ind: "Household & Personal Products", p: 1202, mc: 116000, pe: 55, pb: 8.9, roe: 16.4, roce: 19.8, de: 0.09, ph: 63.3, fii: 24.1, dii: 13.4, dy: 1.8, rg: 7, pg: 9, v: 0.85, d: 0.08 },
  { s: "COLPAL", n: "Colgate-Palmolive (India)", sec: "Consumer Defensive", ind: "Household & Personal Products", p: 2402, mc: 66000, pe: 49, pb: 24.6, roe: 51.4, roce: 68.2, de: 0.02, ph: 0, fii: 24.6, dii: 18.4, dy: 1.6, rg: 5, pg: 6, v: 0.75, d: 0.06 },
  { s: "PGHH", n: "Procter & Gamble Health & Hygiene", sec: "Consumer Defensive", ind: "Household & Personal Products", p: 14020, mc: 46000, pe: 55, pb: 21.4, roe: 39.4, roce: 52.1, de: 0.01, ph: 70.6, fii: 12.4, dii: 6.8, dy: 1.4, rg: 4, pg: 3, v: 0.75, d: 0.04 },
  { s: "UNITEDSPIRITS", n: "United Spirits", sec: "Consumer Defensive", ind: "Beverages", p: 1502, mc: 109000, pe: 45, pb: 8.4, roe: 19.4, roce: 22.6, de: 0.12, ph: 56.7, fii: 21.4, dii: 12.6, dy: 0.8, rg: 8, pg: 11, v: 0.9, d: 0.1 },
  { s: "TATACONSUM", n: "Tata Consumer Products", sec: "Consumer Defensive", ind: "Packaged Foods", p: 1102, mc: 109000, pe: 71, pb: 4.6, roe: 6.4, roce: 7.8, de: 0.19, ph: 33.5, fii: 24.8, dii: 25.6, dy: 0.8, rg: 15, pg: 24, v: 0.9, d: 0.09, n50: true },

  // ── Communication Services ──────────────────────────────
  { s: "BHARTIARTL", n: "Bharti Airtel", sec: "Communication Services", ind: "Telecom Services", p: 1652, mc: 985000, pe: 40, pb: 9.2, roe: 23.4, roce: 18.6, de: 1.82, ph: 53.2, fii: 24.4, dii: 16.8, dy: 0.6, rg: 15, pg: 68, v: 0.9, d: 0.15, n50: true },
  { s: "IDEA", n: "Vodafone Idea", sec: "Communication Services", ind: "Telecom Services", p: 8.5, mc: 60000, pe: null, pb: -2.4, roe: -38.4, roce: -12.4, de: 4.2, ph: 74.2, fii: 8.4, dii: 5.6, dy: 0, rg: 2, pg: -24, v: 1.9, d: -0.12 },
  { s: "INDUSTOWER", n: "Indus Towers", sec: "Communication Services", ind: "Telecom Services", p: 332, mc: 88000, pe: 12.4, pb: 5.4, roe: 44.6, roce: 42.1, de: 0.62, ph: 69.9, fii: 28.4, dii: 14.6, dy: 1.8, rg: 5, pg: 38, v: 1.15, d: 0.08 },

  // ── Utilities ───────────────────────────────────────────
  { s: "NTPC", n: "NTPC", sec: "Utilities", ind: "Utilities - Regulated Electric", p: 342, mc: 331000, pe: 15.2, pb: 2.1, roe: 13.8, roce: 10.4, de: 1.54, ph: 51.1, fii: 12.6, dii: 24.8, dy: 2.2, rg: 6, pg: 10, v: 0.95, d: 0.1, n50: true },
  { s: "POWERGRID", n: "Power Grid Corp of India", sec: "Utilities", ind: "Utilities - Regulated Electric", p: 292, mc: 271000, pe: 17.2, pb: 3.1, roe: 18.4, roce: 13.6, de: 1.62, ph: 51.3, fii: 28.4, dii: 20.6, dy: 3.6, rg: 5, pg: 4, v: 0.85, d: 0.08, n50: true },
  { s: "TATAPOWER", n: "Tata Power", sec: "Utilities", ind: "Utilities - Diversified", p: 392, mc: 125000, pe: 31, pb: 4.1, roe: 13.4, roce: 12.1, de: 1.42, ph: 46.9, fii: 22.4, dii: 18.6, dy: 0.5, rg: 12, pg: 24, v: 1.05, d: 0.11 },
  { s: "NHPC", n: "NHPC", sec: "Utilities", ind: "Utilities - Regulated Electric", p: 86, mc: 86000, pe: 31, pb: 2.4, roe: 7.8, roce: 8.4, de: 1.12, ph: 70.9, fii: 7.4, dii: 12.6, dy: 2.4, rg: 7, pg: 14, v: 1.1, d: 0.06 },
  { s: "IEX", n: "Indian Energy Exchange", sec: "Utilities", ind: "Utilities - Regulated Electric", p: 182, mc: 16000, pe: 42, pb: 12.4, roe: 30.4, roce: 38.6, de: 0.01, ph: 0, fii: 34.6, dii: 18.4, dy: 0.8, rg: 14, pg: 16, v: 1.15, d: 0.07 },
  { s: "SJVN", n: "SJVN", sec: "Utilities", ind: "Utilities - Regulated Electric", p: 92, mc: 36000, pe: 42, pb: 2.1, roe: 5.1, roce: 5.8, de: 0.84, ph: 88.8, fii: 2.4, dii: 4.6, dy: 2.6, rg: 9, pg: 18, v: 1.3, d: 0.05 },

  // ── Real Estate ─────────────────────────────────────────
  { s: "DLF", n: "DLF", sec: "Real Estate", ind: "Real Estate Development", p: 782, mc: 193000, pe: 61, pb: 4.6, roe: 7.6, roce: 8.4, de: 0.14, ph: 74.1, fii: 17.4, dii: 7.8, dy: 0.6, rg: 18, pg: 26, v: 1.1, d: 0.11 },
  { s: "GODREJPROP", n: "Godrej Properties", sec: "Real Estate", ind: "Real Estate Development", p: 2402, mc: 72000, pe: 82, pb: 4.8, roe: 6.1, roce: 6.8, de: 0.56, ph: 59.2, fii: 24.6, dii: 12.4, dy: 0.2, rg: 34, pg: 48, v: 1.25, d: 0.09 },
  { s: "OBEROIRLTY", n: "Oberoi Realty", sec: "Real Estate", ind: "Real Estate Development", p: 1802, mc: 66000, pe: 61, pb: 5.4, roe: 9.2, roce: 10.1, de: 0.24, ph: 67.7, fii: 19.4, dii: 8.6, dy: 0.4, rg: 22, pg: 32, v: 1.1, d: 0.11 },
  { s: "PRESTIGE", n: "Prestige Estates Projects", sec: "Real Estate", ind: "Real Estate Development", p: 1402, mc: 70000, pe: 56, pb: 4.2, roe: 8.4, roce: 9.2, de: 0.68, ph: 62.4, fii: 18.6, dii: 10.4, dy: 0.2, rg: 28, pg: 36, v: 1.2, d: 0.1 },
  { s: "PHOENIXLTD", n: "The Phoenix Mills", sec: "Real Estate", ind: "Real Estate Development", p: 1602, mc: 58000, pe: 51, pb: 5.1, roe: 10.4, roce: 10.8, de: 0.72, ph: 37.4, fii: 26.4, dii: 16.8, dy: 0.3, rg: 16, pg: 22, v: 1.05, d: 0.1 },
  { s: "LODHA", n: "Macrotech Developers", sec: "Real Estate", ind: "Real Estate Development", p: 1202, mc: 120000, pe: 56, pb: 5.8, roe: 10.8, roce: 11.6, de: 0.64, ph: 71.9, fii: 19.6, dii: 8.4, dy: 0.2, rg: 26, pg: 38, v: 1.15, d: 0.12 },
  { s: "INDIHOTELS", n: "Indian Hotels Company", sec: "Consumer Cyclical", ind: "Lodging", p: 782, mc: 111000, pe: 61, pb: 6.4, roe: 10.8, roce: 12.4, de: 0.28, ph: 0, fii: 32.4, dii: 22.6, dy: 0.3, rg: 16, pg: 28, v: 1.05, d: 0.12 },
  { s: "CHALET", n: "Chalet Hotels", sec: "Real Estate", ind: "REIT - Hotel", p: 902, mc: 20000, pe: 72, pb: 4.8, roe: 6.8, roce: 7.4, de: 0.72, ph: 0, fii: 34.2, dii: 24.8, dy: 0.2, rg: 22, pg: 42, v: 1.15, d: 0.1 },
  { s: "LEMONTREE", n: "Lemon Tree Hotels", sec: "Consumer Cyclical", ind: "Lodging", p: 142, mc: 11000, pe: 46, pb: 4.6, roe: 10.2, roce: 10.8, de: 0.54, ph: 23.4, fii: 34.6, dii: 14.2, dy: 0.2, rg: 18, pg: 32, v: 1.2, d: 0.09 },
];

export const UNIVERSE_BY_SYMBOL: Record<string, StockSeed> = Object.fromEntries(
  UNIVERSE.map((s) => [s.s, s])
);

export const SECTORS = [...new Set(UNIVERSE.map((s) => s.sec))].sort();

export function findStock(symbol: string): StockSeed | undefined {
  const upper = symbol?.toUpperCase();
  return UNIVERSE_BY_SYMBOL[upper] ?? UNIVERSE.find((s) => s.n.toUpperCase() === upper);
}
