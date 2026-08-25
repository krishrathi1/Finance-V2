// Assembles the full stock dashboard payload used by the stock detail view.

import { findStock, UNIVERSE, StockSeed } from "../market/universe";
import { getLiveQuote, LiveQuote } from "../market/engine";
import { computeTechnicals } from "../analytics/technicals";
import { computeSmartScore, computeRiskScore } from "../analytics/scoring";
import { computeForensicAudit } from "../analytics/forensics";
import { getYearlyFinancials, getQuarterlyFinancials, getShareholding } from "../analytics/financials";
import { computeNewsForStock } from "../market/news";
import { mulberry32, hashString, clamp } from "../market/rng";

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

export interface KeyRatios {
  valuation: {
    pe: number | null;
    pb: number;
    peg: number;
    evEbitda: number;
    evSales: number;
    dividendYield: number;
  };
  profitability: {
    roe: number;
    roce: number;
    roa: number;
    grossMargin: number;
    opm: number;
    npm: number;
  };
  leverage: {
    debtEquity: number;
    currentRatio: number;
    quickRatio: number;
    interestCoverage: number;
  };
  efficiency: {
    assetTurnover: number;
    inventoryDays: number;
    receivableDays: number;
  };
}

export interface DividendYear {
  year: string;
  dps: number;
  payout: number;
  yield: number;
}

export interface CorporateAction {
  date: string;
  type: "Bonus" | "Split" | "Buyback" | "Dividend" | "Rights";
  detail: string;
}

export interface RiskProfile {
  beta: number;
  alpha: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  volatilityAnn: number;
  var95: number;
  rSquared: number;
}

export interface PeerValuationRow {
  symbol: string;
  name: string;
  marketCapCr: number;
  pe: number | null;
  pb: number;
  evEbitda: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  price: number;
  changePercent: number;
}

export interface PeerMedian {
  pe: number | null;
  pb: number;
  evEbitda: number;
  roe: number;
  expensive: "Cheap" | "Fair" | "Expensive";
}

export interface FundamentalSignal {
  label: string;
  pass: boolean;
  detail: string;
}

export interface BrokerReport {
  broker: string;
  rating: string;
  target: number;
  date: string;
  summary: string;
}

export interface BrokerageSummary {
  consensus: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensusTarget: number;
  upsidePct: number;
  reports: BrokerReport[];
}

export interface QuarterlyRow {
  quarter: string;
  revenue: number;
  ebitda: number;
  ebitdaMargin: number;
  pat: number;
  patMargin: number;
  eps: number;
  yoyGrowth: number;
  estimate: number;
  surprisePct: number;
}

export interface StockDashboard {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  exchange: "NSE" | "BSE";
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
  keyRatios: KeyRatios;
  dividendHistory: DividendYear[];
  corporateActions: CorporateAction[];
  riskProfile: RiskProfile;
  peerValuation: PeerValuationRow[];
  peerMedian: PeerMedian;
  fundamentalSignals: FundamentalSignal[];
  brokerage: BrokerageSummary;
  quarterlyExtended: QuarterlyRow[];
  updatedAt: string;
}

const HEADQUARTERS = ["Mumbai", "Bengaluru", "New Delhi", "Hyderabad", "Pune", "Chennai", "Ahmedabad", "Kolkata", "Gurugram", "Vadodara"];

const BROKERS = [
  "Motilal Oswal",
  "ICICI Securities",
  "Kotak Institutional",
  "Edelweiss",
  "HDFC Securities",
  "CLSA",
];

const SECTOR_BETA: Record<string, [number, number]> = {
  "Consumer Defensive": [0.6, 0.95],
  "Utilities": [0.65, 1.0],
  "Healthcare": [0.7, 1.05],
  "Technology": [0.85, 1.2],
  "Financial Services": [0.95, 1.3],
  "Communication Services": [0.9, 1.25],
  "Energy": [0.8, 1.15],
  "Basic Materials": [0.9, 1.35],
  "Consumer Cyclical": [1.0, 1.45],
  "Industrials": [0.95, 1.4],
  "Real Estate": [1.05, 1.45],
};

