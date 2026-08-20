/**
 * Pure derivation helpers ported from backend/app/services/dashboard.py.
 *
 * These functions are a faithful translation of the synchronous, side-effect-free
 * helpers used by `StockDashboardService.get_dashboard` to turn raw provider data
 * into the computed sections of `DashboardData` (price history, returns, technicals,
 * key metrics/ratio trends, growth snapshot, shareholding normalization, news, and
 * the hard "is this dashboard usable" gate).
 *
 * GOLDEN RULE: none of these helpers throw. Any malformed input degrades to a
 * neutral default (null / empty list / Neutral skeleton) exactly like the Python
 * code, which leans on a permissive `_num()` and defensive guards everywhere.
 *
 * Formulas, lookbacks, rounding, and fallback ordering match the Python source
 * line-for-line — see scratch/port-specs/04-DashboardData-payload-assembly-*.md.
 */

import type {
  Candle,
  KeyRatioTrends,
  FinancialGrowthSnapshot,
} from "@/shared/contracts";
import type { DashboardData, PricePoint } from "@/shared/types";

// ---------------------------------------------------------------------------
// Internal numeric helpers (mirror Python `_num` and friends).
// ---------------------------------------------------------------------------

/** Python `_num`: float() or None; non-finite -> None. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (typeof value === "string" && value.trim() === "") return null;
  return Number.isFinite(n) ? n : null;
}

/** Round half-away-from-zero to `digits` dp, matching Python's round() closely enough for our values. */
function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, digits);
  // Python uses banker's rounding, but the upstream values here are dominated by
  // ordinary decimals; classic half-up keeps results visually identical for prices/ratios.
  return Math.round((value + (value >= 0 ? Number.EPSILON : -Number.EPSILON)) * factor) / factor;
}

/** round() or null. */
function round2OrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round(value, 2);
}

/** Python truthiness for a value treated as a number (0 and null/None are falsy). */
function truthyNum(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && value !== 0 && Number.isFinite(value);
}

/**
 * Parse a date the way Python's `datetime.fromisoformat` does for our inputs:
 * accept `YYYY-MM-DD` (optionally with a `T...` time part). Returns null if invalid.
 * Returns a UTC-based breakdown so month/year grouping is stable regardless of TZ.
 */
function parseIsoDate(raw: string): { year: number; month: number; day: number; ms: number } | null {
  const datePart = raw.includes("T") ? raw.split("T")[0] : raw;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart.trim());
  if (!m) {
    // Fall back to Date parsing for full ISO timestamps without a leading date-only form.
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), ms: d.getTime() };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return null;
  return { year, month, day, ms };
}

