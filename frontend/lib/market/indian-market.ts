import { getYahooQuote } from "@/lib/backend/providers/yahoo";
import { DESKTOP_UA, round2 } from "@/lib/backend/http";

const FMP_HOST = "https://financialmodelingprep.com";
const NSE_EQUITY_LIST_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv";
const BSE_API_HOST = "https://api.bseindia.com";
const BSE_ACTIVE_EQUITY_LIST_URL =
  `${BSE_API_HOST}/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active`;
const BSE_INDEX_LIST_URL = `${BSE_API_HOST}/BseIndiaAPI/api/IndexList/w`;
const BSE_INDEX_MOVERS_URL = `${BSE_API_HOST}/BseIndiaAPI/api/IndexMovers/w`;
const BSE_HEATMAP_URL = `${BSE_API_HOST}/BseIndiaAPI/api/HeatMapData/w`;

const MARKET_UNIVERSE_CACHE_MS = 12 * 60 * 60_000;
const MARKET_TICKER_CACHE_MS = 30_000;
const MARKET_INDEX_CACHE_MS = 10 * 60_000;

type Exchange = "NSE" | "BSE";
type UniverseSource = "fmp" | "nse-bse-official" | "nse-official" | "bse-official";
type QuoteSource = "fmp" | "yahoo" | "fmp+yahoo";

export type MarketIndexOption = {
  value: string;
  label: string;
  exchange: Exchange;
};

export type TickerRow = {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
  exchange?: Exchange;
  high?: number;
  low?: number;
  marketCap?: number;
  companyName?: string;
};

type MarketIndexDefinition = MarketIndexOption & {
  kind: Exchange;
  aliases: string[];
  yahooSymbol?: string;
  bseIndexCode?: string;
  officialConstituentUrls?: string[];
};

type ListedSecurity = {
  symbol: string;
  exchange: Exchange;
  yahooSymbol: string;
  fmpSymbol: string;
  companyName?: string;
};

type ListedUniverseSnapshot = {
  symbols: string[];
  securities: ListedSecurity[];
  source: UniverseSource;
  updatedAt: string;
};

export type LiveTickerSnapshot = {
  rows: TickerRow[];
  universeCount: number;
  source: UniverseSource;
  quoteSource: QuoteSource;
  updatedAt: string;
};

let listedUniverseCache: { at: number; data: ListedUniverseSnapshot } | null = null;
let liveTickerCache: { at: number; data: LiveTickerSnapshot } | null = null;
let liveTickerPending: Promise<LiveTickerSnapshot> | null = null;
let bseIndexCache: { at: number; data: MarketIndexDefinition[] } | null = null;
// Last-known-good constituent list per index, keyed by index value. Index
// membership barely changes intraday, so a transient niftyindices.com
// failure should fall back to this instead of returning an empty heatmap.
const officialSymbolsCache = new Map<string, { at: number; symbols: string[] }>();
const OFFICIAL_SYMBOLS_STALE_MS = 24 * 60 * 60_000;

const NSE_INDEXES: MarketIndexDefinition[] = [
  {
    value: "NIFTY 50",
    label: "NIFTY 50",
    exchange: "NSE",
    kind: "NSE",
    aliases: ["NIFTY50", "NSEI"],
    yahooSymbol: "^NSEI",
    officialConstituentUrls: ["https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"],
  },
  {
    value: "NIFTY BANK",
    label: "NIFTY BANK",
    exchange: "NSE",
    kind: "NSE",
    aliases: ["BANKNIFTY", "NIFTYBANK", "NSEBANK"],
    yahooSymbol: "^NSEBANK",
    officialConstituentUrls: ["https://www.niftyindices.com/IndexConstituent/ind_niftybanklist.csv"],
  },
  {
    value: "NIFTY FINANCIAL SERVICES",
    label: "NIFTY FINANCIAL SERVICES",
    exchange: "NSE",
    kind: "NSE",
    aliases: ["NIFTYFIN", "NIFTY FIN SERVICE", "NIFTY FINANCIAL", "CNXFIN"],
    yahooSymbol: "^CNXFIN",
    officialConstituentUrls: [
      "https://www.niftyindices.com/IndexConstituent/ind_niftyfinancialserviceslist.csv",
      "https://www.niftyindices.com/IndexConstituent/ind_niftyfinancelist.csv",
    ],
  },
  {
    value: "NIFTY MIDCAP 100",
    label: "NIFTY MIDCAP 100",
    exchange: "NSE",
    kind: "NSE",
    aliases: ["NIFTYMIDCAP100", "NIFTY MIDCAP", "CNXMIDCAP"],
    yahooSymbol: "NIFTY_MIDCAP_100.NS",
    officialConstituentUrls: ["https://www.niftyindices.com/IndexConstituent/ind_niftymidcap100list.csv"],
  },
];

