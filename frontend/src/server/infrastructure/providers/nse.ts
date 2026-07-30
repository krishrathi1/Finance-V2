/**
 * NSE provider for the Node backend port.
 *
 * Ports the NSE functions from `backend/app/services/providers.py`:
 *   - `_get_nse_quote_sync`            -> getNseQuote
 *   - `_get_nse_corporate_events_sync` -> getNseCorporateEvents
 *   - quarterly via `api/results-comparision` (per spec 01 §3a / task) -> getNseQuarterlyResults
 *
 * CRITICAL: NSE blocks every `/api/*` request that is not cookie-primed. We must
 * GET https://www.nseindia.com first to capture the `set-cookie` header and then
 * send it back as a `Cookie` header on the API call. On a 401/403 we re-prime
 * once and retry the API call exactly once (mirrors the Python session pattern).
 *
 * GOLDEN RULE: these functions NEVER throw — they return `null` (or, for
 * corporate events, the empty skeleton) on any failure or timeout.
 */

import { fetchWithTimeout, toFloat, baseSymbol } from "@/server/infrastructure/http";
import type {
  NseProviderApi,
  RawQuote,
  QuarterlyResults,
  QuarterPoint,
} from "@/shared/contracts";
import type { DashboardData, ActionRow, QuarterlyDetailedPoint, ShareholdingPoint } from "@/shared/types";

// ---------------------------------------------------------------------------
// Headers + cookie priming
// ---------------------------------------------------------------------------

const NSE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "application/json, text/plain, */*",
  referer: "https://www.nseindia.com/",
  "x-requested-with": "XMLHttpRequest",
};

const NSE_BASE = "https://www.nseindia.com";

/** Shared cookie jar (the equivalent of the reused `requests.Session()`). */
let cachedCookies: string | null = null;
let primeCookiesPending: Promise<string> | null = null;

/**
 * Prime NSE cookies by hitting the homepage and capturing `set-cookie`.
 * Returns the cookie string (possibly empty); never throws.
 */
async function primeCookies(): Promise<string> {
  try {
    const res = await fetchWithTimeout(NSE_BASE, {
      headers: NSE_HEADERS,
      timeoutMs: 6000,
    });
    // `getSetCookie()` is available on the Node/undici Headers impl; fall back
    // to the (comma-joined) `get('set-cookie')` form when it is not.
    const headersAny = res.headers as Headers & { getSetCookie?: () => string[] };
    let cookieParts: string[] = [];
    if (typeof headersAny.getSetCookie === "function") {
      cookieParts = headersAny.getSetCookie();
    } else {
      const raw = res.headers.get("set-cookie");
      if (raw) cookieParts = [raw];
    }
    // Keep only the `name=value` portion of each Set-Cookie (drop attributes).
    const jar = cookieParts
      .map((c) => c.split(";")[0].trim())
      .filter((c) => c.includes("="))
      .join("; ");
    cachedCookies = jar;
    return jar;
  } catch {
    cachedCookies = cachedCookies ?? "";
    return cachedCookies;
  }
}

async function ensureCookies(): Promise<string> {
  if (cachedCookies) return cachedCookies;
  // A cold dashboard load fires several NSE calls concurrently (quote,
  // corporate events, quarterly results); without this dedup each one
  // independently primes cookies, tripling load on the exact request that
  // most needs to succeed. Share one in-flight prime across all callers.
  if (primeCookiesPending) return primeCookiesPending;
  primeCookiesPending = primeCookies().finally(() => {
    primeCookiesPending = null;
  });
  return primeCookiesPending;
}

/**
 * GET an NSE `/api/*` endpoint as JSON with cookie priming + a single
 * re-prime/retry on 401/403. Returns parsed JSON or `null` (never throws).
 */