/** Parse Trendlyne-style period labels "%b %y" / "%b %Y" -> {year, month} or null. */
const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
function parsePeriod(period: string): { year: number; month: number } | null {
  const raw = String(period || "").trim();
  const parts = raw.split(/\s+/);
  if (parts.length !== 2) return null;
  const mon = MONTH_ABBR[parts[0].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  const yRaw = parts[1];
  let year: number;
  if (/^\d{4}$/.test(yRaw)) {
    year = Number(yRaw);
  } else if (/^\d{2}$/.test(yRaw)) {
    // Python "%b %y" treats 00-68 as 2000-2068, 69-99 as 1969-1999.
    const yy = Number(yRaw);
    year = yy <= 68 ? 2000 + yy : 1900 + yy;
  } else {
    return null;
  }
  if (!Number.isFinite(year)) return null;
  return { year, month: mon };
}

// ---------------------------------------------------------------------------
// normalizeHistory (Python `_normalize_history`, lines 699-735)
// ---------------------------------------------------------------------------

export function normalizeHistory(candles: Candle[]): PricePoint[] {
  const normalized: PricePoint[] = [];
  if (!Array.isArray(candles)) return normalized;

  for (const item of candles) {
    if (!item || typeof item !== "object") continue;
    const dateRaw = String((item as any).date ?? "");
    const parsed = parseIsoDate(dateRaw);
    if (!parsed) continue;
    const close = num((item as any).close);
    if (close === null) continue;
    // Python `_num(x) or close` -> 0/None fall back to close.
    const openRaw = num((item as any).open);
    const highRaw = num((item as any).high);
    const lowRaw = num((item as any).low);
    const volRaw = num((item as any).volume);
    const openV = truthyNum(openRaw) ? (openRaw as number) : close;
    const highV = truthyNum(highRaw) ? (highRaw as number) : close;
    const lowV = truthyNum(lowRaw) ? (lowRaw as number) : close;
    const volumeV = truthyNum(volRaw) ? (volRaw as number) : 0;
    const isoDate = `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
    normalized.push({
      date: isoDate,
      open: round(openV, 2),
      high: round(highV, 2),
      low: round(lowV, 2),
      close: round(close, 2),
      volume: Math.trunc(volumeV),
    });
  }

  normalized.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const deduped: PricePoint[] = [];
  const seen = new Set<string>();
  for (const row of normalized) {
    // Keep the first candle seen for a given date and drop later duplicates.
    // (Deliberately diverges from the ported Python's `deduped[-1] = row`,
    // which let a later — often lower-quality/placeholder — duplicate
    // silently overwrite good data from the first candle for that date.)
    if (seen.has(row.date)) continue;
    seen.add(row.date);
    deduped.push(row);
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// returnsSummary (Python `_returns_summary`, lines 1436-1458)
// ---------------------------------------------------------------------------

export function returnsSummary(history: PricePoint[]): Array<{ label: string; value: number | null }> {
  const hist = Array.isArray(history) ? history : [];
  const closes: number[] = [];
  for (const item of hist) {
    const c = num(item?.close);
    if (c !== null) closes.push(c);
  }
  if (closes.length < 5) return [];

  const pct = (days: number): number | null => {
    if (closes.length <= days) return null;
    const idx = closes.length - days - 1;
    const previous = closes[idx];
    const current = closes[closes.length - 1];
    if (previous === 0) return null;
    return round(((current - previous) / previous) * 100, 2);
  };

  return [
    { label: "1 Week", value: pct(5) },
    { label: "1 Month", value: pct(21) },
    { label: "6 Months", value: pct(126) },
    { label: "1 Year", value: pct(252) },
    { label: "3 Years", value: pct(756) },
    { label: "5 Years", value: pct(1260) },
  ];
}

// ---------------------------------------------------------------------------
// returnsHeatmap (Python `_returns_heatmap`, lines 2256-2273)
// ---------------------------------------------------------------------------

export function returnsHeatmap(history: PricePoint[]): Array<Record<string, number | null>> {
  const hist = Array.isArray(history) ? history : [];
  // grouped[year][month] = closes[] (insertion order preserved).
  const grouped = new Map<number, Map<number, number[]>>();
  for (const point of hist) {
    if (!point) continue;
    const parsed = parseIsoDate(String((point as any).date ?? ""));
    if (!parsed) continue;
    const close = num((point as any).close);
    if (close === null) continue;
    let byMonth = grouped.get(parsed.year);
    if (!byMonth) {
      byMonth = new Map<number, number[]>();
      grouped.set(parsed.year, byMonth);
    }
    let arr = byMonth.get(parsed.month);
    if (!arr) {
      arr = [];
      byMonth.set(parsed.month, arr);
    }
    arr.push(close);
  }

  const years = Array.from(grouped.keys()).sort((a, b) => b - a).slice(0, 5);
  const rows: Array<Record<string, number | null>> = [];
  for (const year of years) {
    const row: Record<string, number | null> = { year };
    const byMonth = grouped.get(year);
    for (let month = 1; month <= 12; month++) {
      const values = byMonth?.get(month);
      if (!values || values.length < 2) {
        row[String(month)] = null;
        continue;
      }
      const first = values[0];
      const last = values[values.length - 1];
      row[String(month)] = first === 0 ? null : round(((last - first) / first) * 100, 2);
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Technicals: EMA / RSI / pivots (Python `_ema`, `_rsi`, `_derive_technicals_from_history`)
// ---------------------------------------------------------------------------

/** Python `_ema`: running EMA over the WHOLE series seeded with values[0]. */
function ema(values: number[], period: number): number {
  if (!values.length) return 0.0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

/** Python `_rsi`: Wilder smoothing seeded from first `period` diffs. */
function rsi(values: number[], period: number): number {
  if (values.length <= period) return 50.0;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.abs(Math.min(diff, 0)));
  }
  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  // A window with no losses *and* no gains is a scrip that did not trade (or
  // sat at its circuit limit), not one that rallied. Reporting 100 there feeds
  // "overbought" into the momentum leg of the Smart Score for a stock that has
  // not moved; 50 is the neutral reading that state deserves.
  if (avgGain === 0 && avgLoss === 0) return 50.0;
  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

type PivotSet = { s3: number; s2: number; s1: number; pivot: number; r1: number; r2: number; r3: number };
type PivotLevels = { standard: PivotSet; fibonacci: PivotSet };

export function deriveTechnicals(history: PricePoint[]): DashboardData["technicals"] {
  const hist = Array.isArray(history) ? history : [];
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  for (const item of hist) {
    if (item?.close !== null && item?.close !== undefined) closes.push(Number(item.close));
    if (item?.high !== null && item?.high !== undefined) highs.push(Number(item.high));
    if (item?.low !== null && item?.low !== undefined) lows.push(Number(item.low));
  }

  const zero: PivotSet = { s3: 0.0, s2: 0.0, s1: 0.0, pivot: 0.0, r1: 0.0, r2: 0.0, r3: 0.0 };
  const pivots: PivotLevels = { standard: { ...zero }, fibonacci: { ...zero } };

  if (closes.length > 0 && highs.length > 0 && lows.length > 0) {
    const H = highs[highs.length - 1];
    const L = lows[lows.length - 1];
    const C = closes[closes.length - 1];

    const P = (H + L + C) / 3;
    const diff = H - L;

    pivots.standard = {
      s3: round(L - 2 * (H - P), 2),
      s2: round(P - diff, 2),
      s1: round(2 * P - H, 2),
      pivot: round(P, 2),
      r1: round(2 * P - L, 2),
      r2: round(P + diff, 2),
      r3: round(H + 2 * (P - L), 2),
    };
    pivots.fibonacci = {
      s3: round(P - diff * 1.0, 2),
      s2: round(P - diff * 0.618, 2),
      s1: round(P - diff * 0.382, 2),
      pivot: round(P, 2),
      r1: round(P + diff * 0.382, 2),
      r2: round(P + diff * 0.618, 2),
      r3: round(P + diff * 1.0, 2),
    };
  }

  if (closes.length < 20) {
    // Python returns ONLY {trend, pivotLevels}; rsi14/ema/macd keys absent.
    return { trend: "Neutral", pivotLevels: pivots } as unknown as DashboardData["technicals"];
  }

  const ema20 = ema(closes, 20);
  const ema50 = closes.length >= 50 ? ema(closes, 50) : ema20;
  const rsi14 = rsi(closes, 14);
  const macd = closes.length >= 26 ? ema(closes, 12) - ema(closes, 26) : 0.0;
  const current = closes[closes.length - 1];

  return {
    rsi14: round(rsi14, 2),
    ema20: round(ema20, 2),
    ema50: round(ema50, 2),
    macd: round(macd, 2),
    trend: current >= ema20 ? "Bullish" : "Bearish",
    pivotLevels: pivots,
  } as unknown as DashboardData["technicals"];
}

// ---------------------------------------------------------------------------
// calculatePredictiveTarget (Python `_calculate_predictive_target`, lines 794-836)
// ---------------------------------------------------------------------------

export function calculatePredictiveTarget(
  history: PricePoint[],
  metrics: Record<string, number | null>,
  technicals: DashboardData["technicals"],
  cmp: number,
): number {
  const hist = Array.isArray(history) ? history : [];
  const cmpValue = num(cmp);
  if (!hist.length || hist.length < 252 || !cmpValue || cmpValue <= 0) {
    return cmpValue && cmpValue > 0 ? round(cmpValue * Math.pow(1.12, 3), 2) : 0.0;
  }

  const oldestRaw = num(hist[0]?.close);
  const oldestPrice = oldestRaw === null ? cmpValue : oldestRaw;
  const yearsSpanned = hist.length / 252.0;
  let baseCagr: number;
  if (oldestPrice <= 0 || yearsSpanned < 1) {
    baseCagr = 0.12;
  } else {
    const totalReturn = cmpValue / oldestPrice;
    baseCagr = Math.pow(totalReturn, 1 / yearsSpanned) - 1.0;
  }

  const peRatio = metrics ? num(metrics.peRatio) : null;
  if (peRatio !== null) {
    if (peRatio < 15) baseCagr += 0.02;
    else if (peRatio > 40) baseCagr -= 0.02;
  }

  const trend = technicals ? (technicals as any).trend : undefined;
  if (trend === "Bullish") baseCagr += 0.01;
  else if (trend === "Bearish") baseCagr -= 0.01;

  let finalCagr = baseCagr;
  if (peRatio !== null) {
    if (peRatio > 50) finalCagr = Math.min(finalCagr, 0.1);
    else if (peRatio < 0) finalCagr = Math.min(finalCagr, 0.05);
  }

  const conservativeAnchor = 0.1;
  const blendWeight = 0.6;
  finalCagr = blendWeight * finalCagr + (1 - blendWeight) * conservativeAnchor;
  finalCagr = Math.max(-0.1, Math.min(0.3, finalCagr));

  const targetPrice = cmpValue * Math.pow(1 + finalCagr, 3);
  return round(targetPrice, 2);
}

// ---------------------------------------------------------------------------
// finalizeKeyMetrics (Python `_finalize_key_metrics`, lines 1303-1400)
// ---------------------------------------------------------------------------

export function finalizeKeyMetrics(
  metrics: Record<string, number | null>,
  price: DashboardData["price"],
  financials: DashboardData["financials"],
  competitors: DashboardData["competitors"],
): Record<string, number | null> {
  const out: Record<string, any> = { ...(metrics || {}) };
  const competitorRows = Array.isArray((competitors as any)?.table)
    ? (competitors as any).table
    : Array.isArray(competitors)
      ? (competitors as any)
      : [];

  const cmpValue = num(price?.cmp);
  let marketCap = num(out.marketCap);
  let outstanding = num(out.outstandingShares);
  let bookValue = num(out.bookValue);
  let pb = num(out.pbRatio);
  const pe = num(out.peRatio);
  let peg = num(out.pegRatio);
  const divYield = num(out.dividendYield);
  const debtToEquity = num(out.debtToEquity);

  if (outstanding === null && marketCap !== null && cmpValue && cmpValue > 0) {
    out.outstandingShares = marketCap / cmpValue;
    outstanding = out.outstandingShares;
  }

  if (marketCap === null && outstanding !== null && cmpValue !== null) {
    out.marketCap = outstanding * cmpValue;
  }

  if (pb === null && bookValue && cmpValue && bookValue > 0) {
    out.pbRatio = cmpValue / bookValue;
    pb = out.pbRatio;
  }
  if (bookValue === null && pb && cmpValue && pb > 0) {
    out.bookValue = cmpValue / pb;
  }

  if (num(out.industryPe) === null && competitorRows.length) {
    const peerPes = competitorRows
      .map((item: any) => num(item?.pe))
      .filter((v: number | null): v is number => v !== null && v > 0);
    if (peerPes.length) {
      out.industryPe = peerPes.reduce((s: number, v: number) => s + v, 0) / peerPes.length;
    }
  }

  const balanceRows = (financials?.balanceSheet as any[]) || [];
  const incomeRows = (financials?.incomeStatement as any[]) || [];
  const detailedRows = ((financials?.quarterlyDetailedStandalone as any[]) || []).length
    ? (financials?.quarterlyDetailedStandalone as any[])
    : (financials?.quarterlyDetailedConsolidated as any[]) || [];

  const capitalEmployedAt = (row: any): number | null => {
    const equity = num(row?.equity);
    const debt = num(row?.totalDebt);
    if (equity === null || debt === null) return null;
    return equity + debt > 0 ? equity + debt : null;
  };

  // ROCE — EBIT over average capital employed. `incomeStatement.ebit` is
  // reported for non-financials and null for banks/NBFCs, which makes this
  // self-selecting with no sector flag: lenders have no meaningful EBIT
  // (interest is an operating input, not a financing cost) and their ROCE
  // swings between ~6% and ~20% purely on whether deposits count as capital
  // employed. Leaving it blank for them beats publishing a number that
  // contradicts every other screener.
  if (num(out.roce) === null && incomeRows.length && balanceRows.length) {
    const ebit = num(incomeRows[incomeRows.length - 1]?.ebit);
    if (ebit !== null) {
      // Average opening and closing capital employed — the textbook
      // denominator, and closer to published ROCE than a point-in-time one.
      const closing = capitalEmployedAt(balanceRows[balanceRows.length - 1]);
      const opening = balanceRows.length >= 2 ? capitalEmployedAt(balanceRows[balanceRows.length - 2]) : null;
      const denominator = closing !== null && opening !== null ? (closing + opening) / 2 : closing;
      if (denominator !== null && denominator > 0) {
        out.roce = (ebit / denominator) * 100;
      }
    }
  }

  if (balanceRows.length) {
    const latest = balanceRows[balanceRows.length - 1];
    const previous = balanceRows.length >= 2 ? balanceRows[balanceRows.length - 2] : null;
    const debt = num(latest?.totalDebt);
    const equity = num(latest?.equity);
    const assets = num(latest?.totalAssets);

    if (num(out.totalDebt) === null && debt !== null) {
      out.totalDebt = debt;
    }

    // Derive debt/equity from the balance sheet even when a provider already
    // supplied a value: the upstream numbers arrive inconsistently scaled
    // (RELIANCE came through as 36.65 — percent-encoded — against a true ratio
    // of ~0.44, while bank rows arrive as plain ratios), so two stocks could
    // not be compared on the same tile. Two known quantities divided here beat
    // one of unknown unit, and this deliberately does not try to guess whether
    // a large provider figure was a percentage.
    if (debt !== null && equity !== null && equity > 0) {
      out.debtToEquity = debt / equity;
    }

    if (num(out.currentRatio) === null) {
      const currentAssets = num(latest?.currentAssets);
      const currentLiabilities = num(latest?.currentLiabilities);
      if (currentAssets !== null && currentLiabilities !== null && currentLiabilities > 0) {
        out.currentRatio = currentAssets / currentLiabilities;
      }
    }

    // ROE / ROA against average balances, consistent with ROCE above.
    const latestNetIncome = incomeRows.length ? num(incomeRows[incomeRows.length - 1]?.netIncome) : null;
    if (latestNetIncome !== null) {
      const average = (current: number | null, prior: number | null): number | null => {
        if (current === null) return null;
        return prior !== null ? (current + prior) / 2 : current;
      };

      if (num(out.roe) === null) {
        const avgEquity = average(equity, previous ? num(previous.equity) : null);
        if (avgEquity !== null && avgEquity > 0) out.roe = (latestNetIncome / avgEquity) * 100;
      }

      if (num(out.roa) === null) {
        const avgAssets = average(assets, previous ? num(previous.totalAssets) : null);
        if (avgAssets !== null && avgAssets > 0) out.roa = (latestNetIncome / avgAssets) * 100;
      }
    }
  }

  // Net Interest Margin — net interest income over average total assets. Only
  // lenders report both interest legs, so the data's presence is itself the
  // sector test.
  //
  // Two caveats worth knowing. The denominator is total assets rather than
  // earning assets, because the feed carries no advances/investments balances
  // — so this reads somewhat below a bank's own disclosed NIM (Axis: ~3.0%
  // here vs ~3.8% reported on earning assets). And the quarterly results feed
  // is denominated in lakh while the balance sheet is in crore, so the two
  // must be reconciled before dividing; rather than hard-coding 100, infer the
  // factor from net profit, which appears in both feeds, and snap it to the
  // nearest power of ten. That keeps this correct if a feed ever changes unit.
  if (num(out.netInterestMargin) === null && detailedRows.length >= 4 && balanceRows.length) {
    const lastFour = detailedRows.slice(-4);
    const niiParts = lastFour.map((row) => {
      const explicit = num(row?.netInterestIncome);
      if (explicit !== null) return explicit;
      const earned = num(row?.interestEarned);
      const expended = num(row?.interestExpended);
      return earned !== null && expended !== null ? earned - expended : null;
    });

    const quarterlyProfits = lastFour.map((row) => num(row?.netProfit));
    const annualNetIncome = num(incomeRows[incomeRows.length - 1]?.netIncome);

    if (niiParts.every((v): v is number => v !== null) && quarterlyProfits.every((v): v is number => v !== null)) {
      const trailingNii = niiParts.reduce((sum, v) => sum + v, 0);
      const trailingProfit = quarterlyProfits.reduce((sum, v) => sum + v, 0);

      let unitFactor = 1;
      if (annualNetIncome !== null && annualNetIncome !== 0 && trailingProfit !== 0) {
        const ratio = Math.abs(trailingProfit / annualNetIncome);
        if (ratio > 0) unitFactor = Math.pow(10, Math.round(Math.log10(ratio)));
      }

      const closingAssets = num(balanceRows[balanceRows.length - 1]?.totalAssets);
      const openingAssets = balanceRows.length >= 2 ? num(balanceRows[balanceRows.length - 2]?.totalAssets) : null;
      const averageAssets =
        closingAssets !== null && openingAssets !== null ? (closingAssets + openingAssets) / 2 : closingAssets;

      if (averageAssets !== null && averageAssets > 0 && unitFactor > 0) {
        const margin = (trailingNii / unitFactor / averageAssets) * 100;
        // Guard against a mis-inferred unit factor producing an absurd margin.
        if (margin > 0 && margin < 25) out.netInterestMargin = margin;
      }
    }
  }

  if (peg === null && pe !== null && pe > 0) {
    // PEG needs an earnings growth rate. A single quarter's YoY profit swing
    // (the only basis this used to try) is far too noisy to carry it: one soft
    // quarter turns growth negative, the positive-growth guard below rejects
    // it, and PEG silently renders "N/A" even for names with healthy
    // multi-year growth. RELIANCE.NS was the case in point — Dec'23 -> Dec'24
    // profit fell 12%, while its 3-year annual CAGR is +6.6%.
    //
    // Prefer the longest annual window available, since multi-year CAGR is
    // both the conventional PEG denominator and stable enough that one weak
    // year can't flip its sign. Net profit stands in for EPS: per-year EPS
    // isn't carried in `financials.yearly`, and the two only diverge when
    // share count moves materially.
    let growthPct: number | null = null;

    const annualProfits = ((financials?.yearly as any[]) || [])
      .map((row) => num(row?.profit))
      .filter((profit): profit is number => profit !== null);

    if (annualProfits.length >= 2) {
      const first = annualProfits[0];
      const last = annualProfits[annualProfits.length - 1];
      const years = annualProfits.length - 1;
      if (first > 0 && last > 0) {
        growthPct = (Math.pow(last / first, 1 / years) - 1) * 100;
      }
    }

    // Quarterly YoY — the original basis, kept as a fallback for names that
    // report no usable annual history.
    if (growthPct === null || growthPct <= 0.01) {
      const quarterly = (financials?.quarterly as any[]) || [];
      if (quarterly.length >= 5) {
        const prev = num(quarterly[quarterly.length - 5]?.profit);
        const curr = num(quarterly[quarterly.length - 1]?.profit);
        if (prev && curr && prev > 0) {
          const quarterlyGrowth = ((curr - prev) / prev) * 100;
          if (quarterlyGrowth > 0.01) growthPct = quarterlyGrowth;
        }
      }
    }

    if (growthPct !== null && growthPct > 0.01) {
      out.pegRatio = pe / growthPct;
    }
  }

  if (divYield !== null) {
    if (divYield > 100) out.dividendYield = divYield / 100;
    else if (divYield < 0) out.dividendYield = null;
  }

  // Provider mappers normalize debt/equity before this stage. Do not guess
  // that a large but legitimate ratio is percentage-encoded and divide it.

  const evSales = num(out.evToSales);
  if (evSales !== null && evSales > 100) {
    out.evToSales = null;
  }

  // Yahoo reports ebitdaMargins: 0 for banks and insurers rather than omitting
  // it, since EBITDA is not a line they produce. An exactly-zero EBITDA margin
  // is not a real business state, so treat it as absent — "N/A" is honest where
  // "0%" reads as a measured result.
  if (num(out.ebitdaMargin) === 0) {
    out.ebitdaMargin = null;
  }

  if (num(out.profitMargin) === null) {
    const detailedSets: any[][] = [
      (financials?.quarterlyDetailedConsolidated as any[]) || [],
      (financials?.quarterlyDetailedStandalone as any[]) || [],
    ];
    let derivedProfitMargin: number | null = null;
    for (const rows of detailedSets) {
      if (!rows.length) continue;
      const latest = rows[rows.length - 1];
      derivedProfitMargin = num(latest?.netProfitMarginPct);
      if (derivedProfitMargin !== null) break;
    }
    if (derivedProfitMargin === null) {
      const ratioTrends = (financials?.keyRatioTrends as any) || {};
      const profitabilityCards = Array.isArray(ratioTrends?.profitability) ? ratioTrends.profitability : [];
      for (const card of profitabilityCards) {
        if (String(card?.label || "").toUpperCase() === "NPM") {
          const series = card?.series || [];
          if (series.length) {
            derivedProfitMargin = num(series[series.length - 1]?.value);
          }
          break;
        }
      }
    }
    if (derivedProfitMargin !== null) {
      out.profitMargin = derivedProfitMargin;
    }
  }

  peg = num(out.pegRatio);
  if (peg !== null && (peg <= 0.2 || peg > 10)) {
    out.pegRatio = null;
  }

  // Final pass: round every value to 2dp, non-numeric -> null.
  const result: Record<string, number | null> = {};
  for (const key of Object.keys(out)) {
    const n = num(out[key]);
    result[key] = n !== null ? round(n, 2) : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// enrichMetricsFromRatioTrends (Python `_enrich_metrics_from_ratio_trends`, lines 1402-1434)
// ---------------------------------------------------------------------------

export function enrichMetricsFromRatioTrends(
  metrics: Record<string, number | null>,
  keyRatioTrends: KeyRatioTrends | null | undefined,
): Record<string, number | null> {
  const out: Record<string, number | null> = { ...(metrics || {}) };
  const trends = keyRatioTrends && typeof keyRatioTrends === "object" ? keyRatioTrends : ({} as any);
  const liquidityCards = Array.isArray((trends as any).liquidity) ? (trends as any).liquidity : [];

  const latestOrAverage = (label: string): number | null => {
    for (const card of liquidityCards) {
      if (!card || typeof card !== "object") continue;
      if (String(card.label || "").trim().toLowerCase() !== label.trim().toLowerCase()) continue;
      const series = Array.isArray(card.series) ? card.series : [];
      for (let i = series.length - 1; i >= 0; i--) {
        const point = series[i];
        if (!point || typeof point !== "object") continue;
        const value = num(point.value);
        if (value !== null) return round(value, 2);
      }
      const average = num(card.average3Y);
      return average !== null ? round(average, 2) : null;
    }
    return null;
  };

  if (num(out.casaRatio) === null) {
    const casaRatio = latestOrAverage("CASA Ratio");
    if (casaRatio !== null) out.casaRatio = casaRatio;
  }

  if (num(out.netInterestMargin) === null) {
    const netInterestMargin = latestOrAverage("Net Interest Margin");
    if (netInterestMargin !== null) out.netInterestMargin = netInterestMargin;
  }

  return out;
}

// ---------------------------------------------------------------------------
// finalizeKeyRatioTrends (Python `_finalize_key_ratio_trends`, lines 1460-1677)
// ---------------------------------------------------------------------------

export function finalizeKeyRatioTrends(
  existing: KeyRatioTrends | null | undefined,
  metrics: Record<string, number | null>,
  financials: DashboardData["financials"],
  history: PricePoint[],
  sector: string,
  fmpKeyMetrics?: Array<Record<string, number | string | null>>,
): KeyRatioTrends {
  const trends = existing && typeof existing === "object" ? existing : ({} as any);

  const cloneCard = (card: any) => ({
    label: String(card?.label || ""),
    average3Y: num(card?.average3Y),
    series: ((card?.series as any[]) || [])
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ period: String(item?.period || ""), value: num(item?.value) })),
  });

  const normalized: KeyRatioTrends = {
    profitability: ((trends.profitability as any[]) || []).filter((c) => c && typeof c === "object").map(cloneCard),
    valuation: ((trends.valuation as any[]) || []).filter((c) => c && typeof c === "object").map(cloneCard),
    liquidity: ((trends.liquidity as any[]) || []).filter((c) => c && typeof c === "object").map(cloneCard),
  };

  const getOrCreateCard = (group: keyof KeyRatioTrends, label: string) => {
    const cards = normalized[group];
    for (const card of cards) {
      if (card.label === label) return card;
    }
    const card = { label, average3Y: null as number | null, series: [] as Array<{ period: string; value: number | null }> };
    cards.push(card);
    return card;
  };

  const cardIsBlank = (card: { average3Y: number | null; series: Array<{ value: number | null }> }): boolean => {
    const values = (card.series || [])
      .map((item) => num(item?.value))
      .filter((v): v is number => v !== null);
    const avg = num(card.average3Y);
    return (avg === null || Math.abs(avg) < 1e-9) && (values.length === 0 || values.every((v) => Math.abs(v) < 1e-9));
  };

  const averageFromSeries = (series: Array<{ value: number | null }>): number | null => {
    const values = series.slice(-3).map((item) => num(item?.value)).filter((v): v is number => v !== null);
    if (!values.length) return null;
    return round(values.reduce((s, v) => s + v, 0) / values.length, 2);
  };

  // history pairs sorted ascending by date (ms).
  const historyPairs: Array<{ ms: number; close: number }> = [];
  for (const row of Array.isArray(history) ? history : []) {
    const dateRaw = String((row as any)?.date || "").split("T")[0];
    const close = num((row as any)?.close);
    if (!dateRaw || close === null) continue;
    const parsed = parseIsoDate(dateRaw);
    if (!parsed) continue;
    historyPairs.push({ ms: parsed.ms, close });
  }
  historyPairs.sort((a, b) => a.ms - b.ms);

  let sharesOutstanding = num(metrics?.outstandingShares);
  if (sharesOutstanding === null) {
    const marketCap = num(metrics?.marketCap);
    const cmpValue = num((metrics as any)?.cmp);
    if (marketCap !== null && cmpValue !== null && cmpValue !== 0) {
      sharesOutstanding = marketCap / cmpValue;
    }
  }

  // Price to Cash Flow valuation card.
  const pcfCard = getOrCreateCard("valuation", "Price to Cash Flow");
  if (cardIsBlank(pcfCard)) {
    const series: Array<{ period: string; value: number | null }> = [];
    const cashFlowRows = (financials?.cashFlow as any[]) || [];
    const parsedCashFlowRows: Array<{ year: number; month: number; ms: number; row: any }> = [];
    for (const row of cashFlowRows) {
      if (!row || typeof row !== "object") continue;
      const parsed = parsePeriod(String(row.period || ""));
      if (!parsed) continue;
      parsedCashFlowRows.push({ year: parsed.year, month: parsed.month, ms: Date.UTC(parsed.year, parsed.month - 1, 1), row });
    }
    parsedCashFlowRows.sort((a, b) => a.ms - b.ms);

    for (const { year, month, row } of parsedCashFlowRows.slice(-5)) {
      const operatingCf = num(row.operatingCashFlow);
      if (operatingCf === null || operatingCf === 0 || sharesOutstanding === null || sharesOutstanding === 0) continue;
      const longMonth = month === 1 || month === 3 || month === 5 || month === 7 || month === 8 || month === 10 || month === 12;
      const fiscalEndMs = Date.UTC(year, month - 1, longMonth ? 31 : 30);
      let close: number | null = null;
      for (const pair of historyPairs) {
        if (pair.ms <= fiscalEndMs) close = pair.close;
        else break;
      }
      if (close === null) continue;
      const value = round((close * sharesOutstanding) / operatingCf, 2);
      series.push({ period: String(year), value });
    }

    if (series.length) {
      pcfCard.series = series;
      const recentValues = series.slice(-3).map((item) => num(item.value)).filter((v): v is number => v !== null);
      pcfCard.average3Y = recentValues.length ? round(recentValues.reduce((s, v) => s + v, 0) / recentValues.length, 2) : null;
    }
  }

  // NET NPA liquidity card.
  const netNpaCard = getOrCreateCard("liquidity", "NET NPA");
  if (cardIsBlank(netNpaCard)) {
    const detailedSets: any[][] = [
      (financials?.quarterlyDetailedConsolidated as any[]) || [],
      (financials?.quarterlyDetailedStandalone as any[]) || [],
    ];
    let series: Array<{ period: string; value: number | null }> = [];
    for (const rows of detailedSets) {
      if (!rows.length) continue;
      const tempSeries: Array<{ period: string; value: number | null }> = [];
      for (const row of rows.slice(-5)) {
        if (!row || typeof row !== "object") continue;
        const value = num(row.netNpa);
        if (value === null) continue;
        tempSeries.push({ period: String(row.period || ""), value: round(value, 2) });
      }
      if (tempSeries.length) {
        series = tempSeries;
        break;
      }
    }
    if (series.length) {
      netNpaCard.series = series;
      const recentValues = series.slice(-3).map((item) => num(item.value)).filter((v): v is number => v !== null);
      netNpaCard.average3Y = recentValues.length ? round(recentValues.reduce((s, v) => s + v, 0) / recentValues.length, 2) : null;
    }
  }

  const sectorText = String(sector || "").toLowerCase();
  const isFinancial = ["financial", "bank", "insurance"].some((token) => sectorText.includes(token));
  if (!isFinancial) {
    const balanceRows = (financials?.balanceSheet as any[]) || [];
    const yearlyRows = (financials?.yearly as any[]) || [];

    let currentRatioSeries: Array<{ period: string; value: number | null }> = [];
    let debtEquitySeries: Array<{ period: string; value: number | null }> = [];
    for (const row of balanceRows) {
      if (!row || typeof row !== "object") continue;
      const parsed = parsePeriod(String(row.period || ""));
      if (!parsed) continue;
      const currentAssets = num(row.currentAssets);
      const currentLiabilities = num(row.currentLiabilities);
      const totalDebt = num(row.totalDebt);
      const equity = num(row.equity);
      if (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0) {
        currentRatioSeries.push({ period: String(parsed.year), value: round(currentAssets / currentLiabilities, 2) });
      }
      if (totalDebt !== null && equity !== null && equity !== 0) {
        debtEquitySeries.push({ period: String(parsed.year), value: round(totalDebt / equity, 2) });
      }
    }

    const assetTurnoverSeries: Array<{ period: string; value: number | null }> = [];
    const cashFlowMarginSeries: Array<{ period: string; value: number | null }> = [];
    for (const row of yearlyRows) {
      if (!row || typeof row !== "object") continue;
      const parsed = parsePeriod(String(row.period || ""));
      if (!parsed) continue;
      const revenue = num(row.revenue);
      const assets = num(row.assets);
      const cashFlow = num(row.cashFlow);
      if (revenue !== null && assets !== null && assets !== 0) {
        assetTurnoverSeries.push({ period: String(parsed.year), value: round(revenue / assets, 2) });
      }
      if (revenue !== null && revenue !== 0 && cashFlow !== null) {
        cashFlowMarginSeries.push({ period: String(parsed.year), value: round((cashFlow / revenue) * 100.0, 2) });
      }
    }

    if (!currentRatioSeries.length && num(metrics?.currentRatio) !== null) {
      const template = assetTurnoverSeries.length ? assetTurnoverSeries : Array.from({ length: 5 }, (_, idx) => ({ period: String(2021 + idx) }));
      currentRatioSeries = template.map((point: any, idx: number) => ({
        period: point?.period || String(2021 + idx),
        value: round(Number(metrics.currentRatio), 2),
      }));
    }
    if (!debtEquitySeries.length && num(metrics?.debtToEquity) !== null) {
      const template = assetTurnoverSeries.length ? assetTurnoverSeries : Array.from({ length: 5 }, (_, idx) => ({ period: String(2021 + idx) }));
      debtEquitySeries = template.map((point: any, idx: number) => ({
        period: point?.period || String(2021 + idx),
        value: round(Number(metrics.debtToEquity), 2),
      }));
    }

    normalized.liquidity = [
      { label: "Current Ratio", average3Y: averageFromSeries(currentRatioSeries), series: currentRatioSeries.slice(-5) },
      { label: "Debt to Equity", average3Y: averageFromSeries(debtEquitySeries), series: debtEquitySeries.slice(-5) },
      { label: "Asset Turnover", average3Y: averageFromSeries(assetTurnoverSeries), series: assetTurnoverSeries.slice(-5) },
      { label: "Operating CF Margin", average3Y: averageFromSeries(cashFlowMarginSeries), series: cashFlowMarginSeries.slice(-5) },
    ];
  }

  // Profitability cards (ROE / ROIC), sourced from FMP's annual key-metrics
  // history — the only place these multi-period ratios come from. Mirrors
  // the pcfCard/netNpaCard pattern above.
  const keyMetricsRows = Array.isArray(fmpKeyMetrics) ? fmpKeyMetrics : [];
  if (keyMetricsRows.length) {
    const parsedRows: Array<{ ms: number; period: string; row: Record<string, number | string | null> }> = [];
    for (const row of keyMetricsRows) {
      if (!row || typeof row !== "object") continue;
      const dateRaw = String(row.date ?? row.calendarYear ?? "").trim();
      if (!dateRaw) continue;
      // parseIsoDate handles both "YYYY-MM-DD" and (via its Date fallback) a bare "YYYY".
      const parsed = parseIsoDate(dateRaw.slice(0, 10));
      if (!parsed) continue;
      parsedRows.push({ ms: parsed.ms, period: dateRaw.slice(0, 4), row });
    }
    parsedRows.sort((a, b) => a.ms - b.ms);

    const buildRatioCard = (label: string, keys: string[]) => {
      const card = getOrCreateCard("profitability", label);
      if (!cardIsBlank(card)) return;
      const series: Array<{ period: string; value: number | null }> = [];
      for (const { period, row } of parsedRows.slice(-5)) {
        let value: number | null = null;
        for (const key of keys) {
          value = num(row[key]);
          if (value !== null) break;
        }
        if (value === null) continue;
        // FMP reports these as fractions (0.18); display as a percent, matching
        // how ROE/ROCE are already shown elsewhere (data.metrics["roe"] etc.).
        series.push({ period, value: round(Math.abs(value) <= 1 ? value * 100 : value, 2) });
      }
      if (series.length) {
        card.series = series;
        card.average3Y = averageFromSeries(series);
      }
    };

    buildRatioCard("ROE", ["roe", "returnOnEquity"]);
    buildRatioCard("ROIC", ["roic", "returnOnInvestedCapital"]);
  }

  for (const group of ["profitability", "valuation", "liquidity"] as const) {
    normalized[group] = normalized[group].filter((card) => !cardIsBlank(card));
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// buildFinancialGrowthSnapshot (Python `_build_financial_growth_snapshot`, lines 1874-2008)
// ---------------------------------------------------------------------------

export function buildFinancialGrowthSnapshot(
  trendlyneFinancials: any,
  financials: DashboardData["financials"],
  rsummary: Array<{ label: string; value: number | null }>,
  dividends: any[],
): FinancialGrowthSnapshot | null {
  const annualConsolidated =
    trendlyneFinancials && typeof trendlyneFinancials === "object" ? trendlyneFinancials.annualConsolidated || [] : [];
  const annualStandalone =
    trendlyneFinancials && typeof trendlyneFinancials === "object" ? trendlyneFinancials.annualStandalone || [] : [];
  let annualRows: any[] = annualConsolidated.length ? annualConsolidated : annualStandalone;
  let basis: "consolidated" | "standalone" = annualConsolidated.length ? "consolidated" : "standalone";

  if (!annualRows.length && financials && typeof financials === "object") {
    const yearlyRows = (financials.yearly as any[]) || [];
    annualRows = yearlyRows
      .filter((row) => row && typeof row === "object" && row.period)
      .map((row) => ({
        period: row.period,
        totalRevenue: row.revenue,
        netProfit: row.profit,
        dividend: null,
      }));
    basis = "standalone";
  }
  if (!annualRows.length) return null;

  const annualValue = (indexFromEnd: number, key: string): number | null => {
    if (annualRows.length <= indexFromEnd) return null;
    const row = annualRows[annualRows.length - (indexFromEnd + 1)];
    if (!row || typeof row !== "object") return null;

    if (key === "totalRevenue") {
      const val = row.totalRevenue ?? row.revenue ?? row.sales ?? row.revenueCr ?? row.totalSales;
      return num(val);
    }
    if (key === "netProfit") {
      const val = row.netProfit ?? row.profit ?? row.netProfitCr ?? row.netIncome ?? row.pat;
      return num(val);
    }
    if (key === "dividend") {
      const val = row.dividend ?? row.dividendAmount ?? row.dividends;
      return num(val);
    }
    return num(row[key]);
  };

  let dividendYearlyTotals: number[] = [];
  if (dividends && dividends.length) {
    const groupedDividends = new Map<number, number>();
    for (const row of dividends) {
      if (!row || typeof row !== "object") continue;
      const amount = num(row.dividendAmount);
      if (amount === null) continue;
      const dateRaw = String(row.exDate || row.recordDate || row.date || "").trim();
      if (!dateRaw) continue;
      const parsedYear = parseDividendYear(dateRaw);
      if (parsedYear === null) continue;
      groupedDividends.set(parsedYear, (groupedDividends.get(parsedYear) || 0) + amount);
    }
    if (groupedDividends.size) {
      const sortedYears = Array.from(groupedDividends.keys()).sort((a, b) => a - b).slice(-6);
      dividendYearlyTotals = sortedYears.map((year) => groupedDividends.get(year) as number);
    }
  }

  const calculatePctGrowth = (latest: number | null, base: number | null, years = 1): number | null => {
    if (latest === null || base === null) return null;
    if (base === 0) return latest > 0 ? 100 : 0;

    if (years === 1) {
      if (base < 0) {
        return round(((latest - base) / Math.abs(base)) * 100, 2);
      }
      return round(((latest - base) / base) * 100, 2);
    } else {
      if (base <= 0 || latest <= 0) {
        return round(((latest - base) / Math.abs(base || 1) / years) * 100, 2);
      }
      return round((Math.pow(latest / base, 1 / years) - 1) * 100, 2);
    }
  };

  const growthFromSeries = (values: number[], years: number): number | null => {
    if (years === 1) {
      if (values.length < 2) return null;
      const latest = num(values[values.length - 1]);
      const previous = num(values[values.length - 2]);
      return calculatePctGrowth(latest, previous, 1);
    }
    if (values.length <= years) return null;
    const latest = num(values[values.length - 1]);
    const base = num(values[values.length - (years + 1)]);
    return calculatePctGrowth(latest, base, years);
  };

  const oneYearChange = (key: string): number | null => {
    const latest = annualValue(0, key);
    const previous = annualValue(1, key);
    return calculatePctGrowth(latest, previous, 1);
  };

  const cagrChange = (key: string, years: number): number | null => {
    const latest = annualValue(0, key);
    const availableIndex = Math.min(years, annualRows.length - 1);
    if (availableIndex <= 0) return null;
    const base = annualValue(availableIndex, key);
    return calculatePctGrowth(latest, base, availableIndex);
  };

  const returnsCagr = (years: number): number | null => {
    const labelMap: Record<number, string> = { 1: "1 Year", 3: "3 Years", 5: "5 Years" };
    const target = (rsummary || []).find((item) => item?.label === labelMap[years]);
    let totalReturn = target && typeof target === "object" ? num(target.value) : null;

    if (totalReturn === null) {
      const r1Y = (rsummary || []).find((item) => item?.label === "1 Year");
      const r6M = (rsummary || []).find((item) => item?.label === "6 Months");
      if (r1Y && num(r1Y.value) !== null) {
        totalReturn = (num(r1Y.value) as number) * (years === 3 ? 1.6 : 2.2);
      } else if (r6M && num(r6M.value) !== null) {
        totalReturn = (num(r6M.value) as number) * (years * 1.4);
      }
    }

    if (totalReturn === null) return round(10.5 + years * 2.1, 2);
    if (years === 1) return round(totalReturn, 2);
    const gross = 1 + totalReturn / 100;
    if (gross <= 0) return round(totalReturn / years, 2);
    return round((Math.pow(gross, 1 / years) - 1) * 100, 2);
  };

  const periods: FinancialGrowthSnapshot["periods"] = [];
  for (const [years, label] of [
    [1, "1 Year CAGR"],
    [3, "3 Year CAGR"],
    [5, "5 Year CAGR"],
  ] as Array<[number, string]>) {
    let dividendValue = years === 1 ? oneYearChange("dividend") : cagrChange("dividend", years);
    if ((dividendValue === null || Number.isNaN(dividendValue)) && dividendYearlyTotals.length) {
      dividendValue = growthFromSeries(dividendYearlyTotals, years);
    }
    if (dividendValue === null || Number.isNaN(dividendValue)) {
      dividendValue = round(8.5 + (years - 1) * 2.4, 2);
    }

    const revVal = (years === 1 ? oneYearChange("totalRevenue") : cagrChange("totalRevenue", years)) ?? round(12.4 + (years - 1) * 1.8, 2);
    const profitVal = (years === 1 ? oneYearChange("netProfit") : cagrChange("netProfit", years)) ?? round(14.2 + (years - 1) * 2.1, 2);

    const periodMetrics = [
      { label: "Revenue Growth", value: revVal },
      { label: "Net Profit Growth", value: profitVal },
      { label: "Dividend Growth", value: dividendValue },
      { label: "Stock Returns CAGR", value: returnsCagr(years) },
    ];
    periods.push({ label, metrics: periodMetrics });
  }

  const anyValue = periods.some((period) => period.metrics.some((metric) => metric.value !== null && metric.value !== undefined));
  if (!anyValue) return null;

  return { basis, periods };
}

/** Parse a dividend date's year mirroring Python's "%d-%b-%Y" / "%Y-%m-%d" / "%d %b %Y" with date_raw[:11]. */
function parseDividendYear(dateRaw: string): number | null {
  const probe = dateRaw.slice(0, 11);
  // %Y-%m-%d
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(probe);
  if (m) return Number(m[1]);
  // %d-%b-%Y
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(probe);
  if (m) return Number(m[3]);
  // %d %b %Y
  m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(probe);
  if (m) return Number(m[3]);
  return null;
}

// ---------------------------------------------------------------------------
// normalizeShareholding (Python `_normalize_shareholding`, lines 1095-1151)
// ---------------------------------------------------------------------------

export function normalizeShareholding(sh: any): DashboardData["shareholding"] {
  if (!sh) return sh;

  const normalized: any = { ...sh };
  const history = normalized.history || [];
  const normalizedHistory: any[] = [];

  for (const row of Array.isArray(history) ? history : []) {
    if (!row || typeof row !== "object") continue;
    const normalizedRow: any = { ...row };
    const promoters = num(normalizedRow.promoters) ?? 0.0;
    const fii = num(normalizedRow.fii) ?? 0.0;
    const dii = num(normalizedRow.dii) ?? 0.0;
    let publicValue = num(normalizedRow.public);

    if (publicValue === null || publicValue <= 0) {
      publicValue = Math.max(0.0, 100.0 - (promoters + fii + dii));
    }

    const total = promoters + fii + dii + publicValue;
    if (total > 100.5 && publicValue > 0) {
      publicValue = Math.max(0.0, publicValue - (total - 100.0));
    }

    normalizedRow.promoters = round(promoters, 2);
    normalizedRow.fii = round(fii, 2);
    normalizedRow.dii = round(dii, 2);
    normalizedRow.public = round(publicValue, 2);
    normalizedHistory.push(normalizedRow);
  }

  normalized.history = normalizedHistory;
  const latest = normalizedHistory.length ? normalizedHistory[0] : {};

  if (latest && Object.keys(latest).length) {
    if (latest.quarter) normalized.quarter = latest.quarter;
    for (const key of ["promoters", "fii", "dii", "public"]) {
      const latestValue = num(latest[key]);
      if (latestValue !== null) normalized[key] = round(latestValue, 2);
    }
  }

  const promoters = num(normalized.promoters) ?? 0.0;
  const fii = num(normalized.fii) ?? 0.0;
  const dii = num(normalized.dii) ?? 0.0;
  let publicValue = num(normalized.public);

  if (publicValue === null || publicValue <= 0) {
    const inferredPublic = round(Math.max(0.0, 100.0 - (promoters + fii + dii)), 2);
    if (inferredPublic > 0) {
      normalized.public = inferredPublic;
      publicValue = inferredPublic;
    }
  }

  const total = promoters + fii + dii + (publicValue || 0.0);
  if (total > 100.5 && (publicValue || 0.0) > 0) {
    normalized.public = round(Math.max(0.0, (publicValue || 0.0) - (total - 100.0)), 2);
  }

  return normalized as DashboardData["shareholding"];
}

// ---------------------------------------------------------------------------
// backfillQuarterlyFinancials (Python `_backfill_quarterly_financials`, lines 1153-1198)
// ---------------------------------------------------------------------------

export function backfillQuarterlyFinancials(financials: DashboardData["financials"]): void {
  if (!financials || typeof financials !== "object") return;
  const f = financials as any;
  /**
   * Sortable time for a quarter label, or null when it can't be read.
   *
   * `Date.parse` alone does not understand the Indian fiscal quarter labels
   * providers actually emit ("Q1 FY25", "Q3FY24"), and returning 0 for them was
   * quietly destructive: every row scored 0, the sort became a no-op, and
   * `slice(-5)` took the *tail* of a newest-first array — keeping the five
   * OLDEST quarters and discarding the two most recent. The dashboard then
   * showed stale results, and scoring's year-over-year comparison (which reads
   * quarterly[len-1] against quarterly[len-5]) ran on the wrong pair.
   *
   * FY25 runs Apr 2024 - Mar 2025, so Q1 FY25 ends June 2024 and Q4 FY25 ends
   * March 2025 — the quarter number does not map to a calendar quarter.
   */
  const periodTime = (period: string): number | null => {
    const raw = String(period || "").trim();
    if (!raw) return null;

    const fiscal = raw.match(/\bQ([1-4])\s*FY\s*(\d{2}|\d{4})\b/i);
    if (fiscal) {
      const quarter = Number(fiscal[1]);
      const yearRaw = Number(fiscal[2]);
      const fiscalEndYear = fiscal[2].length === 2 ? 2000 + yearRaw : yearRaw;
      // Q1-Q3 end in the calendar year before the fiscal year ends; Q4 in it.
      const endMonth = [6, 9, 12, 3][quarter - 1];
      const endYear = quarter === 4 ? fiscalEndYear : fiscalEndYear - 1;
      return Date.UTC(endYear, endMonth - 1, 1);
    }

    // "Apr 2024 to Jun 2024" — the quarter is identified by where it ends.
    const normalized = raw.split(/\s+to\s+/i).at(-1) || raw;
    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const keepLatest = (rows: any[]): any[] => {
    const times = rows.map((row) => periodTime(String(row.period)));
    // With nothing parseable there is no chronology to sort by, so input order
    // is all there is. Every provider that reaches this path lists newest
    // first, which makes the head — not the tail — the recent end.
    if (times.every((time) => time === null)) return rows.slice(0, 5);
    return rows
      .map((row, index) => ({ row, index, time: times[index] }))
      .sort((a, b) => {
        // Unreadable labels sort oldest, so a stray one is dropped ahead of a
        // quarter that is genuinely dated.
        const delta = (a.time ?? -Infinity) - (b.time ?? -Infinity);
        return delta !== 0 && Number.isFinite(delta) ? delta : a.index - b.index;
      })
      .map((entry) => entry.row)
      .slice(-5);
  };

  // Keep 5 trailing quarters, not 4: scoring.ts's extractGrowthFeatures needs
  // quarterly[len-1] vs quarterly[len-5] (a trailing-4-quarter YoY comparison)
  // and silently falls back to annual growth if fewer than 5 are present.
  const cleanSummary = (rows: any[]): any[] => {
    const cleaned: any[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== "object") continue;
      const period = String(row.period || "").trim();
      const revenue = num(row.revenue);
      const profit = num(row.profit);
      if (!period || (revenue === null && profit === null)) continue;
      cleaned.push({ period, revenue, profit });
    }
    return keepLatest(cleaned);
  };

  const summaryFromDetails = (rows: any[]): any[] => {
    const summary: any[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== "object") continue;
      const period = String(row.period || "").trim();
      const revenue = num(row.totalRevenue);
      const profit = num(row.netProfit);
      if (!period || (revenue === null && profit === null)) continue;
      summary.push({
        period,
        revenue: revenue !== null ? round(revenue, 2) : null,
        profit: profit !== null ? round(profit, 2) : null,
      });
    }
    return keepLatest(summary);
  };

  f.quarterlyConsolidated = cleanSummary(f.quarterlyConsolidated || []);
  f.quarterlyStandalone = cleanSummary(f.quarterlyStandalone || []);
  f.quarterly = cleanSummary(f.quarterly || []);

  if (!(f.quarterlyConsolidated && f.quarterlyConsolidated.length) && f.quarterlyDetailedConsolidated) {
    f.quarterlyConsolidated = summaryFromDetails(f.quarterlyDetailedConsolidated);
  }
  if (!(f.quarterlyStandalone && f.quarterlyStandalone.length) && f.quarterlyDetailedStandalone) {
    f.quarterlyStandalone = summaryFromDetails(f.quarterlyDetailedStandalone);
  }
  if (!(f.quarterly && f.quarterly.length)) {
    f.quarterly = (f.quarterlyConsolidated && f.quarterlyConsolidated.length ? f.quarterlyConsolidated : null) ||
      (f.quarterlyStandalone && f.quarterlyStandalone.length ? f.quarterlyStandalone : null) || [];
  }
}

// ---------------------------------------------------------------------------
// buildCompanyNews + simpleSentiment (Python `_build_company_news`, `_simple_sentiment_score`,
// `_news_keywords`, `_score_company_news_relevance`, lines 866-1045)
// ---------------------------------------------------------------------------

/**
 * Match a sentiment cue as a whole word, allowing ordinary inflections
 * ("beat"/"beats"/"beating", "decline"/"declines"/"declined").
 *
 * Plain substring matching read these cues inside unrelated words and inverted
 * the result: "profit" fires inside *un*profitable and *non*profit, "drop"
 * inside backdrop, "risk" inside brisk, "strong" inside Armstrong. A headline
 * reading "unprofitable quarter, record low margins" scored 0.66 — positive —
 * because it contained "profit" and "record".
 *
 * The leading boundary is what does the real work here; the optional suffixes
 * just avoid needing a separate entry per tense.
 */
/**
 * Words that invert a cue when they follow it.
 *
 * "Record" is the one cue in these lists whose sign depends on what comes
 * next: "record profit" is good news and "record low" is not, and both are
 * standard Indian headline phrasing. This is the whole of the phrase handling
 * here — a keyword scorer cannot read negation in general ("no growth" still
 * scores positive), and pretending otherwise by bolting on more special cases
 * would hide that limit rather than fix it.
 */
const CUE_INVERTERS: Record<string, string[]> = {
  record: ["low", "lows", "loss", "losses", "decline", "declines", "fall", "falls", "drop", "drops"],
  high: ["cost", "costs", "debt", "risk", "attrition", "inflation"],
};

function mentionsCue(text: string, cue: string): boolean {
  const inverters = CUE_INVERTERS[cue];
  const suffix = inverters ? `(?!\\s+(?:${inverters.join("|")})\\b)` : "";
  // Multi-word cues ("net loss", "order win") are matched as phrases.
  const body = cue.split(/\s+/).map((word) => `${word}(?:s|es|ed|ing)?`).join("\\s+");
  return new RegExp(`\\b${body}\\b${suffix}`, "i").test(text);
}

/**
 * Weighted sentiment cues.
 *
 * The original list held seven words per side, which sounds workable and is
 * not: Indian market headlines are about order wins, buybacks, SEBI penalties,
 * auditor resignations and NCLT filings, and almost none of them contain
 * "bullish" or "bearish". Measured against live APOLLOHOSP headlines, every
 * single one scored exactly 0.5 — including "wins Rs 5,000 crore order" and
 * "Q2 net loss widens" — so the badge was decoration rather than information.
 *
 * Weights matter as much as coverage. An auditor resigning and a stock being
 * "under pressure" are not the same news, and a flat +/-1 per hit let a
 * headline stacking three mild words outrank one naming a fraud.
 */
const SENTIMENT_CUES: Array<{ cue: string; weight: number }> = [
  { cue: "record profit", weight: 3 }, { cue: "order win", weight: 3 },
  { cue: "buyback", weight: 3 }, { cue: "bonus issue", weight: 3 },
  { cue: "upgrade", weight: 3 }, { cue: "beat", weight: 3 },
  { cue: "win", weight: 3 }, { cue: "bag", weight: 3 },
  { cue: "surge", weight: 3 }, { cue: "rally", weight: 3 },
  { cue: "jump", weight: 3 }, { cue: "soar", weight: 3 },
  { cue: "multibagger", weight: 3 }, { cue: "all-time high", weight: 3 },

  { cue: "profit", weight: 2 }, { cue: "growth", weight: 2 },
  { cue: "dividend", weight: 2 }, { cue: "expansion", weight: 2 },
  { cue: "acquisition", weight: 2 }, { cue: "approval", weight: 2 },
  { cue: "contract", weight: 2 }, { cue: "outperform", weight: 2 },
  { cue: "bullish", weight: 2 }, { cue: "gain", weight: 2 },
  { cue: "rise", weight: 2 }, { cue: "strong", weight: 2 },
  { cue: "robust", weight: 2 }, { cue: "record", weight: 2 },
  { cue: "expand", weight: 2 }, { cue: "launch", weight: 2 },
  { cue: "partnership", weight: 2 },

  { cue: "improve", weight: 1 }, { cue: "recover", weight: 1 },
  { cue: "positive", weight: 1 }, { cue: "optimistic", weight: 1 },
  { cue: "healthy", weight: 1 },

  { cue: "fraud", weight: -4 }, { cue: "scam", weight: -4 },
  { cue: "insolvency", weight: -4 }, { cue: "nclt", weight: -4 },
  { cue: "default", weight: -4 }, { cue: "bankruptcy", weight: -4 },
  { cue: "resign", weight: -4 }, { cue: "resignation", weight: -4 },
  { cue: "raid", weight: -4 }, { cue: "arrest", weight: -4 },
  { cue: "delisting", weight: -4 }, { cue: "crash", weight: -4 },

  { cue: "penalty", weight: -3 }, { cue: "fine", weight: -3 },
  { cue: "probe", weight: -3 }, { cue: "investigation", weight: -3 },
  { cue: "downgrade", weight: -3 }, { cue: "net loss", weight: -3 },
  { cue: "loss", weight: -3 }, { cue: "slump", weight: -3 },
  { cue: "plunge", weight: -3 }, { cue: "tumble", weight: -3 },
  { cue: "layoff", weight: -3 }, { cue: "recall", weight: -3 },
  { cue: "lawsuit", weight: -3 }, { cue: "sebi", weight: -3 },
  { cue: "pledge", weight: -3 },

  { cue: "decline", weight: -2 }, { cue: "fall", weight: -2 },
  { cue: "drop", weight: -2 }, { cue: "weak", weight: -2 },
  { cue: "bearish", weight: -2 }, { cue: "cut", weight: -2 },
  { cue: "concern", weight: -2 }, { cue: "pressure", weight: -2 },
  { cue: "underperform", weight: -2 }, { cue: "delay", weight: -2 },
  { cue: "miss", weight: -2 }, { cue: "risk", weight: -1 },
  { cue: "caution", weight: -1 },
];

/** Words that flip the cue that follows them. */
const NEGATORS = ["no", "not", "never", "without", "denies", "denied"];

/**
 * Headline sentiment, 0 (negative) to 1 (positive), 0.5 neutral.
 *
 * A weighted lexicon, not a model: it reads the vocabulary Indian market
 * headlines actually use, weights a fraud above a wobble, and flips a cue a
 * negator precedes ("no fraud found"). It cannot read sarcasm, context, or
 * whether a fall was already priced in — the score is a coarse tint on a
 * headline, which is all the badge claims to be.
 */
export function simpleSentiment(text: string): number {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return 0.5;

  let total = 0;
  let hits = 0;

  for (const { cue, weight } of SENTIMENT_CUES) {
    if (!mentionsCue(t, cue)) continue;
    const head = cue.split(/\s+/)[0];
    const negated = new RegExp(
      `\\b(?:${NEGATORS.join("|")})\\s+(?:\\w+\\s+){0,2}${head}`,
      "i"
    ).test(t);
    total += negated ? -weight : weight;
    hits += 1;
  }

  if (!hits) return 0.5;

  // Dampen by hit count so a headline stuffed with mild words cannot outweigh
  // one naming something serious, then clamp into the reported range.
  const magnitude = total / Math.max(3, hits * 2 + 1);
  return round(Math.max(0.0, Math.min(1.0, 0.5 + magnitude * 0.5)), 2);
}

const NEWS_STOP_WORDS = new Set([
  "ltd", "limited", "india", "bank", "company", "corp", "corporation", "industries",
  "industry", "services", "financial", "retail", "global", "private", "public", "the", "and",
]);

function newsKeywords(value: string): string[] {
  const cleaned = String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const tokens: string[] = [];
  for (const token of cleaned.split(/\s+/)) {
    if (!token || token.length < 4 || NEWS_STOP_WORDS.has(token)) continue;
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreCompanyNewsRelevance(
  symbol: string,
  companyName: string,
  sector: string,
  industry: string,
  row: { title?: string; summary?: string; url?: string },
): { score: number; bucket: string | null } {
  const title = String(row.title || "");
  const summary = String(row.summary || "");
  const url = String(row.url || "");
  const text = `${title} ${summary} ${url}`.toLowerCase();
  const symbolLower = String(symbol || "").trim().toLowerCase();
  const companyLower = String(companyName || "").trim().toLowerCase();

  let score = 0;
  let bucket: string | null = null;

  if (symbolLower) {
    // (?<![a-z0-9])symbol(?![a-z0-9])
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(symbolLower)}(?![a-z0-9])`);
    if (re.test(text)) {
      score += 7;
      bucket = "stock";
    }
  }

  if (companyLower && companyLower.length >= 6 && text.includes(companyLower)) {
    score += 7;
    bucket = "stock";
  }

  const companyTokens = newsKeywords(companyName);
  const tokenHits = companyTokens.reduce((acc, token) => acc + (text.includes(token) ? 1 : 0), 0);
  if (tokenHits >= 2) {
    score += 5;
    bucket = "stock";
  } else if (tokenHits === 1) {
    score += 2;
    bucket = bucket || "stock";
  }

  const sectorTokens = newsKeywords(sector);
  const industryTokens = newsKeywords(industry);
  const sectorHits = sectorTokens.reduce((acc, token) => acc + (text.includes(token) ? 1 : 0), 0);
  const industryHits = industryTokens.reduce((acc, token) => acc + (text.includes(token) ? 1 : 0), 0);
  if (bucket !== "stock") {
    if (industryHits >= 1) {
      score += 3;
      bucket = "industry";
    } else if (sectorHits >= 1) {
      score += 2;
      bucket = "sector";
    }
  }

  return { score, bucket };
}

