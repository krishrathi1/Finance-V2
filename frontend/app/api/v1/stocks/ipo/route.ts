import { NextRequest, NextResponse } from "next/server";
import { toFloat } from "@/lib/backend/http";
import type { IpoItem } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NSE_HOME = "https://www.nseindia.com";
const NSE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "application/json, text/plain, */*",
  referer: "https://www.nseindia.com/",
  "x-requested-with": "XMLHttpRequest",
};

/** Prime NSE cookies by hitting the home page, then return the Set-Cookie string. */
async function primeNseCookies(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(NSE_HOME, {
      headers: {
        "user-agent": NSE_HEADERS["user-agent"],
        "accept-language": NSE_HEADERS["accept-language"],
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.headers.get("set-cookie") || "";
  } catch (err) {
    console.warn("[ipo] cookie priming failed:", String(err));
    return "";
  }
}

/** Fetch JSON from an NSE API endpoint using primed cookies. Returns null on failure. */
async function fetchNseJson(url: string, cookies: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, {
      headers: { ...NSE_HEADERS, ...(cookies ? { Cookie: cookies } : {}) },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[ipo] NSE API ${res.status} for ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[ipo] NSE fetch failed for ${url}:`, String(err));
    return null;
  }
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return undefined;
}

function buildPriceRange(item: any): string {
  const min = pick(item, ["minPrice", "priceBandLow", "issuePriceMin", "lowPrice"]);
  const max = pick(item, ["maxPrice", "priceBandHigh", "issuePriceMax", "highPrice"]);
  const direct = pick(item, ["priceBand", "priceRange", "issuePrice"]);
  if (min && max) return `₹${min} - ₹${max}`;
  if (max) return `₹${max}`;
  if (direct) return String(direct);
  return "N/A";
}

function mapUpcoming(item: any): IpoItem {
  const symbol = String(pick(item, ["symbol", "Symbol"]) ?? "").trim().toUpperCase();
  const company = String(pick(item, ["companyName", "company", "name", "issuer"]) ?? symbol).trim();
  const issueStartDate = String(pick(item, ["issueStartDate", "biddingStartDate", "startDate"]) ?? "");
  const issueEndDate = String(pick(item, ["issueEndDate", "biddingEndDate", "endDate"]) ?? "");
  const status = String(pick(item, ["status", "issueStatus"]) ?? "Upcoming");
  const series = String(pick(item, ["series"]) ?? "");
  const exchange = String(pick(item, ["exchange"]) ?? "NSE");
  const lotSize = toFloat(pick(item, ["lotSize", "noOfSharesOffered", "issueSize", "shares"]));

  return {
    symbol: symbol || company.slice(0, 12).toUpperCase(),
    company,
    date: issueEndDate || issueStartDate || "",
    exchange,
    actions: status,
    shares: lotSize,
    priceRange: buildPriceRange(item),
    marketCap: toFloat(pick(item, ["issueSize", "totalIssueSize", "issueAmount"])),
    issueStartDate: issueStartDate || undefined,
    issueEndDate: issueEndDate || undefined,
    status: status || undefined,
    series: series || undefined,
  };
}

function mapRecent(item: any): IpoItem {
  const symbol = String(pick(item, ["symbol", "Symbol"]) ?? "").trim().toUpperCase();
  const company = String(pick(item, ["companyName", "company", "name", "issuer"]) ?? symbol).trim();
  const listingDate = String(pick(item, ["listingDate", "date", "issueEndDate"]) ?? "");
  const currentPrice = toFloat(pick(item, ["lastPrice", "ltp", "currentPrice", "price"]));
  const prevClose = toFloat(pick(item, ["previousClose", "prevClose", "iemPreClose"]));
  const changePercent = toFloat(pick(item, ["pChange", "changePercent", "perChange"]));
  const yearHigh = toFloat(pick(item, ["yearHigh", "high52", "weekHighPrice"]));

  return {
    symbol: symbol || company.slice(0, 12).toUpperCase(),
    company,
    date: listingDate || "",
    exchange: String(pick(item, ["exchange"]) ?? "NSE"),
    actions: "Listed",
    shares: toFloat(pick(item, ["noOfSharesOffered", "shares"])),
    priceRange: buildPriceRange(item),
    marketCap: toFloat(pick(item, ["issueSize", "totalIssueSize", "issueAmount"])),
    currentPrice: currentPrice ?? undefined,
    prevClose: prevClose ?? undefined,
    changePercent: changePercent ?? undefined,
    yearHigh: yearHigh ?? undefined,
  };
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.upcoming)) return payload.upcoming;
  if (Array.isArray(payload?.current)) return payload.current;
  return [];
}

export async function GET(request: NextRequest) {
  const typeParam = (request.nextUrl.searchParams.get("type") || "upcoming").toLowerCase();
  const type: "upcoming" | "recent" = typeParam === "recent" ? "recent" : "upcoming";

  try {
    const cookies = await primeNseCookies();

    let rows: IpoItem[] = [];

    if (type === "upcoming") {
      const payload =
        (await fetchNseJson(
          "https://www.nseindia.com/api/all-upcoming-issues?category=ipo",
          cookies
        )) ||
        (await fetchNseJson(
          "https://www.nseindia.com/api/ipo-current-and-upcoming",
          cookies
        ));
      rows = extractArray(payload).map(mapUpcoming);
    } else {
      const payload =
        (await fetchNseJson(
          "https://www.nseindia.com/api/public-past-issues",
          cookies
        )) ||
        (await fetchNseJson(
          "https://www.nseindia.com/api/ipo-current-and-upcoming",
          cookies
        ));
      rows = extractArray(payload).map(mapRecent);
    }

    // Drop empties (no symbol AND no company).
    rows = rows.filter((r) => r.symbol || r.company);

    return NextResponse.json({ data: rows, type });
  } catch (error) {
    console.error("[ipo] route error:", error);
    return NextResponse.json({ data: [], type });
  }
}