export async function nseGetJson<T = any>(
  url: string,
  timeoutMs = 6000,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    if (signal?.aborted) return null;
    let cookies = await ensureCookies();
    let res = await fetchWithTimeout(url, {
      headers: { ...NSE_HEADERS, Cookie: cookies },
      timeoutMs,
      signal,
    });

    if (res.status === 401 || res.status === 403) {
      // Cookies are stale/blocked — re-prime once and retry exactly once.
      cookies = await primeCookies();
      res = await fetchWithTimeout(url, {
        headers: { ...NSE_HEADERS, Cookie: cookies },
        timeoutMs,
        signal,
      });
    }

    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    // Minimal shape guard: NSE occasionally responds 200 with an HTML/plain
    // error page or a bare string/number instead of the expected JSON
    // object/array. Casting that straight to `T` would silently propagate a
    // wrong-shaped value into every field access downstream instead of
    // failing the way a real "no data" response does.
    if (parsed === null || typeof parsed !== "object") {
      console.warn(`[nse] unexpected non-object JSON for ${url}`);
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. LIVE QUOTE — getNseQuote (ports _get_nse_quote_sync, spec 01 §3a)
// ---------------------------------------------------------------------------

export async function getNseQuote(base: string, signal?: AbortSignal): Promise<RawQuote | null> {
  try {
    const key = baseSymbol(base);
    const url = `${NSE_BASE}/api/quote-equity?symbol=${encodeURIComponent(key)}`;
    const payload = await nseGetJson<any>(url, 6000, signal);
    if (!payload) return null;

    const priceInfo = payload.priceInfo ?? {};
    const week = priceInfo.weekHighLow ?? {};
    const securityInfo = payload.securityInfo ?? {};
    const metadata = payload.metadata ?? {};
    const info = payload.info ?? {};

    const cmp = toFloat(priceInfo.lastPrice);
    // Mirror Python: when cmp is null we have nothing useful → return null.
    if (cmp === null) return null;

    const issuedSize = toFloat(securityInfo.issuedSize);

    const quote: RawQuote = {
      cmp,
      change: toFloat(priceInfo.change),
      changePercent: toFloat(priceInfo.pChange),
      fiftyTwoWeekHigh: toFloat(week.max),
      fiftyTwoWeekLow: toFloat(week.min),
      faceValue: toFloat(securityInfo.faceValue),
      // Outstanding shares converted to CRORE (issuedSize / 1e7).
      outstandingShares: issuedSize !== null ? issuedSize / 10_000_000 : null,
      industryPe: toFloat(metadata.pdSectorPe),
      peRatio: toFloat(metadata.pdSymbolPe),
      companyName: typeof info.companyName === "string" && info.companyName ? info.companyName : null,
      currency: "INR",
    };

    return quote;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. QUARTERLY RESULTS — getNseQuarterlyResults (api/results-comparision)
// ---------------------------------------------------------------------------

/** Coerce an NSE numeric field that is already in CRORE (re_net_sale etc.). */
function num(value: unknown): number | null {
  return toFloat(value);
}

/**
 * Build a friendly period label. `re_to_dt` is typically `DD-Mon-YYYY`
 * (e.g. `31-Mar-2024`); we surface the raw value, preferring `to` over `from`.
 */
function periodLabel(item: any): string {
  const to = String(item?.re_to_dt ?? "").trim();
  const from = String(item?.re_from_dt ?? "").trim();
  const raw = to || from;
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString().slice(0, 10);
}

export async function getNseQuarterlyResults(
  base: string,
  signal?: AbortSignal
): Promise<QuarterlyResults | null> {
  try {
    const key = baseSymbol(base);
    const url = `${NSE_BASE}/api/results-comparision?symbol=${encodeURIComponent(key)}`;
    const payload = await nseGetJson<any>(url, 8000, signal);
    if (!payload) return null;

    const rows = Array.isArray(payload.resCmpData) ? payload.resCmpData : [];
    if (rows.length === 0) return null;

    // Map to summary QuarterPoint[] (period / revenue / profit).
    const summary: QuarterPoint[] = rows.map((item: any) => ({
      period: periodLabel(item),
      revenue: num(item.re_net_sale),
      profit: num(item.re_net_profit),
    }));

    // Build detailed rows where the comparison feed exposes the field.
    //
    // `results-comparision` returns two different schemas: non-financials use
    // one set of keys (re_total_inc, re_int_new, re_curr_tax + re_deff_tax...)
    // and banks/NBFCs another (re_tot_inc, re_int_earned, re_int_expd,
    // re_tax...). Every key exists on both payloads, but only the shape
    // matching the filer's industry is populated — so reading a single name
    // silently yields null for half the market. Banks were the visible
    // casualty: no interest lines meant Net Interest Margin could never be
    // computed. Take the first non-null across both spellings.
    const detailed: QuarterlyDetailedPoint[] = rows.map((item: any) => {
      const pick = (...keys: string[]): number | null => {
        for (const key of keys) {
          const value = num(item[key]);
          if (value !== null) return value;
        }
        return null;
      };

      const totalRevenue = pick("re_total_inc", "re_tot_inc");
      const netProfit = num(item.re_net_profit);
      const pbt = num(item.re_pro_loss_bef_tax);
      const tax = (() => {
        const current = num(item.re_curr_tax);
        const deferred = num(item.re_deff_tax);
        if (current === null && deferred === null) return num(item.re_tax);
        return (current ?? 0) + (deferred ?? 0);
      })();
      const taxPct = tax !== null && pbt !== null && pbt !== 0 ? (tax / pbt) * 100 : null;
      const netProfitMarginPct =
        netProfit !== null && totalRevenue !== null && totalRevenue !== 0
          ? (netProfit / totalRevenue) * 100
          : null;

      const interestEarned = pick("re_int_new", "re_int_earned");
      const interestExpended = pick("re_int_exp", "re_int_expended", "re_int_expd");

      return {
        period: periodLabel(item),
        totalRevenue,
        operatingRevenue: num(item.re_net_sale),
        interestEarned,
        otherIncome: pick("re_oth_inc_new", "re_oth_inc"),
        expenses: pick("re_oth_tot_exp", "re_tot_exp_exc_pro_cont"),
        interestExpended,
        operatingExpenses: pick("re_oth_exp", "re_oper_exp", "re_oth_oper_exp"),
        // Banks report both interest legs, so net interest income is a real
        // figure here rather than a derived guess; non-financials leave it null.
        netInterestIncome:
          interestEarned !== null && interestExpended !== null
            ? interestEarned - interestExpended
            : null,
        depreciations: num(item.re_depr_und_exp),
        profitBeforeTax: pbt,
        tax,
        taxPct,
        netProfit,
        netProfitMarginPct,
        basicEps: pick("re_basic_eps_for_cont_dic_opr", "re_basic_eps", "re_bsc_eps_bfr_exi"),
        dilutedEps: pick("re_dilut_eps_for_cont_dic_opr", "re_diluted_eps", "re_dil_eps_bfr_exi"),
      };
    });

    // Face value is a company-level constant the feed repeats on every row, and
    // is populated for both schemas — the metrics grid was rendering 0 purely
    // because nothing read it.
    const faceValue = (() => {
      for (const item of rows) {
        const value = num(item?.re_face_val);
        if (value !== null && value > 0) return value;
      }
      return null;
    })();

    // Keep the last ~8 quarters. The feed is generally newest-first, so the
    // "last 8" are the leading 8 entries; preserve feed order otherwise.
    const byPeriod = (a: { period: string }, b: { period: string }) =>
      Date.parse(a.period) - Date.parse(b.period);
    const summaryTrim = summary.sort(byPeriod).slice(-8);
    const detailedTrim = detailed.sort(byPeriod).slice(-8);

    // The results-comparision feed does not distinguish standalone vs
    // consolidated, so expose the same series under the generic `quarterly`
    // bucket (consumers fall back to it).
    return {
      quarterly: summaryTrim,
      quarterlyDetailedStandalone: detailedTrim,
      faceValue,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. CORPORATE EVENTS — getNseCorporateEvents (ports _get_nse_corporate_events_sync)
// ---------------------------------------------------------------------------

type CorporateActions = DashboardData["corporateActions"];

function emptyCorporateActions(): CorporateActions {
  return {
    boardMeetings: [],
    dividends: [],
    bonusIssues: [],
    stockSplits: [],
    rightsIssues: [],
    agmEgm: [],
    deals: [],
    bulkDeals: [],
    blockDeals: [],
    insiderTrades: [],
  };
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text === "-" ? "" : text;
}

/** Parse an NSE event date into a sortable epoch ms; unknown → -Infinity. */
function parseEventDate(value: string): number {
  const v = (value || "").trim();
  if (!v) return Number.NEGATIVE_INFINITY;

  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // "31-Mar-2024" / "31-Mar-2024 12:30:00" / "31 Mar 2024"
  let m = v.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const mon = months[m[2].toLowerCase()];
    if (mon !== undefined) {
      return Date.UTC(
        Number(m[3]), mon, Number(m[1]),
        Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
      );
    }
  }
  // "31-03-2024" / "31-03-2024 12:30:00"
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return Date.UTC(
      Number(m[3]), Number(m[2]) - 1, Number(m[1]),
      Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
    );
  }
  // "2024-03-31" / "2024-03-31 12:30:00"
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return Date.UTC(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
    );
  }
  return Number.NEGATIVE_INFINITY;
}

function cleanCompText(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseRupeeValues(subject: string): number[] {
  const out: number[] = [];
  const re = /(?:rs\.?|₹)\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(subject || "")) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function parseRatio(subject: string): string {
  const m = (subject || "").match(/(\d+\s*:\s*\d+)/);
  return m ? m[1].replace(/\s+/g, "") : "-";
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

function parseSplitRatio(subject: string): string {
  const ratio = parseRatio(subject);
  if (ratio !== "-") return ratio;
  const m = (subject || "").match(
    /from\s*(?:rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\D+to\s*(?:rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (!m) return "-";
  return `${trimZeros(m[1])}:${trimZeros(m[2])}`;
}

function parseRightsRatio(subject: string): string {
  const ratio = parseRatio(subject);
  if (ratio !== "-") return ratio;
  const m = (subject || "").match(/(\d+)\s*for\s*(\d+)/i);
  if (!m) return "-";
  return `${m[1]}:${m[2]}`;
}

function inferDividendType(subject: string): string {
  const s = (subject || "").toLowerCase();
  const labels: string[] = [];
  if (s.includes("interim")) labels.push("Interim");
  if (s.includes("special")) labels.push("Special");
  if (s.includes("final")) labels.push("Final");
  return labels.length ? labels.join(" + ") : "Dividend";
}

export async function getNseCorporateEvents(
  base: string,
  signal?: AbortSignal
): Promise<CorporateActions | null> {
  const result = emptyCorporateActions();
  try {
    const key = baseSymbol(base);

    // 3-year window ending today (UTC) — matches the Python date math.
    const now = new Date();
    const fmtDMY = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
    const toDate = fmtDMY(now);
    const fromDate = fmtDMY(new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate())));

    // Ensure the cookie jar is primed before the parallel fan-out.
    await ensureCookies();

    const enc = (s: string) => encodeURIComponent(s);
    const corpUrl = `${NSE_BASE}/api/corporates-corporateActions?index=equities&symbol=${enc(key)}`;
    const annUrl = `${NSE_BASE}/api/corporate-announcements?index=equities&symbol=${enc(key)}&from_date=${enc(fromDate)}&to_date=${enc(toDate)}`;
    const boardUrl = `${NSE_BASE}/api/corporate-board-meetings?index=equities&symbol=${enc(key)}&from_date=${enc(fromDate)}&to_date=${enc(toDate)}`;
    // NOTE: insider/deal endpoints use `from`/`to`, NOT `from_date`/`to_date`.
    const insiderUrl = `${NSE_BASE}/api/corporates-pit?index=equities&symbol=${enc(key)}&from=${enc(fromDate)}&to=${enc(toDate)}`;
    const bulkUrl = `${NSE_BASE}/api/historicalOR/bulk-block-short-deals?optionType=bulk_deals&symbol=${enc(key)}&from=${enc(fromDate)}&to=${enc(toDate)}`;
    const blockUrl = `${NSE_BASE}/api/historicalOR/bulk-block-short-deals?optionType=block_deals&symbol=${enc(key)}&from=${enc(fromDate)}&to=${enc(toDate)}`;

    // Each sub-source failing returns null → its list stays empty.
    const [corpRaw, annRaw, boardRaw, insiderRaw, bulkRaw, blockRaw] = await Promise.all([
      nseGetJson<any>(corpUrl, 5000, signal),
      nseGetJson<any>(annUrl, 5000, signal),
      nseGetJson<any>(boardUrl, 5000, signal),
      nseGetJson<any>(insiderUrl, 5000, signal),
      nseGetJson<any>(bulkUrl, 5000, signal),
      nseGetJson<any>(blockUrl, 5000, signal),
    ]);

    const corpJson: any[] = Array.isArray(corpRaw) ? corpRaw : [];
    const announcements: any[] = Array.isArray(annRaw) ? annRaw : [];
    let boardJson: any[];
    if (Array.isArray(boardRaw)) {
      boardJson = boardRaw;
    } else if (boardRaw && typeof boardRaw === "object") {
      const d = boardRaw.data ?? boardRaw.records;
      boardJson = Array.isArray(d) ? d : [];
    } else {
      boardJson = [];
    }
    const insiderJson: any[] = Array.isArray(insiderRaw?.data) ? insiderRaw.data : [];
    const bulkJson: any[] = Array.isArray(bulkRaw?.data) ? bulkRaw.data : [];
    const blockJson: any[] = Array.isArray(blockRaw?.data) ? blockRaw.data : [];

    // --- Announcement categorization (for announcementDate backfill) ----
    const annByCategory: Record<string, any[]> = {
      dividend: [],
      bonus: [],
      split: [],
      rights: [],
      agm_egm: [],
    };
    for (const item of announcements) {
      const desc = String(item?.desc ?? "").toLowerCase();
      if (desc.includes("dividend")) annByCategory.dividend.push(item);
      if (desc.includes("bonus")) annByCategory.bonus.push(item);
      if (desc.includes("split")) annByCategory.split.push(item);
      if (desc.includes("rights")) annByCategory.rights.push(item);
      if (desc.includes("annual general meeting") || desc.includes("agm") || desc.includes("egm")) {
        annByCategory.agm_egm.push(item);
      }
    }

    const findAnnouncementDate = (category: string, exDate: string, subject: string): string => {
      const candidates = annByCategory[category] ?? [];
      if (candidates.length === 0) return "-";

      const targetDate = parseEventDate(exDate);
      const subjectNorm = cleanCompText(subject);

      const scored = candidates.map((item) => {
        const desc = String(item?.desc ?? "");
        const descNorm = cleanCompText(desc);
        const strongMatch =
          subjectNorm && (descNorm.includes(subjectNorm) || subjectNorm.includes(descNorm)) ? 1 : 0;
        const annDateStr = toText(item?.an_dt) || toText(item?.sort_date);
        const annDate = parseEventDate(annDateStr);
        let distance: number | null;
        if (targetDate === Number.NEGATIVE_INFINITY || annDate === Number.NEGATIVE_INFINITY) {
          distance = null;
        } else {
          distance = Math.abs(targetDate - annDate);
        }
        return { strongMatch, distance, item };
      });

      // Highest strong-match first, then smallest time distance (nulls last).
      scored.sort((a, b) => {
        if (a.strongMatch !== b.strongMatch) return b.strongMatch - a.strongMatch;
        const da = a.distance === null ? Number.POSITIVE_INFINITY : a.distance;
        const db = b.distance === null ? Number.POSITIVE_INFINITY : b.distance;
        return da - db;
      });
      const best = scored[0].item;
      return toText(best?.an_dt) || toText(best?.sort_date) || "-";
    };

    // --- Corporate-action rows ------------------------------------------
    for (const item of corpJson) {
      const subjectRaw = toText(item?.subject);
      const subject = subjectRaw.toLowerCase();
      const faceValue = toFloat(item?.faceVal);
      const exDate = toText(item?.exDate);
      const recordDate = toText(item?.recDate) || toText(item?.bcStartDate) || "-";

      const row: ActionRow = {
        date: exDate || recordDate || "",
        client: item?.symbol || key,
        orderType: subjectRaw || "",
        announcementDate: "-",
        exDate: exDate || "-",
        recordDate: recordDate || "-",
        details: subjectRaw || "-",
        quantity: "-",
        price: "-",
        exchange: "NSE",
      };

      if (subject.includes("dividend")) {
        const rupeeValues = parseRupeeValues(subjectRaw);
        const dividendAmount = rupeeValues.length ? rupeeValues.reduce((a, b) => a + b, 0) : null;
        const dividendPercent =
          dividendAmount !== null && faceValue !== null && faceValue > 0
            ? (dividendAmount / faceValue) * 100
            : null;
        row.type = inferDividendType(subjectRaw);
        row.announcementDate = findAnnouncementDate("dividend", exDate, subjectRaw);
        row.dividendAmount = dividendAmount;
        row.dividendPercent = dividendPercent;
        result.dividends.push(row);
      } else if (subject.includes("bonus")) {
        row.announcementDate = findAnnouncementDate("bonus", exDate, subjectRaw);
        row.bonusRatio = parseRatio(subjectRaw);
        result.bonusIssues.push(row);
      } else if (subject.includes("split")) {
        row.announcementDate = findAnnouncementDate("split", exDate, subjectRaw);
        row.splitRatio = parseSplitRatio(subjectRaw);
        result.stockSplits.push(row);
      } else if (subject.includes("rights")) {
        row.announcementDate = findAnnouncementDate("rights", exDate, subjectRaw);
        row.rightsRatio = parseRightsRatio(subjectRaw);
        result.rightsIssues.push(row);
      } else {
        if (subject.includes("annual general meeting") || subject.includes("agm") || subject.includes("egm")) {
          row.announcementDate = findAnnouncementDate("agm_egm", exDate, subjectRaw);
        }
        result.agmEgm.push(row);
      }
    }

    // --- Board meetings -------------------------------------------------
    const boardRows: ActionRow[] = [];
    for (const item of boardJson) {
      const meetingDate =
        item?.bm_date || item?.bmDate || item?.proposedMeetingDate || item?.date || "";
      const announcementDate = item?.bm_timestamp || item?.sysTime || "";
      const agenda = item?.bm_desc || item?.bm_purpose || item?.purpose || "Board Meeting";
      boardRows.push({
        date: String(meetingDate),
        client: item?.sm_name || item?.bm_symbol || item?.symbol || key,
        orderType: item?.bm_purpose || "Board Meeting",
        agenda: String(agenda),
        announcementDate: String(announcementDate),
        quantity: "-",
        price: "-",
        exchange: "NSE",
      });
    }
    boardRows.sort((a, b) => {
      const da = parseEventDate(String(a.date || ""));
      const db = parseEventDate(String(b.date || ""));
      if (da !== db) return db - da;
      const aa = parseEventDate(String(a.announcementDate || ""));
      const ab = parseEventDate(String(b.announcementDate || ""));
      if (aa !== ab) return ab - aa;
      return String(b.agenda || "").length - String(a.agenda || "").length;
    });
    const seenBoardDates = new Set<string>();
    for (const row of boardRows) {
      const dateKey = String(row.date || "");
      if (seenBoardDates.has(dateKey)) continue;
      seenBoardDates.add(dateKey);
      result.boardMeetings.push(row);
    }

    // --- Insider trades -------------------------------------------------
    for (const item of insiderJson) {
      const bq = String(item?.buyQuantity ?? "");
      const sq = String(item?.sellQuantity ?? "");
      const isBuy = bq && !["0", "0.00", "-"].includes(bq);
      const isSell = sq && !["0", "0.00", "-"].includes(sq);
      const tType = isBuy ? "Buy" : isSell ? "Sell" : "Unknown";
      const qty = tType === "Buy" ? bq : tType === "Sell" ? sq : "-";
      result.insiderTrades.push({
        date: String(item?.date || ""),
        client: item?.acqName || item?.company || key,
        orderType: item?.acqMode || item?.acqtoDt || "Insider Trade",
        transactionType: tType,
        quantity: qty,
        price: item?.secVal || "-",
        exchange: "NSE",
      });
    }

    // --- Bulk / block deals ---------------------------------------------
    for (const item of bulkJson) {
      result.bulkDeals.push({
        date: String(item?.BD_DT_DATE || ""),
        client: item?.BD_CLIENT_NAME || key,
        orderType: item?.BD_BUY_SELL || "Bulk Deal",
        dealType: "Bulk",
        quantity: item?.BD_QTY_TRD || "-",
        price: item?.BD_TP_WATP || "-",
        exchange: "NSE",
      });
    }
    for (const item of blockJson) {
      result.blockDeals.push({
        date: String(item?.BD_DT_DATE || ""),
        client: item?.BD_CLIENT_NAME || key,
        orderType: item?.BD_BUY_SELL || "Block Deal",
        dealType: "Block",
        quantity: item?.BD_QTY_TRD || "-",
        price: item?.BD_TP_WATP || "-",
        exchange: "NSE",
      });
    }

    // --- Final sorting + merged `deals` ---------------------------------
    const sortDescByExOrDate = (a: ActionRow, b: ActionRow) =>
      parseEventDate(String(b.exDate || b.date || "")) - parseEventDate(String(a.exDate || a.date || ""));
    result.dividends.sort(sortDescByExOrDate);
    result.bonusIssues.sort(sortDescByExOrDate);
    result.stockSplits.sort(sortDescByExOrDate);
    result.rightsIssues.sort(sortDescByExOrDate);
    result.agmEgm.sort(sortDescByExOrDate);

    const sortDescByDate = (a: ActionRow, b: ActionRow) =>
      parseEventDate(String(b.date || "")) - parseEventDate(String(a.date || ""));
    result.bulkDeals.sort(sortDescByDate);
    result.blockDeals.sort(sortDescByDate);

    // merge_deal_rows: tag dealType, dedupe, sort desc by date.
    const combined: ActionRow[] = [];
    const seen = new Set<string>();
    for (const [dealType, rows] of [
      ["Bulk", result.bulkDeals],
      ["Block", result.blockDeals],
    ] as Array<[string, ActionRow[]]>) {
      for (const r of rows) {
        const merged: ActionRow = { ...r, dealType };
        const rowKey = [
          String(merged.date || ""),
          String(merged.client || ""),
          String(merged.quantity || ""),
          String(merged.price || ""),
          String(merged.exchange || ""),
          String(merged.dealType || ""),
          String(merged.orderType || ""),
        ].join("|");
        if (seen.has(rowKey)) continue;
        seen.add(rowKey);
        combined.push(merged);
      }
    }
    combined.sort(sortDescByDate);
    result.deals = combined;

    return result;
  } catch {
    // Even on a catastrophic failure return the empty skeleton (never null/throw
    // here is acceptable — caller treats this section defensively).
    return result;
  }
}

// ---------------------------------------------------------------------------
// 4. SHAREHOLDING HISTORY — getNseShareholdingHistory
//
// NSE's own shareholding-pattern master feed. Yahoo's `institutionOwnership`
// module only gives a single current snapshot; this endpoint returns one row
// per quarterly filing going back years, giving real year/quarter-wise trend
// data. NOTE: this specific feed only discloses Promoter% and Public% (the
// FII/DII split isn't itself broken out here — that finer breakdown is only
// in each filing's full XBRL document, which isn't practical to parse
// per-request). Historical points therefore carry fii=0/dii=0; callers that
// want the current quarter's real FII/DII split should overlay it onto the
// most recent point from another source (see dashboard.ts).
// ---------------------------------------------------------------------------

const NSE_MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** Parse NSE's "DD-MON-YYYY" date format (e.g. "31-MAR-2026") to ISO "YYYY-MM-DD". */
function parseNseDMonY(raw: unknown): string {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(String(raw ?? "").trim());
  if (!m) return "";
  const month = NSE_MONTHS[m[2].toUpperCase()];
  if (!month) return "";
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

export async function getNseShareholdingHistory(
  base: string,
  signal?: AbortSignal
): Promise<ShareholdingPoint[] | null> {
  try {
    const key = baseSymbol(base);
    const url = `${NSE_BASE}/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(key)}`;
    const payload = await nseGetJson<any[]>(url, 6000, signal);
    if (!Array.isArray(payload) || payload.length === 0) return null;

    // NSE returns filings newest-broadcast-first; a quarter can have more
    // than one row (revisions/resubmissions), so keep only the first
    // (=newest) row seen per quarter-end date.
    const byQuarter = new Map<string, ShareholdingPoint>();
    for (const row of payload) {
      if (!row || typeof row !== "object") continue;
      const quarter = parseNseDMonY(row.date);
      if (!quarter || byQuarter.has(quarter)) continue;
      const promoters = toFloat(row.pr_and_prgrp);
      const publicVal = toFloat(row.public_val);
      if (promoters === null && publicVal === null) continue;
      byQuarter.set(quarter, {
        quarter,
        promoters: promoters ?? Math.max(0, 100 - (publicVal ?? 0)),
        fii: 0,
        dii: 0,
        public: publicVal ?? Math.max(0, 100 - (promoters ?? 0)),
      });
    }
    if (byQuarter.size === 0) return null;

    // Newest first, matching how normalizeShareholding treats history[0] as latest.
    return Array.from(byQuarter.values())
      .sort((a, b) => (a.quarter < b.quarter ? 1 : a.quarter > b.quarter ? -1 : 0))
      .slice(0, 20);
  } catch {
    return null;
  }
}

export type NseMarketStatusSnapshot = {
  capitalMarketOpen: boolean;
  anyMarketOpen: boolean;
  openMarkets: string[];
  asOf: string;
};

function displayMarketName(value: unknown): string {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "capitalmarket") return "Capital Market";
  if (normalized === "currency" || normalized === "currencyfuture") return "Currency";
  if (normalized === "commodity") return "Commodity";
  if (normalized === "debt") return "Debt";
  return raw;
}

export function parseNseMarketStatus(payload: unknown): NseMarketStatusSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const rows = (payload as { marketState?: unknown }).marketState;
  if (!Array.isArray(rows)) return null;

  const openMarkets = new Set<string>();
  let capitalMarketOpen = false;
  let asOf = "";
  let sawMarket = false;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const market = displayMarketName(record.market);
    const status = String(record.marketStatus ?? "").trim();
    if (!market || !status) continue;
    sawMarket = true;
    const isOpen = /\bopen\b/i.test(status) && !/\bclosed\b/i.test(status);
    if (isOpen) openMarkets.add(market);
    if (market === "Capital Market") {
      capitalMarketOpen = isOpen;
      asOf = String(record.tradeDate ?? "").trim();
    } else if (!asOf) {
      asOf = String(record.tradeDate ?? "").trim();
    }
  }

  if (!sawMarket) return null;
  return {
    capitalMarketOpen,
    anyMarketOpen: openMarkets.size > 0,
    openMarkets: Array.from(openMarkets),
    asOf,
  };
}

let marketStatusCache: { loadedAt: number; value: NseMarketStatusSnapshot } | null = null;
let marketStatusPending: Promise<NseMarketStatusSnapshot | null> | null = null;

export async function getNseMarketStatus(signal?: AbortSignal): Promise<NseMarketStatusSnapshot | null> {
  if (marketStatusCache && Date.now() - marketStatusCache.loadedAt < 15_000) {
    return marketStatusCache.value;
  }
  if (marketStatusPending) return marketStatusPending;

  marketStatusPending = (async () => {
    const payload = await nseGetJson(`${NSE_BASE}/api/marketStatus`, 6000, signal);
    const parsed = parseNseMarketStatus(payload);
    if (parsed) marketStatusCache = { loadedAt: Date.now(), value: parsed };
    return parsed;
  })().finally(() => {
    marketStatusPending = null;
  });
  return marketStatusPending;
}

// ---------------------------------------------------------------------------
// Default export implementing the NseProviderApi contract.
// ---------------------------------------------------------------------------

const nseProviderApi: NseProviderApi = {
  getNseQuote,
  getNseCorporateEvents,
  getNseQuarterlyResults,
};

export default nseProviderApi;
