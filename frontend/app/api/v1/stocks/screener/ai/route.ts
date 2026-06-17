import { NextRequest, NextResponse } from "next/server";
import { parseScreenerQuery } from "@/lib/backend/ai/features";
import { getJson, toFloat, round2 } from "@/lib/backend/http";
import type { ScreenerResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FMP_HOST = "https://financialmodelingprep.com";

type FmpScreenerFilters = {
  exchange?: string;
  sector?: string;
  industry?: string;
  market_cap_min?: number;
  market_cap_max?: number;
  pe_min?: number;
  pe_max?: number;
  price_min?: number;
  price_max?: number;
  dividend_min?: number;
  volume_min?: number;
  limit?: number;
};

function num(value: unknown): number {
  return toFloat(value) ?? 0;
}

function nullableNum(value: unknown): number | null {
  return toFloat(value);
}

function stripSuffix(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "");
}

/** Map a raw FMP screener row to a ScreenerResult. */
function mapRow(row: any): ScreenerResult {
  const price = num(row?.price);
  const lastDividend = nullableNum(row?.lastAnnualDividend);
  const dividendYield =
    lastDividend !== null && price > 0 ? round2((lastDividend / price) * 100) : null;

  return {
    symbol: stripSuffix(String(row?.symbol || "")),
    companyName: String(row?.companyName || row?.symbol || ""),
    exchange: String(row?.exchangeShortName || row?.exchange || "NSE") || "NSE",
    marketCap: num(row?.marketCap),
    price,
    change: 0,
    changePercent: 0,
    volume: num(row?.volume),
    sector: String(row?.sector || ""),
    industry: String(row?.industry || ""),
    pe: nullableNum(row?.pe),
    pb: nullableNum(row?.pb ?? row?.priceToBook),
    roe: nullableNum(row?.roe ?? row?.returnOnEquity),
    dividendYield,
    beta: nullableNum(row?.beta),
  };
}

/** Run the FMP stock screener (exchange pinned to NSE). Returns [] on failure. */
async function runFmpScreener(filters: FmpScreenerFilters): Promise<ScreenerResult[]> {
  const key = process.env.FMP_API_KEY || "";
  if (!key) return [];

  const limit = filters.limit && filters.limit > 0 ? Math.floor(filters.limit) : 50;

  const params = new URLSearchParams();
  params.set("exchange", filters.exchange || "NSE");
  if (filters.sector) params.set("sector", filters.sector);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.market_cap_min) params.set("marketCapMoreThan", String(filters.market_cap_min));
  if (filters.market_cap_max) params.set("marketCapLowerThan", String(filters.market_cap_max));
  if (filters.price_min) params.set("priceMoreThan", String(filters.price_min));
  if (filters.price_max) params.set("priceLowerThan", String(filters.price_max));
  if (filters.dividend_min) params.set("dividendMoreThan", String(filters.dividend_min));
  if (filters.volume_min) params.set("volumeMoreThan", String(filters.volume_min));
  if (filters.pe_min) params.set("peMoreThan", String(filters.pe_min));
  if (filters.pe_max) params.set("peLowerThan", String(filters.pe_max));
  params.set("limit", String(Math.max(limit, 100)));
  params.set("apikey", key);

  const url = `${FMP_HOST}/api/v3/stock-screener?${params.toString()}`;
  const payload = await getJson<any[]>(url, { timeoutMs: 12_000 });
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((row) => row && typeof row === "object" && row.symbol)
    .map(mapRow)
    .filter((row) => Boolean(row.symbol))
    .slice(0, limit);
}

/** Coerce a parsed (possibly string/number) filter map into numeric FMP filters. */
function toFmpFilters(parsed: Record<string, unknown>): FmpScreenerFilters {
  const numOrUndef = (v: unknown): number | undefined => {
    const n = toFloat(v);
    return n === null ? undefined : n;
  };
  return {
    exchange: typeof parsed.exchange === "string" && parsed.exchange ? String(parsed.exchange) : "NSE",
    sector: typeof parsed.sector === "string" && parsed.sector ? String(parsed.sector) : undefined,
    industry: typeof parsed.industry === "string" && parsed.industry ? String(parsed.industry) : undefined,
    market_cap_min: numOrUndef(parsed.market_cap_min),
    market_cap_max: numOrUndef(parsed.market_cap_max),
    pe_min: numOrUndef(parsed.pe_min),
    pe_max: numOrUndef(parsed.pe_max),
    price_min: numOrUndef(parsed.price_min),
    price_max: numOrUndef(parsed.price_max),
    dividend_min: numOrUndef(parsed.dividend_min),
    volume_min: numOrUndef(parsed.volume_min),
    limit: numOrUndef(parsed.limit),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();

    if (!query) {
      return NextResponse.json({ results: [], parsedFilters: {} });
    }

    const { filters } = await parseScreenerQuery(query);
    const parsedFilters = (filters && typeof filters === "object" ? filters : {}) as Record<string, unknown>;

    const results = await runFmpScreener(toFmpFilters(parsedFilters));

    return NextResponse.json({ results, parsedFilters });
  } catch (error) {
    console.error("AI screener error:", error);
    // Golden rule: never 500 — return an empty but valid payload.
    return NextResponse.json({ results: [], parsedFilters: {} });
  }
}