const SECTOR_GM: Record<string, [number, number]> = {
  "Consumer Defensive": [45, 65],
  "Healthcare": [40, 60],
  "Technology": [38, 58],
  "Basic Materials": [28, 52],
  "Energy": [12, 32],
  "Utilities": [30, 48],
  "Financial Services": [22, 42],
  "Communication Services": [35, 55],
  "Consumer Cyclical": [20, 42],
  "Industrials": [22, 45],
  "Real Estate": [25, 50],
};

function round1(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

/** Compute KeyRatios deterministically from the seed. */
function computeKeyRatios(seed: StockSeed): KeyRatios {
  const rand = mulberry32(hashString(`ratios-${seed.s}`));
  const pe = seed.pe;
  const pb = seed.pb;
  const roe = seed.roe;
  const roce = seed.roce;
  const dy = seed.dy;
  const de = seed.de;
  const pg = Math.max(1, seed.pg);

  const peg = pe !== null && pg > 0 ? round2(pe / pg) : 0;
  const evEbitda = pe !== null ? round2(pe * 0.7) : 0;
  const evSales = round2(pb * 0.4);

  const roa = round2(roe * 0.6);
  const gmRange = SECTOR_GM[seed.sec] ?? [28, 50];
  const grossMargin = round1(gmRange[0] + rand() * (gmRange[1] - gmRange[0]));
  const opm = round1(Math.max(2, roe / 4.5 - 3 + (rand() - 0.5) * 2));
  const npm = round1(Math.max(1, roe / 6 - 4 + (rand() - 0.5) * 2));

  const currentRatio = round2(1.1 + rand() * 1.4);
  const quickRatio = round2(currentRatio * 0.7);
  const interestCoverage = round2(Math.max(2, 12 - de * 4 + (rand() - 0.4) * 3));

  const assetTurnover = round2(0.4 + rand() * 0.8);
  const inventoryDays = Math.round(30 + rand() * 80);
  const receivableDays = Math.round(30 + rand() * 80);

  return {
    valuation: { pe, pb, peg, evEbitda, evSales, dividendYield: dy },
    profitability: { roe, roce, roa, grossMargin, opm, npm },
    leverage: { debtEquity: de, currentRatio, quickRatio, interestCoverage },
    efficiency: { assetTurnover, inventoryDays, receivableDays },
  };
}

/** Compute 10-year dividend history. */
function computeDividendHistory(seed: StockSeed): DividendYear[] {
  const rand = mulberry32(hashString(`div-${seed.s}`));
  const out: DividendYear[] = [];
  const currentYear = new Date().getFullYear();
  const dy = seed.dy;
  // Use last close as proxy for price
  const price = seed.p;

  for (let i = 9; i >= 0; i--) {
    const year = currentYear - i;
    // Slight upward drift in yield over the years
    const yieldAdj = Math.max(0, dy * (0.6 + (10 - i) * 0.04) + (rand() - 0.5) * 0.4);
    const dps = round2((yieldAdj / 100) * price);
    // Payout grows over time
    const payoutGrowth = (10 - i) * 1.2;
    const payout = round1(clamp(15 + payoutGrowth + (rand() - 0.5) * 12, 5, 75));
    out.push({
      year: `FY${String(year).slice(2)}`,
      dps,
      payout,
      yield: round2(yieldAdj),
    });
  }
  return out;
}

/** Compute 6-10 corporate actions over 10 years. */
function computeCorporateActions(seed: StockSeed, dividendHistory: DividendYear[]): CorporateAction[] {
  const rand = mulberry32(hashString(`actions-${seed.s}`));
  const actions: CorporateAction[] = [];
  const currentYear = new Date().getFullYear();

  // Add a dividend event per year (using the dividendHistory)
  for (let i = 0; i < dividendHistory.length; i++) {
    const dy = dividendHistory[i];
    const year = currentYear - (dividendHistory.length - 1 - i);
    const month = 5 + Math.floor(rand() * 4); // Jun-Sep (typical dividend season)
    const day = 1 + Math.floor(rand() * 28);
    actions.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      type: "Dividend",
      detail: `Final dividend ₹${dy.dps.toFixed(2)} per share (payout ${dy.payout.toFixed(0)}%)`,
    });
  }

  // Occasional bonus/split/buyback/rights
  const extraCount = 1 + Math.floor(rand() * 3); // 1-3 extra events
  for (let i = 0; i < extraCount; i++) {
    const year = currentYear - 1 - Math.floor(rand() * 8);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const roll = rand();
    let type: CorporateAction["type"];
    let detail: string;
    if (roll < 0.35) {
      const ratio1 = 1 + Math.floor(rand() * 3);
      const ratio2 = 1 + Math.floor(rand() * 3);
      type = "Bonus";
      detail = `Bonus issue of ${ratio1}:${ratio2} (1 share for every ${ratio2} held)`;
    } else if (roll < 0.6) {
      const from = 10 / Math.pow(2, 1 + Math.floor(rand() * 3));
      const to = from / Math.pow(2, 1 + Math.floor(rand() * 3));
      type = "Split";
      detail = `Stock split from face value ₹${from.toFixed(0)} to ₹${to.toFixed(0)}`;
    } else if (roll < 0.85) {
      const buybackPrice = Math.round(seed.p * (1.1 + rand() * 0.4));
      const buybackCr = Math.round(seed.mc * 0.02 * (1 + rand()));
      type = "Buyback";
      detail = `Buyback at ₹${buybackPrice} per share (₹${buybackCr} Cr)`;
    } else {
      const rightsPrice = Math.round(seed.p * (0.75 + rand() * 0.15));
      type = "Rights";
      detail = `Rights issue at ₹${rightsPrice} per share (2:5 ratio)`;
    }
    actions.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      type,
      detail,
    });
  }

  // Sort newest first
  actions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  // Cap at 10 events (deterministic truncation: prefer newest)
  return actions.slice(0, 10);
}

