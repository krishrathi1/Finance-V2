import { getBatchQuotes, NSE_UNIVERSE, type UniverseQuote } from "@/lib/backend/providers/universe";
import { getYahooQuote } from "@/lib/backend/providers/yahoo";
import { DESKTOP_UA, round2 } from "@/lib/backend/http";

const NSE_EQUITY_LIST_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv";
const MARKET_UNIVERSE_CACHE_MS = 12 * 60 * 60_000;
const MARKET_TICKER_CACHE_MS = 30_000;

export type MarketIndexOption = {
  value: string;
  label: string;
  exchange: "NSE" | "BSE";
};

export type TickerRow = {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
  high?: number;
  low?: number;
  marketCap?: number;
  companyName?: string;
};

type MarketIndexDefinition = MarketIndexOption & {
  aliases: string[];
  yahooSymbol: string;
  officialConstituentUrls?: string[];
  fallbackSymbols: string[];
};

type ListedUniverseSnapshot = {
  symbols: string[];
  source: "nse-official" | "fallback";
  updatedAt: string;
};

export type LiveTickerSnapshot = {
  rows: TickerRow[];
  universeCount: number;
  source: "nse-official" | "fallback" | "requested";
  updatedAt: string;
};

let listedUniverseCache: { at: number; data: ListedUniverseSnapshot } | null = null;
let liveTickerCache: { at: number; data: LiveTickerSnapshot } | null = null;
let liveTickerPending: Promise<LiveTickerSnapshot> | null = null;

const NIFTY_50_FALLBACK = [
  "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
  "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL", "BHARTIARTL",
  "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL",
  "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO",
  "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK", "INFY",
  "ITC", "JIOFIN", "JSWSTEEL", "KOTAKBANK", "LT",
  "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
  "POWERGRID", "RELIANCE", "SBILIFE", "SHRIRAMFIN", "SBIN",
  "SUNPHARMA", "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS",
  "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO",
];

const NIFTY_BANK_FALLBACK = [
  "AUBANK", "AXISBANK", "BANKBARODA", "CANBK", "FEDERALBNK", "HDFCBANK",
  "ICICIBANK", "IDFCFIRSTB", "INDUSINDBK", "KOTAKBANK", "PNB", "SBIN",
];

const NIFTY_FINANCIAL_SERVICES_FALLBACK = [
  "AXISBANK", "BAJAJFINSV", "BAJFINANCE", "CHOLAFIN", "HDFCAMC",
  "HDFCBANK", "HDFCLIFE", "ICICIBANK", "ICICIGI", "ICICIPRULI",
  "JIOFIN", "KOTAKBANK", "LICI", "MUTHOOTFIN", "PFC", "RECLTD",
  "SBICARD", "SBILIFE", "SHRIRAMFIN", "SBIN",
];

const BSE_SENSEX_FALLBACK = [
  "ADANIPORTS", "ASIANPAINT", "AXISBANK", "BAJAJFINSV", "BAJFINANCE",
  "BHARTIARTL", "HCLTECH", "HDFCBANK", "HINDUNILVR", "ICICIBANK",
  "INFY", "ITC", "KOTAKBANK", "LT", "M&M", "MARUTI", "NTPC",
  "POWERGRID", "RELIANCE", "SBIN", "SUNPHARMA", "TATAMOTORS",
  "TATASTEEL", "TCS", "TECHM", "TITAN", "TRENT", "ULTRACEMCO",
  "ZOMATO", "ETERNAL",
];

const BSE_BANKEX_FALLBACK = [
  "AUBANK", "AXISBANK", "BANKBARODA", "CANBK", "FEDERALBNK",
  "HDFCBANK", "ICICIBANK", "INDUSINDBK", "KOTAKBANK", "SBIN",
];

const NIFTY_MIDCAP_100_FALLBACK = NSE_UNIVERSE
  .map((item) => item.symbol)
  .filter((symbol) => !NIFTY_50_FALLBACK.includes(symbol))
  .slice(0, 100);

