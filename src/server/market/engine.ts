// Deterministic market engine: generates the full price history for every
// stock from a fixed epoch to today. Prices are reproducible from
// (symbol, trading-day) seeds, share a common daily market factor (so
// breadth and correlation look real), mean-revert mildly toward the anchor
// price (so valuations stay plausible), and tick intraday while the market
// is open.

import { UNIVERSE, UNIVERSE_BY_SYMBOL, StockSeed, resolveStock } from "./universe";
import {
  hashString,
  mulberry32,
  gaussian,
  clamp,
  istNow,
  istDateKey,
  isMarketOpen,
  marketSessionProgress,
} from "./rng";

export interface PricePoint {
  date: string; // YYYY-MM-DD (IST)
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number; // shares
}

const EPOCH = "2020-06-01"; // ~5 years of history
const TRADING_DAYS_LIMIT = 1400;

/** Number of trading days between EPOCH and the given IST date. */
function tradingDaysBetween(fromKey: string, toKey: string): number {
  const from = new Date(fromKey + "T00:00:00");
  const to = new Date(toKey + "T00:00:00");
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to && count < 4000) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function dateKeyMinusTradingDays(key: string, days: number): string {
  const cursor = new Date(key + "T00:00:00");
  let count = 0;
  while (count < days && count < 4000) {
    cursor.setDate(cursor.getDate() - 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return istDateKey(cursor);
}

/** Common market factor for a trading-day index (seeded) */
function marketFactor(dayIndex: number): number {
  const rand = mulberry32(hashString(`mktx-${dayIndex}`));
  return gaussian(rand) * 0.0052 + 0.0003;
}

/** Full daily series for a symbol ending today (IST). Cached per day. */
const seriesCache = new Map<string, { dayKey: string; series: PricePoint[] }>();

export function getSeries(symbol: string): PricePoint[] {
  const seed = resolveStock(symbol);
  if (!seed) return [];
  const todayKey = istDateKey();
  const cached = seriesCache.get(symbol);
  if (cached && cached.dayKey === todayKey) return cached.series;

  const totalDays = Math.min(tradingDaysBetween(EPOCH, todayKey), TRADING_DAYS_LIMIT);
  const startKey = dateKeyMinusTradingDays(todayKey, totalDays);

  // Per-symbol deterministic parameters
  const symHash = hashString(symbol);
  const paramRand = mulberry32(symHash);
  const drift = seed.d + (paramRand() - 0.5) * 0.08; // annual drift ±4%
  const vol = seed.v * (0.145 + paramRand() * 0.05); // annualised vol
  const beta = 0.45 + seed.v * 0.45 + paramRand() * 0.15;

  const dailyDrift = drift / 252;
  const dailyVol = vol / Math.sqrt(252);
  const kappa = 0.0016; // mean reversion

  let price = seed.p * (0.72 + paramRand() * 0.2); // start below anchor
  const series: PricePoint[] = [];

  const cursor = new Date(startKey + "T00:00:00");
  const endDate = new Date(todayKey + "T00:00:00");
  let dayIndex = 0;

  while (cursor <= endDate && dayIndex < TRADING_DAYS_LIMIT) {
    const day = cursor.getDay();
    const dateKey = istDateKey(cursor);
    if (day !== 0 && day !== 6) {
      const rand = mulberry32(hashString(`${symbol}-${dateKey}`));
      const mf = marketFactor(dayIndex);
      const idio = gaussian(rand);
      const revert = kappa * Math.log(seed.p / price);
      let ret = dailyDrift + revert + beta * mf + dailyVol * idio;
      ret = clamp(ret, -0.11, 0.11);

      const open = price * (1 + gaussian(rand) * dailyVol * 0.35);
      const close = price * (1 + ret);
      const wick = Math.abs(gaussian(rand)) * dailyVol * 0.6;
      const high = Math.max(open, close) * (1 + wick);
      const low = Math.min(open, close) * (1 - wick);
      const sharesCr = seed.mc / seed.p;
      const volume = Math.round(
        sharesCr * 1e7 * (0.0008 + rand() * 0.004) * (1 + Math.abs(ret) * 12)
      );

      series.push({
        date: dateKey,
        open: round2(open),
        high: round2(high),
        low: round2(low),
        close: round2(close),
        volume,
      });
      price = close;
      dayIndex++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (seriesCache.size > 450) {
    // bound memory while browsing the full A–Z directory: drop oldest entries
    const firstKey = seriesCache.keys().next().value;
    if (firstKey !== undefined) seriesCache.delete(firstKey);
  }
  seriesCache.set(symbol, { dayKey: todayKey, series });
  return series;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Live quote. While the market is open, today's close is nudged by a
 * deterministic intraday walk keyed to 15-second buckets so a 20s poll
 * sees movement. Outside market hours it returns the last close.
 */
export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  change: number;
  changePercent: number;
  high52: number;
  low52: number;
  asOf: string;
}

const quoteCache = new Map<string, { bucket: string; quote: LiveQuote }>();

export function getLiveQuote(symbol: string): LiveQuote | null {
  const seed = resolveStock(symbol);
  const series = getSeries(symbol);
  if (!seed || series.length === 0) return null;

  const now = istNow();
  const open = isMarketOpen(now);
  const bucket = open
    ? `${istDateKey(now)}-${Math.floor(now.getTime() / 15000)}`
    : `closed-${istDateKey(now)}`;

  const cached = quoteCache.get(symbol);
  if (cached && cached.bucket === bucket) return cached.quote;

  const today = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : today;

  let price = today.close;
  let dayHigh = today.high;
  let dayLow = today.low;
  let volume = today.volume;
  let dayOpen = today.open;

  if (open) {
    const rand = mulberry32(hashString(`${symbol}-tick-${bucket}`));
    const progress = marketSessionProgress(now);
    // intraday drift from prev close to today's "target" close
    const target = today.close;
    const base = prev.close + (target - prev.close) * progress;
    const noise = gaussian(rand) * seed.v * 0.0022;
    price = round2(base * (1 + noise));
    dayHigh = Math.max(dayHigh, price);
    dayLow = Math.min(dayLow, price);
    volume = Math.round(today.volume * (0.3 + progress * 0.7));
  }

  const yearSlice = series.slice(-250);
  const high52 = round2(Math.max(...yearSlice.map((p) => p.high)));
  const low52 = round2(Math.min(...yearSlice.map((p) => p.low)));

  const quote: LiveQuote = {
    symbol,
    price,
    prevClose: prev.close,
    dayOpen,
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    volume,
    change: round2(price - prev.close),
    changePercent: prev.close ? round2(((price - prev.close) / prev.close) * 100) : 0,
    high52,
    low52,
    asOf: new Date().toISOString(),
  };

  if (quoteCache.size > 400) quoteCache.clear();
  quoteCache.set(symbol, { bucket, quote });
  return quote;
}

export interface TickerRow {
  symbol: string;
  name: string;
  exchange: "NSE";
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  sector: string;
}

export function getTicker(symbols?: string[]): TickerRow[] {
  const list = symbols?.length
    ? symbols.map((s) => UNIVERSE_BY_SYMBOL[s]).filter(Boolean)
    : UNIVERSE;
  return list.map((seed: StockSeed) => {
    const q = getLiveQuote(seed.s)!;
    return {
      symbol: seed.s,
      name: seed.n,
      exchange: "NSE" as const,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      dayHigh: q.dayHigh,
      dayLow: q.dayLow,
      volume: q.volume,
      sector: seed.sec,
    };
  });
}

/** Historical chart slice */
export function getChartSlice(symbol: string, range: string): PricePoint[] {
  const series = getSeries(symbol);
  const days =
    range === "1W" ? 6 : range === "1M" ? 22 : range === "6M" ? 130 : range === "1Y" ? 250 : range === "5Y" ? 1250 : 22;
  return series.slice(-days);
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

const INDEX_ANCHORS: Record<string, number> = {
  NIFTY50: 24500,
  SENSEX: 81500,
  NIFTYBANK: 56000,
  NIFTYIT: 43000,
  NIFTYFMCG: 58000,
  NIFTYPSE: 14500,
};

const indexCache = new Map<string, { dayKey: string; dates: string[]; levels: number[] }>();

/** Proportional cap-weighted index series, rescaled so 1Y ago ≈ anchor. */
function getIndexSeries(indexSymbol: string, constituents: StockSeed[]): { dates: string[]; levels: number[] } | null {
  if (constituents.length === 0) return null;
  const todayKey = istDateKey();
  const cached = indexCache.get(indexSymbol);
  if (cached && cached.dayKey === todayKey) return cached;

  const seriesBySymbol = constituents.map((c) => ({ cap: c.mc, series: getSeries(c.s) }));
  const len = Math.min(...seriesBySymbol.map((s) => s.series.length));
  const windowLen = Math.min(len, 252); // 1Y of trading days
  const startIdx = len - windowLen;

  const dates: string[] = [];
  const levels: number[] = [];
  for (let i = startIdx; i < len; i++) {
    let raw = 0;
    for (const { cap, series } of seriesBySymbol) {
      raw += cap * series[i].close;
    }
    dates.push(seriesBySymbol[0].series[i].date);
    levels.push(raw);
  }

  const anchor = INDEX_ANCHORS[indexSymbol] ?? 10000;
  const scale = anchor / (levels[0] || 1);
  const scaled = levels.map((l) => Math.round(l * scale * 100) / 100);

  const result = { dayKey: todayKey, dates, levels: scaled };
  indexCache.set(indexSymbol, result);
  return result;
}

/** Market-cap weighted index built live from constituents. */
export function getIndexQuote(
  indexSymbol: string,
  constituents: StockSeed[]
): IndexQuote | null {
  if (constituents.length === 0) return null;
  const hist = getIndexSeries(indexSymbol, constituents);
  if (!hist || hist.levels.length < 2) return null;

  const prevLevel = hist.levels[hist.levels.length - 2];

  // intraday: weight constituents' live moves vs their prev close
  let totalCap = 0;
  let weightedRet = 0;
  for (const c of constituents) {
    const q = getLiveQuote(c.s);
    if (!q || !q.prevClose) continue;
    totalCap += c.mc;
    weightedRet += c.mc * (q.price / q.prevClose - 1);
  }
  const intradayRet = totalCap > 0 ? weightedRet / totalCap : 0;
  const price = Math.round(prevLevel * (1 + intradayRet) * 100) / 100;

  return {
    symbol: indexSymbol,
    name: INDEX_NAMES[indexSymbol] ?? indexSymbol,
    price,
    change: Math.round((price - prevLevel) * 100) / 100,
    changePercent: Math.round(((price - prevLevel) / prevLevel) * 10000) / 100,
  };
}

export const INDEX_NAMES: Record<string, string> = {
  NIFTY50: "NIFTY 50",
  SENSEX: "BSE SENSEX",
  NIFTYBANK: "NIFTY BANK",
  NIFTYIT: "NIFTY IT",
  NIFTYFMCG: "NIFTY FMCG",
  NIFTYPSE: "NIFTY PSU",
};

const byMcap = [...UNIVERSE].sort((a, b) => b.mc - a.mc);

export const INDEX_CONSTITUENTS: Record<string, StockSeed[]> = {
  NIFTY50: UNIVERSE.filter((s) => s.n50),
  SENSEX: byMcap.slice(0, 30),
  NIFTYBANK: UNIVERSE.filter((s) =>
    ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "BAJFINANCE", "BAJAJFINSV", "SBILIFE", "HDFCLIFE", "PNB", "BANKBARODA", "CANBK", "IDFCFIRSTB", "FEDERALBNK", "AUBANK"].includes(s.s)
  ),
  NIFTYIT: UNIVERSE.filter((s) => s.sec === "Technology" && s.ind === "IT Services"),
  NIFTYFMCG: UNIVERSE.filter((s) => s.sec === "Consumer Defensive"),
  NIFTYPSE: UNIVERSE.filter(
    (s) => s.ph > 51 && ["Energy", "Utilities", "Financial Services", "Industrials", "Basic Materials", "Communication Services"].includes(s.sec)
  ),
};

export function getAllIndexQuotes(): IndexQuote[] {
  return Object.keys(INDEX_CONSTITUENTS)
    .map((k) => getIndexQuote(k, INDEX_CONSTITUENTS[k]))
    .filter((q): q is IndexQuote => q !== null);
}