/** Compute RiskProfile. */
function computeRiskProfile(seed: StockSeed, technicals: ReturnType<typeof computeTechnicals>, price: number): RiskProfile {
  const rand = mulberry32(hashString(`risk-${seed.s}`));
  const betaRange = SECTOR_BETA[seed.sec] ?? [0.8, 1.2];
  const beta = round2(betaRange[0] + rand() * (betaRange[1] - betaRange[0]));
  const alpha = round2((beta - 1) * (1 + rand()) * 2);
  const sharpe = round2(0.3 + rand() * 1.5);
  const sortino = round2(sharpe * 1.4);
  const maxDrawdown = round1(Math.abs(technicals.drawdown1Y) * (1.5 + rand() * 1.5));
  const volatilityAnn = round1(technicals.volatility3M);
  // One-day 95% VaR in ₹
  const var95 = round2(1.65 * (volatilityAnn / 100) / Math.sqrt(252) * price);
  const rSquared = round2(0.4 + rand() * 0.45);
  return { beta, alpha, sharpe, sortino, maxDrawdown, volatilityAnn, var95, rSquared };
}

/** Compute extended peer valuation table (6-8 peers). */
function computePeerValuation(seed: StockSeed): { rows: PeerValuationRow[]; median: PeerMedian } {
  const peers = UNIVERSE.filter((s) => s.sec === seed.sec && s.s !== seed.s)
    .sort((a, b) => b.mc - a.mc)
    .slice(0, 7);

  const rows: PeerValuationRow[] = peers.map((s) => {
    const rand = mulberry32(hashString(`peer-${s.s}`));
    const q = getLiveQuote(s.s);
    return {
      symbol: s.s,
      name: s.n,
      marketCapCr: s.mc,
      pe: s.pe,
      pb: s.pb,
      evEbitda: s.pe !== null ? round2(s.pe * 0.7) : 0,
      roe: s.roe,
      revenueGrowth: s.rg,
      profitGrowth: s.pg,
      price: q?.price ?? s.p,
      changePercent: q?.changePercent ?? 0,
    };
  });

  // Add the current stock as the first row (for the highlight effect)
  const currentRow: PeerValuationRow = {
    symbol: seed.s,
    name: seed.n,
    marketCapCr: seed.mc,
    pe: seed.pe,
    pb: seed.pb,
    evEbitda: seed.pe !== null ? round2(seed.pe * 0.7) : 0,
    roe: seed.roe,
    revenueGrowth: seed.rg,
    profitGrowth: seed.pg,
    price: getLiveQuote(seed.s)?.price ?? seed.p,
    changePercent: getLiveQuote(seed.s)?.changePercent ?? 0,
  };
  const allRows = [currentRow, ...rows].slice(0, 8);

  // Compute medians from peers (excluding current stock)
  const peerPEs = rows.map((r) => r.pe).filter((p): p is number => p !== null);
  const peerPBs = rows.map((r) => r.pb);
  const peerEvs = rows.map((r) => r.evEbitda);
  const peerRoes = rows.map((r) => r.roe);

  const medPE = peerPEs.length > 0 ? round2(median(peerPEs)) : null;
  const medPB = round2(median(peerPBs));
  const medEv = round2(median(peerEvs));
  const medRoe = round2(median(peerRoes));

  let expensive: PeerMedian["expensive"] = "Fair";
  if (seed.pe !== null && medPE !== null) {
    if (seed.pe < medPE * 0.85) expensive = "Cheap";
    else if (seed.pe > medPE * 1.15) expensive = "Expensive";
  }

  return {
    rows: allRows,
    median: { pe: medPE, pb: medPB, evEbitda: medEv, roe: medRoe, expensive },
  };
}

