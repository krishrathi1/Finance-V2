// Assembles the full stock dashboard payload used by the stock detail view.

import { findStock, UNIVERSE } from "../market/universe";
import { getLiveQuote, getSeries, LiveQuote } from "../market/engine";
import { computeTechnicals } from "../analytics/technicals";
import { computeSmartScore, computeRiskScore } from "../analytics/scoring";
import { computeForensicAudit } from "../analytics/forensics";
import { getYearlyFinancials, getQuarterlyFinancials, getShareholding } from "../analytics/financials";
import { computeNewsForStock } from "../market/news";
import { mulberry32, hashString } from "../market/rng";

export interface CompetitorRow {
  symbol: string;
  name: string;
  marketCapCr: number;
  pe: number | null;
  pb: number;
  roe: number;
  price: number;
  changePercent: number;
}

export interface StockDashboard {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  exchange: "NSE";
  quote: LiveQuote;
  profile: {
    incorporationYear: number;
    headquarters: string;
    website: string;
    description: string;
    chairman: string;
    employees: number;
    listedSharesCr: number;
  };
  metrics: {
    marketCapCr: number;
    pe: number | null;
    pb: number;
    roe: number;
    roce: number;
    eps: number;
    bookValue: number;
    dividendYield: number;
    debtEquity: number;
    revenueCr: number;
    netProfitCr: number;
    faceValue: number;
    salesGrowth: number;
    profitGrowth: number;
  };
  smartScore: ReturnType<typeof computeSmartScore>;
  riskScore: ReturnType<typeof computeRiskScore>;
  forensics: ReturnType<typeof computeForensicAudit>;
  technicals: ReturnType<typeof computeTechnicals>;
  yearly: ReturnType<typeof getYearlyFinancials>;
  quarterly: ReturnType<typeof getQuarterlyFinancials>;
  shareholding: ReturnType<typeof getShareholding>;
  news: ReturnType<typeof computeNewsForStock>;
  competitors: CompetitorRow[];
  returns: { label: string; value: number }[];
  aiTarget: number;
  circuit: { upper: number; lower: number };
  updatedAt: string;
}

const HEADQUARTERS = ["Mumbai", "Bengaluru", "New Delhi", "Hyderabad", "Pune", "Chennai", "Ahmedabad", "Kolkata", "Gurugram", "Vadodara"];