const MARKET_INDEXES: MarketIndexDefinition[] = [
  {
    value: "NIFTY 50",
    label: "NIFTY 50",
    exchange: "NSE",
    aliases: ["NIFTY50", "NSEI"],
    yahooSymbol: "^NSEI",
    officialConstituentUrls: ["https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"],
    fallbackSymbols: NIFTY_50_FALLBACK,
  },
  {
    value: "NIFTY BANK",
    label: "NIFTY BANK",
    exchange: "NSE",
    aliases: ["BANKNIFTY", "NIFTYBANK", "NSEBANK"],
    yahooSymbol: "^NSEBANK",
    officialConstituentUrls: ["https://www.niftyindices.com/IndexConstituent/ind_niftybanklist.csv"],
    fallbackSymbols: NIFTY_BANK_FALLBACK,
  },
  {
    value: "NIFTY FINANCIAL SERVICES",
    label: "NIFTY FINANCIAL SERVICES",
    exchange: "NSE",
    aliases: ["NIFTYFIN", "NIFTY FIN SERVICE", "NIFTY FINANCIAL", "CNXFIN"],
    yahooSymbol: "^CNXFIN",
    officialConstituentUrls: [
      "https://www.niftyindices.com/IndexConstituent/ind_niftyfinancialserviceslist.csv",
      "https://www.niftyindices.com/IndexConstituent/ind_niftyfinancelist.csv",
    ],
    fallbackSymbols: NIFTY_FINANCIAL_SERVICES_FALLBACK,
  },
  {
    value: "NIFTY MIDCAP 100",
    label: "NIFTY MIDCAP 100",
    exchange: "NSE",
    aliases: ["NIFTYMIDCAP100", "NIFTY MIDCAP", "CNXMIDCAP"],
    yahooSymbol: "NIFTY_MIDCAP_100.NS",
    officialConstituentUrls: ["https://www.niftyindices.com/IndexConstituent/ind_niftymidcap100list.csv"],
    fallbackSymbols: NIFTY_MIDCAP_100_FALLBACK,
  },
  {
    value: "BSE SENSEX",
    label: "BSE SENSEX",
    exchange: "BSE",
    aliases: ["SENSEX", "BSESENSEX"],
    yahooSymbol: "^BSESN",
    fallbackSymbols: BSE_SENSEX_FALLBACK,
  },
  {
    value: "S&P BSE BANKEX",
    label: "S&P BSE BANKEX",
    exchange: "BSE",
    aliases: ["BSE BANKEX", "BANKEX", "SP BSE BANKEX"],
    yahooSymbol: "BSE-BANK.BO",
    fallbackSymbols: BSE_BANKEX_FALLBACK,
  },
];

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/&AMP;/g, "&")
    .replace(/[^A-Z0-9&.-]+/g, " ");
}

function normalizeSymbol(value: string) {
  return normalizeKey(value)
    .replace(/\.(NS|BO)$/i, "")
    .replace(/\s+/g, "")
    .trim();
}

function uniqueSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function getIndexDefinition(value: string) {
  const key = normalizeKey(value);
  const compact = key.replace(/\s+/g, "");
  return MARKET_INDEXES.find((index) => {
    const labelKey = normalizeKey(index.label);
    return (
      labelKey === key ||
      labelKey.replace(/\s+/g, "") === compact ||
      index.aliases.some((alias) => {
        const aliasKey = normalizeKey(alias);
        return aliasKey === key || aliasKey.replace(/\s+/g, "") === compact;
      })
    );
  }) || null;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseConstituentCsv(text: string) {
  if (!text || text.trim().startsWith("<") || /sitefinity|temporarily unavailable/i.test(text)) {
    return [];
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const symbolIndex = header.findIndex((cell) => cell === "symbol" || cell.endsWith(" symbol"));
  if (symbolIndex < 0) return [];

  return uniqueSymbols(
    lines.slice(1)
      .map((line) => parseCsvLine(line)[symbolIndex] || "")
      .filter(Boolean)
  );
}

function parseNseEquityListCsv(text: string) {
  if (!text || text.trim().startsWith("<")) return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const symbolIndex = header.findIndex((cell) => cell === "symbol");
  const seriesIndex = header.findIndex((cell) => cell === "series");
  if (symbolIndex < 0) return [];

  return uniqueSymbols(
    lines.slice(1)
      .map((line) => {
        const cells = parseCsvLine(line);
        const series = seriesIndex >= 0 ? String(cells[seriesIndex] || "").trim().toUpperCase() : "EQ";
        const symbol = cells[symbolIndex] || "";
        // Keep listed equity-like series; Yahoo quietly drops symbols it cannot quote.
        if (series && !["EQ", "BE", "BZ", "SM", "ST", "SZ", "RR"].includes(series)) return "";
        return symbol;
      })
      .filter(Boolean)
  );
}

export async function getListedIndianSymbols(refresh = false): Promise<ListedUniverseSnapshot> {
  if (!refresh && listedUniverseCache && Date.now() - listedUniverseCache.at < MARKET_UNIVERSE_CACHE_MS) {
    return listedUniverseCache.data;
  }

  try {
    const response = await fetch(NSE_EQUITY_LIST_URL, {
      cache: "no-store",
      headers: {
        "user-agent": DESKTOP_UA,
        accept: "text/csv,text/plain,*/*",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (response.ok) {
      const symbols = parseNseEquityListCsv(await response.text());
      if (symbols.length > 500) {
        const data: ListedUniverseSnapshot = {
          symbols,
          source: "nse-official",
          updatedAt: new Date().toISOString(),
        };
        listedUniverseCache = { at: Date.now(), data };
        return data;
      }
    }
  } catch {
    /* use fallback below */
  }

  const data: ListedUniverseSnapshot = {
    symbols: uniqueSymbols(NSE_UNIVERSE.map((item) => item.symbol)),
    source: "fallback",
    updatedAt: new Date().toISOString(),
  };
  listedUniverseCache = { at: Date.now(), data };
  return data;
}

async function fetchOfficialSymbols(definition: MarketIndexDefinition) {
  for (const url of definition.officialConstituentUrls || []) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4500);
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "user-agent": DESKTOP_UA,
          accept: "text/csv,text/plain,*/*",
          referer: "https://www.niftyindices.com/",
        },
      });
      if (!response.ok) continue;
      const symbols = parseConstituentCsv(await response.text());
      if (symbols.length >= Math.min(8, definition.fallbackSymbols.length)) {
        return symbols;
      }
    } catch {
      /* try next source */
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return [];
}

function rowFromUniverseQuote(quote: UniverseQuote): TickerRow {
  const row: TickerRow = {
    symbol: quote.symbol,
    cmp: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    marketCap: quote.marketCap,
    companyName: quote.companyName,
  };
  if (typeof quote.high === "number" && quote.high > 0) row.high = quote.high;
  if (typeof quote.low === "number" && quote.low > 0) row.low = quote.low;
  return row;
}

async function fetchYahooSparkRows(symbols: string[]) {
  const out = new Map<string, TickerRow>();
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));

  await runWithConcurrency(batches, 6, async (batch) => {
    const yahooSymbols = batch.map((symbol) => `${symbol}.NS`);
    const url =
      `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(yahooSymbols.join(","))}` +
      "&range=1d&interval=1d&indicators=close";
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "user-agent": DESKTOP_UA, accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return;
      const payload = await response.json();
      const results: any[] = payload?.spark?.result || [];
      for (const result of results) {
        const symbol = normalizeSymbol(result?.symbol || "");
        const meta = result?.response?.[0]?.meta || {};
        const cmp = Number(meta.regularMarketPrice);
        const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose);
        if (!symbol || !Number.isFinite(cmp) || cmp <= 0) continue;
        const change = Number.isFinite(prevClose) ? round2(cmp - prevClose) ?? 0 : 0;
        const changePercent = Number.isFinite(prevClose) && prevClose !== 0
          ? round2(((cmp - prevClose) / prevClose) * 100) ?? 0
          : 0;
        const high = round2(meta.regularMarketDayHigh);
        const low = round2(meta.regularMarketDayLow);
        out.set(symbol, {
          symbol,
          cmp: round2(cmp) ?? cmp,
          change,
          changePercent,
          ...(high ? { high } : {}),
          ...(low ? { low } : {}),
        });
      }
    } catch {
      /* skip batch */
    }
  });

  return out;
}