/** Compute fundamental signals (10 checks). */
function computeFundamentalSignals(
  seed: StockSeed,
  smartScore: ReturnType<typeof computeSmartScore>,
  keyRatios: KeyRatios
): FundamentalSignal[] {
  const signals: FundamentalSignal[] = [
    {
      label: "ROE > 15%",
      pass: seed.roe > 15,
      detail: `ROE at ${seed.roe.toFixed(1)}% ${seed.roe > 15 ? "exceeds" : "is below"} the 15% quality threshold.`,
    },
    {
      label: "Debt/Equity < 0.5",
      pass: seed.de < 0.5,
      detail: `D/E of ${seed.de.toFixed(2)} ${seed.de < 0.5 ? "indicates low leverage" : "is elevated"}.`,
    },
    {
      label: "Profit growth > 10%",
      pass: seed.pg > 10,
      detail: `Profit growing at ${seed.pg.toFixed(0)}% YoY ${seed.pg > 10 ? "is strong" : "is modest"}.`,
    },
    {
      label: "Sales growth > 8%",
      pass: seed.rg > 8,
      detail: `Revenue growth at ${seed.rg.toFixed(0)}% ${seed.rg > 8 ? "is healthy" : "is below 8%"}.`,
    },
    {
      label: "P/E < 25 (or loss-making)",
      pass: seed.pe === null || seed.pe < 25,
      detail:
        seed.pe === null
          ? "Company is loss-making at the net level."
          : seed.pe < 25
            ? `P/E of ${seed.pe.toFixed(1)} is reasonable.`
            : `P/E of ${seed.pe.toFixed(1)} is richly valued.`,
    },
    {
      label: "Dividend yield > 1%",
      pass: seed.dy > 1,
      detail: `Dividend yield of ${seed.dy.toFixed(1)}% ${seed.dy > 1 ? "is shareholder-friendly" : "is low"}.`,
    },
    {
      label: "Promoter holding > 50%",
      pass: seed.ph > 50,
      detail: `Promoter holding at ${seed.ph.toFixed(1)}% ${seed.ph > 50 ? "shows skin-in-the-game" : "is below 50%"}.`,
    },
    {
      label: "ROCE > ROE",
      pass: seed.roce > seed.roe,
      detail: `ROCE ${seed.roce.toFixed(1)}% vs ROE ${seed.roe.toFixed(1)}% — ${seed.roce > seed.roe ? "operations cheaper than equity" : "leverage lifting ROE"}.`,
    },
    {
      label: "Interest coverage > 3x",
      pass: keyRatios.leverage.interestCoverage > 3,
      detail: `Interest coverage of ${keyRatios.leverage.interestCoverage.toFixed(1)}x ${keyRatios.leverage.interestCoverage > 3 ? "is comfortable" : "warrants monitoring"}.`,
    },
    {
      label: "Smart Score >= 3.5",
      pass: smartScore.score >= 3.5,
      detail: `Smart Score of ${smartScore.score.toFixed(1)} / 5 ${smartScore.score >= 3.5 ? "is bullish" : "is moderate"}.`,
    },
  ];
  return signals;
}