function fmpApiKey() {
  return process.env.FMP_API_KEY || "";
}

function parseMarketNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[,%+]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/&AMP;/g, "&")
    .replace(/[^A-Z0-9&.-]+/g, " ");
}

function normalizeSymbol(value: string) {
  return normalizeKey(value)
    .replace(/^(NSE|BSE)[:.]/i, "")
    .replace(/\.(NS|BO)$/i, "")
    .replace(/\s+/g, "")
    .trim();
}

function uniqueSecurities(securities: ListedSecurity[]) {
  const seen = new Set<string>();
  const out: ListedSecurity[] = [];
  for (const security of securities) {
    const key = `${security.exchange}:${security.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(security);
  }
  return out;
}

function securityFromSymbol(symbol: string, exchange: Exchange, companyName?: string): ListedSecurity | null {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  return {
    symbol: normalized,
    exchange,
    yahooSymbol: `${normalized}.${exchange === "BSE" ? "BO" : "NS"}`,
    fmpSymbol: `${normalized}.${exchange === "BSE" ? "BO" : "NS"}`,
    ...(companyName ? { companyName } : {}),
  };
}

function securityFromInput(input: string): ListedSecurity | null {
  const raw = String(input || "").trim();
  const upper = raw.toUpperCase();
  const exchange: Exchange = upper.endsWith(".BO") ? "BSE" : "NSE";
  return securityFromSymbol(raw, exchange);
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

  return Array.from(new Set(
    lines.slice(1)
      .map((line) => normalizeSymbol(parseCsvLine(line)[symbolIndex] || ""))
      .filter(Boolean)
  ));
}

function parseNseEquityListCsv(text: string) {
  if (!text || text.trim().startsWith("<")) return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const symbolIndex = header.findIndex((cell) => cell === "symbol");
  const seriesIndex = header.findIndex((cell) => cell === "series");
  if (symbolIndex < 0) return [];

  return lines.slice(1)
    .map((line) => {
      const cells = parseCsvLine(line);
      const series = seriesIndex >= 0 ? String(cells[seriesIndex] || "").trim().toUpperCase() : "EQ";
      if (series && !["EQ", "BE", "BZ", "SM", "ST", "SZ", "RR"].includes(series)) return null;
      return securityFromSymbol(cells[symbolIndex] || "", "NSE");
    })
    .filter((security): security is ListedSecurity => Boolean(security));
}

function parseBseActiveEquityList(payload: unknown): ListedSecurity[] {
  const rows = Array.isArray(payload) ? payload : [];
  const securities: ListedSecurity[] = [];

  for (const row of rows as any[]) {
    const companyName = String(row?.Scrip_Name || row?.Issuer_Name || "").trim();
    if (!/\b(LTD|LIMITED)\b/i.test(companyName)) continue;
    const security = securityFromSymbol(row?.scrip_id || row?.SCRIP_ID || "", "BSE", companyName);
    if (security) securities.push(security);
  }

  return securities;
}

function parseFmpListedSecurities(payload: unknown): ListedSecurity[] {
  const rows = Array.isArray(payload) ? payload : [];
  const securities: ListedSecurity[] = [];

  for (const row of rows as any[]) {
    const rawSymbol = String(row?.symbol || "").trim();
    const exchangeText = String(row?.exchangeShortName || row?.exchange || "").toUpperCase();
    const exchange: Exchange | null =
      rawSymbol.toUpperCase().endsWith(".BO") || exchangeText.includes("BSE")
        ? "BSE"
        : rawSymbol.toUpperCase().endsWith(".NS") || exchangeText.includes("NSE")
          ? "NSE"
          : null;
    if (!exchange) continue;

    const security = securityFromSymbol(rawSymbol, exchange, String(row?.name || "").trim());
    if (security) securities.push(security);
  }

  return uniqueSecurities(securities);
}

async function fetchJson(url: string, timeoutMs: number, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent": DESKTOP_UA,
      accept: "application/json,text/plain,*/*",
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const error = new Error(`Provider request failed: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchFmpListedSecurities(): Promise<ListedSecurity[]> {
  const key = fmpApiKey();
  if (!key) return [];

  const urls = [
    `${FMP_HOST}/stable/stock-list?apikey=${encodeURIComponent(key)}`,
    `${FMP_HOST}/stable/actively-trading-list?apikey=${encodeURIComponent(key)}`,
    `${FMP_HOST}/api/v3/stock/list?apikey=${encodeURIComponent(key)}`,
  ];

  for (const url of urls) {
    try {
      const securities = parseFmpListedSecurities(await fetchJson(url, 12_000));
      if (securities.length > 1000) return securities;
    } catch {
      /* try next FMP endpoint */
    }
  }

  return [];
}

async function fetchNseListedSecurities(): Promise<ListedSecurity[]> {
  const response = await fetch(NSE_EQUITY_LIST_URL, {
    cache: "no-store",
    headers: {
      "user-agent": DESKTOP_UA,
      accept: "text/csv,text/plain,*/*",
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) return [];
  return parseNseEquityListCsv(await response.text());
}

async function fetchBseListedSecurities(): Promise<ListedSecurity[]> {
  return parseBseActiveEquityList(await fetchJson(BSE_ACTIVE_EQUITY_LIST_URL, 12_000, {
    referer: "https://www.bseindia.com/",
  }));
}

export async function getListedIndianSymbols(refresh = false): Promise<ListedUniverseSnapshot> {
  if (!refresh && listedUniverseCache && Date.now() - listedUniverseCache.at < MARKET_UNIVERSE_CACHE_MS) {
    return listedUniverseCache.data;
  }

  const fmpSecurities = await fetchFmpListedSecurities().catch(() => []);
  if (fmpSecurities.length > 1000) {
    const data: ListedUniverseSnapshot = {
      symbols: fmpSecurities.map((security) => security.symbol),
      securities: fmpSecurities,
      source: "fmp",
      updatedAt: new Date().toISOString(),
    };
    listedUniverseCache = { at: Date.now(), data };
    return data;
  }

  const [nseSecurities, bseSecurities] = await Promise.all([
    fetchNseListedSecurities().catch(() => []),
    fetchBseListedSecurities().catch(() => []),
  ]);

  const securities = uniqueSecurities([...nseSecurities, ...bseSecurities]);
  if (securities.length > 1000) {
    const hasNse = nseSecurities.length > 0;
    const hasBse = bseSecurities.length > 0;
    const data: ListedUniverseSnapshot = {
      symbols: securities.map((security) => security.symbol),
      securities,
      source: hasNse && hasBse ? "nse-bse-official" : hasNse ? "nse-official" : "bse-official",
      updatedAt: new Date().toISOString(),
    };
    listedUniverseCache = { at: Date.now(), data };
    return data;
  }

  if (listedUniverseCache) return listedUniverseCache.data;
  throw new Error("No live market universe provider returned data");
}

function rowFromProviderQuote(security: ListedSecurity, quote: any): TickerRow | null {
  const cmp = parseMarketNumber(quote?.price ?? quote?.regularMarketPrice);
  if (!cmp || cmp <= 0) return null;

  const change = parseMarketNumber(quote?.change ?? quote?.regularMarketChange) ?? 0;
  const changePercent =
    parseMarketNumber(quote?.changePercentage ?? quote?.changesPercentage ?? quote?.regularMarketChangePercent) ?? 0;
  const high = round2(parseMarketNumber(quote?.dayHigh ?? quote?.regularMarketDayHigh));
  const low = round2(parseMarketNumber(quote?.dayLow ?? quote?.regularMarketDayLow));

  return {
    symbol: security.symbol,
    exchange: security.exchange,
    cmp: round2(cmp) ?? cmp,
    change: round2(change) ?? change,
    changePercent: round2(changePercent) ?? changePercent,
    ...(high ? { high } : {}),
    ...(low ? { low } : {}),
    ...(security.companyName || quote?.name ? { companyName: security.companyName || String(quote.name) } : {}),
  };
}

async function fetchFmpQuoteBatch(batch: ListedSecurity[]) {
  const key = fmpApiKey();
  const rows = new Map<string, TickerRow>();
  if (!key || !batch.length) return { rows, blocked: true };

  const symbols = batch.map((security) => security.fmpSymbol);
  const byFmpSymbol = new Map(batch.map((security) => [security.fmpSymbol.toUpperCase(), security]));
  const urls = [
    `${FMP_HOST}/stable/batch-quote?symbols=${encodeURIComponent(symbols.join(","))}&apikey=${encodeURIComponent(key)}`,
    `${FMP_HOST}/api/v3/quote/${encodeURIComponent(symbols.join(","))}?apikey=${encodeURIComponent(key)}`,
  ];

  let sawAuthBlock = false;
  for (const url of urls) {
    try {
      const payload = await fetchJson(url, 10_000);
      const quotes = Array.isArray(payload) ? payload : [];
      for (const quote of quotes) {
        const security = byFmpSymbol.get(String(quote?.symbol || "").toUpperCase());
        if (!security) continue;
        const row = rowFromProviderQuote(security, quote);
        if (row) rows.set(`${security.exchange}:${security.symbol}`, row);
      }
      return { rows, blocked: false };
    } catch (error: any) {
      if ([401, 402, 403].includes(Number(error?.status))) sawAuthBlock = true;
    }
  }

  return { rows, blocked: sawAuthBlock };
}

async function fetchFmpQuoteRows(securities: ListedSecurity[]) {
  const out = new Map<string, TickerRow>();
  if (!fmpApiKey() || !securities.length) return out;

  const batches: ListedSecurity[][] = [];
  for (let i = 0; i < securities.length; i += 100) batches.push(securities.slice(i, i + 100));

  const first = await fetchFmpQuoteBatch(batches[0]);
  for (const [key, row] of first.rows) out.set(key, row);
  if (first.blocked) return out;

  await runWithConcurrency(batches.slice(1), 4, async (batch) => {
    const result = await fetchFmpQuoteBatch(batch);
    for (const [key, row] of result.rows) out.set(key, row);
  });

  return out;
}

async function fetchYahooSparkRows(securities: ListedSecurity[]) {
  const out = new Map<string, TickerRow>();
  const batches: string[][] = [];
  for (let i = 0; i < securities.length; i += 20) {
    batches.push(securities.slice(i, i + 20).map((security) => security.yahooSymbol));
  }

  const requestByYahooSymbol = new Map(
    securities.map((security) => [security.yahooSymbol.toUpperCase(), security])
  );

  await runWithConcurrency(batches, 6, async (batch) => {
    const url =
      `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(batch.join(","))}` +
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
        const security = requestByYahooSymbol.get(String(result?.symbol || "").toUpperCase());
        if (!security) continue;

        const meta = result?.response?.[0]?.meta || {};
        const cmp = Number(meta.regularMarketPrice);
        const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose);
        if (!Number.isFinite(cmp) || cmp <= 0) continue;

        const change = Number.isFinite(prevClose) ? round2(cmp - prevClose) ?? 0 : 0;
        const changePercent = Number.isFinite(prevClose) && prevClose !== 0
          ? round2(((cmp - prevClose) / prevClose) * 100) ?? 0
          : 0;
        const high = round2(meta.regularMarketDayHigh);
        const low = round2(meta.regularMarketDayLow);
        out.set(`${security.exchange}:${security.symbol}`, {
          symbol: security.symbol,
          exchange: security.exchange,
          cmp: round2(cmp) ?? cmp,
          change,
          changePercent,
          ...(security.companyName ? { companyName: security.companyName } : {}),
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

async function getLiveStockRows(securities: ListedSecurity[]) {
  const normalized = uniqueSecurities(securities);
  const fmpRows = await fetchFmpQuoteRows(normalized);
  const missing = normalized.filter((security) => !fmpRows.has(`${security.exchange}:${security.symbol}`));
  const yahooRows = missing.length ? await fetchYahooSparkRows(missing) : new Map<string, TickerRow>();

  const rowsByKey = new Map<string, TickerRow>();
  for (const [key, row] of fmpRows) rowsByKey.set(key, row);
  for (const [key, row] of yahooRows) rowsByKey.set(key, row);

  return {
    rows: normalized
      .map((security) => rowsByKey.get(`${security.exchange}:${security.symbol}`))
      .filter((row): row is TickerRow => Boolean(row && row.cmp > 0)),
    quoteSource: fmpRows.size && yahooRows.size ? "fmp+yahoo" as const : fmpRows.size ? "fmp" as const : "yahoo" as const,
  };
}

export async function getLiveTickerSnapshot(refresh = false): Promise<LiveTickerSnapshot> {
  const cacheFresh = liveTickerCache && Date.now() - liveTickerCache.at < MARKET_TICKER_CACHE_MS;
  if (!refresh && cacheFresh) return liveTickerCache!.data;
  if (refresh && cacheFresh) return liveTickerCache!.data;
  if (liveTickerPending) return liveTickerPending;

  liveTickerPending = (async () => {
    const universe = await getListedIndianSymbols(refresh);
    const { rows, quoteSource } = await getLiveStockRows(universe.securities);
    const sortedRows = rows.sort((a, b) =>
      a.symbol.localeCompare(b.symbol) || String(a.exchange || "").localeCompare(String(b.exchange || ""))
    );

    if (!sortedRows.length) {
      if (liveTickerCache) return liveTickerCache.data;
      throw new Error("No live quote provider returned ticker data");
    }

    const snapshot: LiveTickerSnapshot = {
      rows: sortedRows,
      universeCount: universe.securities.length,
      source: universe.source,
      quoteSource,
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

async function fetchOfficialSymbols(definition: MarketIndexDefinition) {
  const cacheKey = definition.value;
  const cached = officialSymbolsCache.get(cacheKey);

  for (const url of definition.officialConstituentUrls || []) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
        headers: {
          "user-agent": DESKTOP_UA,
          accept: "text/csv,text/plain,*/*",
          referer: "https://www.niftyindices.com/",
        },
      });
      if (!response.ok) continue;
      const symbols = parseConstituentCsv(await response.text());
      if (symbols.length) {
        officialSymbolsCache.set(cacheKey, { at: Date.now(), symbols });
        return symbols;
      }
    } catch {
      /* try next source */
    }
  }

  // Every source failed this call — fall back to the last-known-good list
  // rather than returning empty (constituents rarely change intraday).
  if (cached && Date.now() - cached.at < OFFICIAL_SYMBOLS_STALE_MS) {
    return cached.symbols;
  }
  return [];
}

function findStaticIndexDefinition(value: string) {
  const key = normalizeKey(value);
  const compact = key.replace(/\s+/g, "");
  return NSE_INDEXES.find((index) => {
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

async function fetchBseIndexDefinitions(): Promise<MarketIndexDefinition[]> {
  if (bseIndexCache && Date.now() - bseIndexCache.at < MARKET_INDEX_CACHE_MS) {
    return bseIndexCache.data;
  }

  try {
    const payload = await fetchJson(BSE_INDEX_LIST_URL, 10_000, {
      referer: "https://www.bseindia.com/markets",
    });
    const rows = Array.isArray(payload) ? payload : [];
    const data = rows
      .map((row: any): MarketIndexDefinition | null => {
        const label = String(row?.scname || "").trim();
        const code = String(row?.sccode || "").trim();
        if (!label || !code) return null;
        return {
          value: label,
          label,
          exchange: "BSE",
          kind: "BSE",
          aliases: [label.replace(/^BSE\s+/i, "")],
          bseIndexCode: code,
        };
      })
      .filter((row): row is MarketIndexDefinition => Boolean(row));
    if (data.length) {
      bseIndexCache = { at: Date.now(), data };
      return data;
    }
  } catch {
    /* no static BSE index fallback */
  }

  return bseIndexCache?.data || [];
}

async function getIndexDefinition(value: string) {
  const staticDefinition = findStaticIndexDefinition(value);
  if (staticDefinition) return staticDefinition;

  const key = normalizeKey(value);
  const compact = key.replace(/\s+/g, "");
  const bseDefinitions = await fetchBseIndexDefinitions();
  return bseDefinitions.find((index) => {
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

export async function getMarketIndexOptions(): Promise<MarketIndexOption[]> {
  const bseOptions = await fetchBseIndexDefinitions();
  return [
    ...NSE_INDEXES,
    ...bseOptions,
  ].map(({ value, label, exchange }) => ({ value, label, exchange }));
}

async function getBseIndexQuote(definition: MarketIndexDefinition): Promise<TickerRow | null> {
  if (!definition.bseIndexCode) return null;
  try {
    const payload = await fetchJson(BSE_INDEX_MOVERS_URL, 10_000, {
      referer: "https://www.bseindia.com/markets",
    });
    const rows = Array.isArray(payload?.Table) ? payload.Table : [];
    const row = rows.find((item: any) => String(item?.code || "") === definition.bseIndexCode);
    if (!row) return null;

    const cmp = parseMarketNumber(row.LTP);
    if (!cmp) return null;
    return {
      symbol: definition.label,
      exchange: "BSE",
      cmp,
      change: parseMarketNumber(row.change) ?? 0,
      changePercent: parseMarketNumber(row.PERCENTCHG) ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getLiveIndexTicker(indexName: string): Promise<TickerRow | null> {
  const definition = await getIndexDefinition(indexName);
  if (!definition) return null;

  if (definition.kind === "BSE") {
    return getBseIndexQuote(definition);
  }

  if (!definition.yahooSymbol) return null;
  const quote = await getYahooQuote(definition.yahooSymbol);
  if (!quote?.cmp || quote.cmp <= 0) return null;
  return {
    symbol: definition.label,
    exchange: "NSE",
    cmp: quote.cmp,
    change: quote.change ?? 0,
    changePercent: quote.changePercent ?? 0,
  };
}

export async function getLiveTickerRows(requestedSymbols: string[], options: { refresh?: boolean } = {}) {
  const requested = requestedSymbols.map((symbol) => symbol.trim()).filter(Boolean);
  if (!requested.length) {
    return (await getLiveTickerSnapshot(Boolean(options.refresh))).rows;
  }

  const stockSecurities: ListedSecurity[] = [];
  const indexRows: TickerRow[] = [];

  for (const input of requested) {
    const indexDefinition = await getIndexDefinition(input);
    if (indexDefinition) {
      const row = await getLiveIndexTicker(input);
      if (row) indexRows.push(row);
    } else {
      const security = securityFromInput(input);
      if (security) stockSecurities.push(security);
    }
  }

  const { rows: stockRows } = stockSecurities.length
    ? await getLiveStockRows(stockSecurities)
    : { rows: [] };

  return [...stockRows, ...indexRows];
}

function parseBseHeatmapRows(payload: unknown): TickerRow[] {
  const raw = typeof payload === "string" ? payload : String(payload || "");
  const [, data = ""] = raw.split("$#$");
  if (!data || data === "nrf") return [];

  const rows: TickerRow[] = [];
  for (const record of data.split("|")) {
    const cells = record.split(",");
    const symbol = normalizeSymbol(cells[0] || "");
    const changePercent = parseMarketNumber(cells[1]);
    const open = parseMarketNumber(cells[3]);
    const high = parseMarketNumber(cells[4]);
    const low = parseMarketNumber(cells[5]);
    const cmp = parseMarketNumber(cells[6]);
    const change = parseMarketNumber(cells[7]);
    if (!symbol || !cmp) continue;
    rows.push({
      symbol,
      exchange: "BSE",
      cmp,
      change: change ?? 0,
      changePercent: changePercent ?? 0,
      ...(high || open ? { high: high ?? open ?? undefined } : {}),
      ...(low || open ? { low: low ?? open ?? undefined } : {}),
    });
  }

  return rows;
}

async function getBseIndexHeatmap(definition: MarketIndexDefinition) {
  if (!definition.bseIndexCode) return [];

  try {
    const payload = await fetchJson(
      `${BSE_HEATMAP_URL}?flag=HEAT&alpha=A&indexcode=${encodeURIComponent(definition.bseIndexCode)}&random=${Date.now()}`,
      18_000,
      { referer: "https://www.bseindia.com/markets" }
    );
    return parseBseHeatmapRows(payload);
  } catch {
    return [];
  }
}

export async function getLiveIndexHeatmap(indexName: string) {
  const definition = await getIndexDefinition(indexName);
  if (!definition) {
    return {
      indexName,
      updatedAt: new Date().toISOString(),
      rows: [],
      source: "provider-unavailable",
      constituentCount: 0,
    };
  }

  if (definition.kind === "BSE") {
    const rows = await getBseIndexHeatmap(definition);
    return {
      indexName: definition.label,
      updatedAt: new Date().toISOString(),
      rows: rows.sort((a, b) => b.changePercent - a.changePercent),
      source: rows.length ? "bse-official" : "provider-unavailable",
      constituentCount: rows.length,
    };
  }

  const symbols = await fetchOfficialSymbols(definition);
  const securities = symbols
    .map((symbol) => securityFromSymbol(symbol, "NSE"))
    .filter((security): security is ListedSecurity => Boolean(security));
  const { rows, quoteSource } = securities.length
    ? await getLiveStockRows(securities)
    : { rows: [], quoteSource: "yahoo" as const };

  return {
    indexName: definition.label,
    updatedAt: new Date().toISOString(),
    rows: rows.sort((a, b) => b.changePercent - a.changePercent),
    source: securities.length ? `nse-official/${quoteSource}` : "provider-unavailable",
    constituentCount: securities.length,
  };
}