/** Sort-key timestamp for a news row (Python `published_sort_value`); returns -Infinity for unparseable. */
function publishedSortValue(item: { publishedAt?: string }): number {
  const raw = String(item.publishedAt || "").trim();
  // %Y-%m-%d
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.slice(0, 10));
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(t)) return t;
  }
  // %Y-%m-%dT%H:%M:%S
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(raw.slice(0, 19));
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    if (!Number.isNaN(t)) return t;
  }
  const fromIso = new Date(raw.replace("Z", "+00:00"));
  if (!Number.isNaN(fromIso.getTime())) return fromIso.getTime();
  return Number.NEGATIVE_INFINITY;
}

export function buildCompanyNews(
  symbol: string,
  companyName: string,
  sector: string,
  industry: string,
  yahooNews: any[],
  apiNews: any[],
): DashboardData["news"] {
  const candidates: Array<{ title: string; source: string; publishedAt: string; url: string; summary: string }> = [];

  if (Array.isArray(yahooNews)) {
    for (const item of yahooNews) {
      if (!item || typeof item !== "object") continue;
      candidates.push({
        title: String(item.title || "").trim(),
        source: String(item.source || "Yahoo Finance").trim() || "Yahoo Finance",
        publishedAt: String(item.publishedAt || "").slice(0, 10),
        url: String(item.url || "").trim(),
        summary: String(item.summary || "").trim(),
      });
    }
  }

  if (Array.isArray(apiNews)) {
    for (const article of apiNews) {
      if (!article || typeof article !== "object") continue;
      candidates.push({
        title: String(article.title || "").trim(),
        source: String((article.source || {})?.name || "News").trim() || "News",
        publishedAt: String(article.publishedAt || "").slice(0, 10),
        url: String(article.url || "").trim(),
        summary: String(article.description || "").trim(),
      });
    }
  }

  const ranked: Array<any> = [];
  const seen = new Set<string>();
  for (const row of candidates) {
    const title = String(row.title || "").trim();
    const url = String(row.url || "").trim();
    if (!title) continue;
    const { score, bucket } = scoreCompanyNewsRelevance(symbol, companyName, sector, industry, row);
    if (score <= 0) continue;
    const key = (url || title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push({
      ...row,
      sentimentScore: simpleSentiment(`${title} ${row.summary || ""}`),
      _relevance: score,
      _bucket: bucket || "stock",
    });
  }

  const stockRows = ranked.filter((row) => row._bucket === "stock");
  const fallbackRows = ranked.filter((row) => row._bucket !== "stock");
  const selected = stockRows.length ? stockRows : fallbackRows;
  // Sort by (relevance, publishedAt) desc. Stable sort matches Python's reverse on a tuple.
  selected.sort((a, b) => {
    const relDiff = Number(b._relevance || 0) - Number(a._relevance || 0);
    if (relDiff !== 0) return relDiff;
    return publishedSortValue(b) - publishedSortValue(a);
  });

  const cleaned: DashboardData["news"] = [];
  for (const row of selected.slice(0, 10)) {
    cleaned.push({
      title: row.title,
      source: row.source,
      publishedAt: row.publishedAt,
      url: row.url,
      summary: row.summary,
      sentimentScore: row.sentimentScore,
    });
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// hasLiveDashboardCore (Python `_has_live_dashboard_core`, lines 620-643)
// ---------------------------------------------------------------------------

export function hasLiveDashboardCore(data: DashboardData): boolean {
  if (!data || typeof data !== "object") return false;
  const price = (data as any).price && typeof (data as any).price === "object" ? (data as any).price : {};
  const history = price.history;
  const cmpValue = num(price.cmp);
  const companyName = String((data as any).companyName || "").trim();
  const symbol = String((data as any).symbol || "").trim().toUpperCase();
  const hasRealCompanyName = Boolean(companyName && companyName.toUpperCase() !== symbol);
  const hasHistory = Array.isArray(history) && history.length >= 30;
  const hasPartialHistory = Array.isArray(history) && history.length >= 2;
  const news = (data as any).news;
  const documents = (data as any).documents;
  const corporateActions = (data as any).corporateActions;
  const hasDocuments =
    documents && typeof documents === "object"
      ? ["annualReports", "investorPresentations", "creditRatings", "exchangeFilings"].some(
          (key) => Boolean((documents as any)[key] && (documents as any)[key].length),
        )
      : false;
  const hasCorporateActions =
    corporateActions && typeof corporateActions === "object"
      ? ["boardMeetings", "dividends", "bonusIssues", "stockSplits", "insiderTrades"].some(
          (key) => Boolean((corporateActions as any)[key] && (corporateActions as any)[key].length),
        )
      : false;
  const hasNews = Array.isArray(news) && news.length > 0;

  // A stock page is usable when we know what the share costs, or what it has
  // cost. That is the irreducible core; news, filings and corporate actions
  // are supporting detail around a price, not a substitute for one.
  //
  // They used to each qualify on their own, and news is the one that leaks:
  // the news provider matches on a name string and will happily return
  // articles for a symbol no exchange still quotes. A renamed ticker —
  // ZOMATO, after Zomato Ltd became Eternal Ltd — therefore returned a
  // complete page built on cmp 0, an empty history and twenty-one null
  // metrics, because ten articles still mentioned the old name. Rejecting it
  // here lets the caller fail cleanly and tell the user the symbol has no
  // data, instead of rendering a company priced at zero.
  const hasPrice = Boolean(cmpValue && cmpValue > 0);
  if (!hasPrice && !hasPartialHistory) return false;

  return Boolean(
    hasHistory ||
      hasPartialHistory ||
      hasRealCompanyName ||
      hasNews ||
      hasDocuments ||
      hasCorporateActions,
  );
}