/** Compute brokerage summary from smart score. */
function computeBrokerage(
  seed: StockSeed,
  smartScore: ReturnType<typeof computeSmartScore>,
  price: number,
  aiTarget: number
): BrokerageSummary {
  const rand = mulberry32(hashString(`broker-${seed.s}`));
  const score = smartScore.score;

  let consensus: BrokerageSummary["consensus"];
  if (score >= 4) consensus = "Strong Buy";
  else if (score >= 3.3) consensus = "Buy";
  else if (score >= 2.6) consensus = "Hold";
  else if (score >= 2) consensus = "Sell";
  else consensus = "Strong Sell";

  // Distribute 10 reports across the 5 buckets, with bias matching consensus.
  const bias = {
    "Strong Buy": [5, 3, 2, 0, 0],
    "Buy": [2, 4, 3, 1, 0],
    "Hold": [1, 2, 4, 2, 1],
    "Sell": [0, 1, 2, 4, 3],
    "Strong Sell": [0, 0, 1, 3, 6],
  } as const;
  const [strongBuy, buy, hold, sell, strongSell] = bias[consensus];
  const total = strongBuy + buy + hold + sell + strongSell;

  // Build rating buckets matching the consensus distribution
  const ratingByBucket = ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"] as const;
  const counts = [strongBuy, buy, hold, sell, strongSell];

  const reports: BrokerReport[] = [];
  // 4-6 reports: pick brokers deterministically and assign ratings based on bucket distribution
  const brokerCount = Math.min(6, Math.max(4, 4 + Math.floor(rand() * 3)));
  // Re-scale counts to brokerCount so each broker gets a meaningful rating
  const scale = brokerCount / total;
  const scaledCounts = counts.map((c) => Math.max(0, Math.round(c * scale)));
  // Build a flat list of ratings in priority order, then assign brokers
  const ratingList: BrokerReport["rating"][] = [];
  for (let i = 0; i < scaledCounts.length; i++) {
    for (let j = 0; j < scaledCounts[i]; j++) {
      ratingList.push(ratingByBucket[i]);
    }
  }
  // If scaling produced fewer ratings than brokers, pad with consensus rating
  while (ratingList.length < brokerCount) ratingList.push(consensus);
  // If scaling produced more, trim
  ratingList.length = brokerCount;

  // Sort ratings by index of priority in the bucket order (so strongest first)
  const bucketOrder: Record<string, number> = { "Strong Buy": 0, "Buy": 1, "Hold": 2, "Sell": 3, "Strong Sell": 4 };
  ratingList.sort((a, b) => bucketOrder[a] - bucketOrder[b]);

  const summaries = [
    "Strong fundamentals and improving return ratios.",
    "Solid execution; expect margin expansion ahead.",
    "Valued at fair multiples; maintain accumulated position.",
    "Near-term pressure on growth but long-term thesis intact.",
    "Rich valuations limit upside; recommend accumulate on dips.",
    "Operating deleveraging should drive double-digit EPS CAGR.",
  ];

  const monthsAgo = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  };

  // Targets clustered around aiTarget with deterministic per-broker variance
  const targetByRating: Record<string, [number, number]> = {
    "Strong Buy": [aiTarget * 1.05, aiTarget * 1.18],
    "Buy": [aiTarget * 0.98, aiTarget * 1.1],
    "Hold": [aiTarget * 0.92, aiTarget * 1.02],
    "Sell": [aiTarget * 0.82, aiTarget * 0.95],
    "Strong Sell": [aiTarget * 0.7, aiTarget * 0.88],
  };

  for (let i = 0; i < brokerCount; i++) {
    const broker = BROKERS[i % BROKERS.length];
    const rating = ratingList[i];
    const [lo, hi] = targetByRating[rating];
    const target = Math.round((lo + rand() * (hi - lo)) * 100) / 100;
    reports.push({
      broker,
      rating,
      target,
      date: monthsAgo(Math.floor(rand() * 6)),
      summary: summaries[Math.floor(rand() * summaries.length)],
    });
  }

  // Consensus target = median of all targets
  const allTargets = reports.map((r) => r.target);
  const consensusTarget = Math.round(median(allTargets) * 100) / 100;
  const upsidePct = price > 0 ? round2(((consensusTarget - price) / price) * 100) : 0;

  return {
    consensus,
    strongBuy,
    buy,
    hold,
    sell,
    strongSell,
    consensusTarget,
    upsidePct,
    reports,
  };
}