export async function getLiveTickerSnapshot(refresh = false): Promise<LiveTickerSnapshot> {
  const cacheFresh =
    liveTickerCache && Date.now() - liveTickerCache.at < MARKET_TICKER_CACHE_MS;
  if (!refresh && cacheFresh) return liveTickerCache!.data;
  if (refresh && cacheFresh) return liveTickerCache!.data;
  if (liveTickerPending) return liveTickerPending;

  liveTickerPending = (async () => {
    const universe = await getListedIndianSymbols(refresh);
    const quoteMap = await fetchYahooSparkRows(universe.symbols);
    const rows = universe.symbols
      .map((symbol) => quoteMap.get(symbol))
      .filter((row): row is TickerRow => Boolean(row && row.cmp > 0))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const snapshot: LiveTickerSnapshot = {
      rows,
      universeCount: universe.symbols.length,
      source: universe.source,
      updatedAt: new Date().toISOString(),
    };
    liveTickerCache = { at: Date.now(), data: snapshot };
    return snapshot;
  })();

  try {
    return await liveTickerPending;
  } finally {
    liveTickerPending = null;
  }
}

async function getLiveStockRows(symbols: string[]) {
  const normalized = uniqueSymbols(symbols);
  const quoteMap = await getBatchQuotes(normalized);
  const rowsBySymbol = new Map<string, TickerRow>();

  for (const quote of quoteMap.values()) {
    rowsBySymbol.set(quote.symbol, rowFromUniverseQuote(quote));
  }

  const missing = normalized.filter((symbol) => !rowsBySymbol.has(symbol));
  if (missing.length) {
    const sparkRows = await fetchYahooSparkRows(missing);
    for (const [symbol, row] of sparkRows) {
      if (!rowsBySymbol.has(symbol)) rowsBySymbol.set(symbol, row);
    }
  }

  return normalized
    .map((symbol) => rowsBySymbol.get(symbol))
    .filter((row): row is TickerRow => Boolean(row && row.cmp > 0));
}

async function getIndexConstituentSymbols(definition: MarketIndexDefinition) {
  const official = await fetchOfficialSymbols(definition);
  if (official.length) {
    return { symbols: official, source: "official" as const };
  }
  return { symbols: uniqueSymbols(definition.fallbackSymbols), source: "fallback" as const };
}

export function getMarketIndexOptions(): MarketIndexOption[] {
  return MARKET_INDEXES.map(({ value, label, exchange }) => ({ value, label, exchange }));
}

export async function getLiveIndexTicker(indexName: string): Promise<TickerRow | null> {
  const definition = getIndexDefinition(indexName);
  if (!definition) return null;
  const quote = await getYahooQuote(definition.yahooSymbol);
  if (!quote?.cmp || quote.cmp <= 0) return null;
  return {
    symbol: definition.label,
    cmp: quote.cmp,
    change: quote.change ?? 0,
    changePercent: quote.changePercent ?? 0,
  };
}

export async function getLiveTickerRows(requestedSymbols: string[], options: { refresh?: boolean } = {}) {
  const requested = uniqueSymbols(requestedSymbols);
  if (!requested.length) {
    return (await getLiveTickerSnapshot(Boolean(options.refresh))).rows;
  }

  const symbols = requested.length ? requested : NSE_UNIVERSE.map((item) => item.symbol);

  const indexInputs = symbols.filter((symbol) => getIndexDefinition(symbol));
  const stockInputs = symbols.filter((symbol) => !getIndexDefinition(symbol));

  const [stockRows, indexRows] = await Promise.all([
    stockInputs.length ? getLiveStockRows(stockInputs) : Promise.resolve([]),
    Promise.all(indexInputs.map((symbol) => getLiveIndexTicker(symbol))),
  ]);

  const rowsBySymbol = new Map<string, TickerRow>();
  for (const row of stockRows) rowsBySymbol.set(normalizeSymbol(row.symbol), row);
  for (const row of indexRows) {
    if (row) rowsBySymbol.set(normalizeSymbol(row.symbol), row);
  }

  return symbols
    .map((symbol) => rowsBySymbol.get(normalizeSymbol(symbol)))
    .filter((row): row is TickerRow => Boolean(row));
}

export async function getLiveIndexHeatmap(indexName: string) {
  const definition = getIndexDefinition(indexName) || MARKET_INDEXES[0];
  const { symbols, source } = await getIndexConstituentSymbols(definition);
  const rows = (await getLiveStockRows(symbols))
    .sort((a, b) => b.changePercent - a.changePercent);

  return {
    indexName: definition.label,
    updatedAt: new Date().toISOString(),
    rows,
    source,
    constituentCount: symbols.length,
  };
}