export function loadDashboard(symbol: string): StockDashboard | null {
  const seed = findStock(symbol);
  if (!seed) return null;

  const quote = getLiveQuote(seed.s);
  if (!quote) return null;

  const rand = mulberry32(hashString(`profile-${seed.s}`));
  const smart = computeSmartScore(seed);
  const risk = computeRiskScore(seed);
  const tech = computeTechnicals(seed.s);

  const metrics = {
    marketCapCr: Math.round((quote.price / seed.p) * seed.mc),
    pe: seed.pe,
    pb: Math.round((quote.price / seed.p) * seed.pb * 100) / 100,
    roe: seed.roe,
    roce: seed.roce,
    eps: Math.round((seed.p / Math.max(1, seed.pe ?? 25)) * 10) / 10,
    bookValue: Math.round((seed.p / Math.max(0.3, seed.pb)) * 10) / 10,
    dividendYield: seed.dy,
    debtEquity: seed.de,
    revenueCr: Math.round(seed.mc / Math.max(1, seed.pe ?? 25) / Math.max(0.02, seed.roe / 4.5 / 100)),
    netProfitCr: Math.round(seed.mc / Math.max(1, seed.pe ?? 25)),
    faceValue: [1, 2, 5, 10][Math.floor(rand() * 4)],
    salesGrowth: seed.rg,
    profitGrowth: seed.pg,
  };

  const competitors: CompetitorRow[] = UNIVERSE.filter((s) => s.sec === seed.sec && s.s !== seed.s)
    .sort((a, b) => b.mc - a.mc)
    .slice(0, 6)
    .map((s) => {
      const q = getLiveQuote(s.s);
      return {
        symbol: s.s,
        name: s.n,
        marketCapCr: s.mc,
        pe: s.pe,
        pb: s.pb,
        roe: s.roe,
        price: q?.price ?? s.p,
        changePercent: q?.changePercent ?? 0,
      };
    });

  // AI-style target: blend of score momentum and mean reversion to 52W high
  const scoreBias = (smart.score - 2.5) / 2.5; // -1..1
  const aiTarget = Math.round(quote.price * (1 + 0.06 + scoreBias * 0.14 + (rand() - 0.4) * 0.06));

  return {
    symbol: seed.s,
    companyName: seed.n,
    sector: seed.sec,
    industry: seed.ind,
    exchange: "NSE",
    quote,
    profile: {
      incorporationYear: 1950 + Math.floor(rand() * 60),
      headquarters: HEADQUARTERS[Math.floor(rand() * HEADQUARTERS.length)],
      website: `www.${seed.s.toLowerCase().replace(/[^a-z]/g, "")}.co.in`,
      description: `${seed.n} is an India-based ${seed.ind.toLowerCase()} company operating in the ${seed.sec} space. The stock carries a Smart Score of ${smart.score.toFixed(1)}/5 (${smart.label}) and a risk rating of ${risk.label}. Return on equity stands at ${seed.roe}% with a debt/equity ratio of ${seed.de.toFixed(2)}.`,
      chairman: `${["N.","R.","S.","A.","M.","V."][Math.floor(rand() * 6)]} ${["Mehta", "Sharma", "Iyer", "Reddy", "Nair", "Joshi", "Bose", "Kulkarni"][Math.floor(rand() * 8)]}`,
      employees: Math.round(3000 + rand() * 90000),
      listedSharesCr: Math.round((seed.mc / seed.p) * 10) / 10,
    },
    metrics,
    smartScore: smart,
    riskScore: risk,
    forensics: computeForensicAudit(seed),
    technicals: tech,
    yearly: getYearlyFinancials(seed),
    quarterly: getQuarterlyFinancials(seed),
    shareholding: getShareholding(seed),
    news: computeNewsForStock(seed.s),
    competitors,
    returns: [
      { label: "1M", value: tech.return1M },
      { label: "3M", value: tech.return3M },
      { label: "6M", value: tech.return6M },
      { label: "1Y", value: tech.return1Y },
    ],
    aiTarget,
    circuit: {
      upper: Math.round(quote.prevClose * 1.1 * 20) / 20,
      lower: Math.round(quote.prevClose * 0.9 * 20) / 20,
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Compact row used by screener & compare */
export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  marketCapCr: number;
  pe: number | null;
  pb: number;
  roe: number;
  dividendYield: number;
  salesGrowth: number;
  profitGrowth: number;
  smartScore: number;
  riskScore: number;
}

const screenerCache = new Map<string, { bucket: string; rows: ScreenerRow[] }>();

export function getScreenerRows(): ScreenerRow[] {
  const bucket = `scr-${Math.floor(Date.now() / 60000)}`;
  const cached = screenerCache.get("all");
  if (cached && cached.bucket === bucket) return cached.rows;
  const rows = UNIVERSE.map((seed) => {
    const q = getLiveQuote(seed.s);
    const smart = computeSmartScore(seed);
    const risk = computeRiskScore(seed);
    const priceAdj = (q?.price ?? seed.p) / seed.p;
    return {
      symbol: seed.s,
      name: seed.n,
      sector: seed.sec,
      industry: seed.ind,
      price: q?.price ?? seed.p,
      changePercent: q?.changePercent ?? 0,
      marketCapCr: Math.round(seed.mc * priceAdj),
      pe: seed.pe,
      pb: Math.round(seed.pb * priceAdj * 100) / 100,
      roe: seed.roe,
      dividendYield: seed.dy,
      salesGrowth: seed.rg,
      profitGrowth: seed.pg,
      smartScore: smart.score,
      riskScore: risk.score,
    };
  });
  screenerCache.set("all", { bucket, rows });
  return rows;
}