/** Compute extended quarterly results with EBITDA + surprise fields. */
function computeQuarterlyExtended(seed: StockSeed, quarterly: ReturnType<typeof getQuarterlyFinancials>): QuarterlyRow[] {
  const rand = mulberry32(hashString(`qext-${seed.s}`));
  const sharesCr = seed.mc / seed.p;
  const out: QuarterlyRow[] = [];
  // Data arrives oldest → newest (8 qtrs); display newest-first by reversing.
  const ordered = [...quarterly].reverse();

  for (let i = 0; i < ordered.length; i++) {
    const q = ordered[i];
    // EBITDA = PAT + interest + tax + D&A (synthesized)
    const interest = Math.max(0, q.netProfit * 0.18 * seed.de * 0.5);
    const tax = q.netProfit > 0 ? q.netProfit * 0.25 : 0;
    const da = q.revenue * 0.04;
    const ebitda = q.netProfit + interest + tax + da;
    const ebitdaMargin = q.revenue > 0 ? round1((ebitda / q.revenue) * 100) : 0;
    const patMargin = q.revenue > 0 ? round1((q.netProfit / q.revenue) * 100) : 0;
    const eps = Math.round((q.netProfit / sharesCr) * 10) / 10;
    // yoyGrowth vs same quarter prev yr (use quarterly.growthYoY which is revenue YoY)
    const yoy = q.growthYoY;
    const estimate = Math.round(q.netProfit * (0.92 + rand() * 0.16) * 10) / 10;
    const surprisePct = estimate > 0 ? round2(((q.netProfit - estimate) / estimate) * 100) : 0;
    out.push({
      quarter: q.quarter,
      revenue: Math.round(q.revenue * 10) / 10,
      ebitda: Math.round(ebitda * 10) / 10,
      ebitdaMargin,
      pat: Math.round(q.netProfit * 10) / 10,
      patMargin,
      eps,
      yoyGrowth: yoy,
      estimate,
      surprisePct,
    });
  }
  return out;
}

export function loadDashboard(symbol: string): StockDashboard | null {
  const seed = findStock(symbol);
  if (!seed) return null;

  const quote = getLiveQuote(seed.s);
  if (!quote) return null;

  const rand = mulberry32(hashString(`profile-${seed.s}`));
  const smart = computeSmartScore(seed);
  const risk = computeRiskScore(seed);
  const tech = computeTechnicals(seed.s);
  const quarterly = getQuarterlyFinancials(seed);

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

  // New computed fields
  const keyRatios = computeKeyRatios(seed);
  const dividendHistory = computeDividendHistory(seed);
  const corporateActions = computeCorporateActions(seed, dividendHistory);
  const riskProfile = computeRiskProfile(seed, tech, quote.price);
  const { rows: peerValuation, median: peerMedian } = computePeerValuation(seed);
  const fundamentalSignals = computeFundamentalSignals(seed, smart, keyRatios);
  const brokerage = computeBrokerage(seed, smart, quote.price, aiTarget);
  const quarterlyExtended = computeQuarterlyExtended(seed, quarterly);

  return {
    symbol: seed.s,
    companyName: seed.n,
    sector: seed.sec,
    industry: seed.ind,
    exchange: seed.ex ?? "NSE",
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
    quarterly,
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
    keyRatios,
    dividendHistory,
    corporateActions,
    riskProfile,
    peerValuation,
    peerMedian,
    fundamentalSignals,
    brokerage,
    quarterlyExtended,
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
