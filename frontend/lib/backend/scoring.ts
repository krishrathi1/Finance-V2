/**
 * Smart Score and Risk Score algorithms.
 *
 * Direct, behavior-preserving port of `backend/app/services/scoring.py`
 * (`compute_smart_score` / `compute_risk_score`). Pure computation — no I/O,
 * no network. These functions NEVER throw: every metric access is guarded and
 * falls back to sensible defaults, mirroring the dynamically-typed Python
 * source bit-for-bit.
 *
 * Parity notes (see scratch/port-specs/05-...md "Gotchas"):
 *  - `round2`/`round4` use BANKER'S rounding (round-half-to-even) to match
 *    Python `round(x, n)`. JS Math.round is round-half-up — do NOT use it.
 *  - `median` returns the AVERAGE of the two middle elements for even-length
 *    lists (Python `statistics.median`).
 *  - `std` is the SAMPLE std (variance divisor n-1, ddof=1); None if < 2 values.
 *  - Python `or` truthiness: `a or b` falls through when `a` is 0.0/NaN/None.
 *    Reproduced via `pyOr` where the source uses `or`, and explicit
 *    `=== null` checks where the source uses `is not None`.
 */

import type { DashboardData } from "@/lib/types";
import type { SmartScoreInput, RiskScoreInput } from "@/lib/backend/contracts";

// ---------------------------------------------------------------------------
// Shared primitives (mirror scoring.py helpers exactly).
// ---------------------------------------------------------------------------

/** IST = UTC+05:30, in milliseconds (used for insider-trade date math). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

type Num = number | null;
type Row = Record<string, unknown>;

function clamp(value: number, minV: number, maxV: number): number {
  return Math.max(minV, Math.min(maxV, value));
}

/**
 * Python `_num`: coerce to a finite float or return `default`.
 * - None/undefined -> default
 * - non-finite (NaN/Inf) -> default
 * - parse failures (e.g. "") -> default
 * - booleans -> 1.0 / 0.0 (Python float(True)==1.0)
 */
function num(value: unknown, def: Num = null): Num {
  if (value === null || value === undefined) return def;
  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "boolean") {
    numeric = value ? 1.0 : 0.0;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return def;
    numeric = Number(trimmed);
  } else {
    return def;
  }
  if (!Number.isFinite(numeric)) return def;
  return numeric;
}

/** Filter to finite floats (Python list-comprehension with isfinite guard). */
function finiteValues(values: Array<Num | undefined>): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const f = Number(v);
    if (Number.isFinite(f)) out.push(f);
  }
  return out;
}

function arithmeticMean(values: number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Python `_avg(values, fallback)`. */
function avg(values: Array<Num | undefined>, fallback: number): number {
  const valid = finiteValues(values);
  return valid.length ? arithmeticMean(valid) : fallback;
}

/**
 * Python `statistics.median`. Sort ascending; odd count -> middle element;
 * even count -> AVERAGE of the two middle elements.
 */
function statisticsMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Python `_median(values, fallback)`. */
function median(values: Array<Num | undefined>, fallback: number): number {
  const valid = finiteValues(values);
  return valid.length ? statisticsMedian(valid) : fallback;
}

function normalize(value: Num, low: number, high: number): Num {
  if (value === null) return null;
  if (high <= low) return null;
  return clamp((value - low) / (high - low), 0.0, 1.0);
}

function inverseNormalize(value: Num, low: number, high: number): Num {
  const score = normalize(value, low, high);
  return score === null ? null : 1.0 - score;
}

function pctChange(current: Num, base: Num): Num {
  if (current === null || base === null || Math.abs(base) < 1e-9) return null;
  return ((current - base) / Math.abs(base)) * 100.0;
}

function dailyReturns(closes: number[]): number[] {
  if (closes.length < 2) return [];
  const out: number[] = [];
  for (let idx = 1; idx < closes.length; idx++) {
    const prev = closes[idx - 1];
    const curr = closes[idx];
    if (prev <= 0) continue;
    out.push(curr / prev - 1.0);
  }
  return out;
}

/** Sample standard deviation (ddof=1). None if fewer than 2 values. */
function std(values: number[]): Num {
  if (values.length < 2) return null;
  const avgV = arithmeticMean(values);
  let acc = 0;
  for (const v of values) acc += (v - avgV) ** 2;
  const variance = acc / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(closes: number[]): Num {
  if (!closes.length) return null;
  let peak = closes[0];
  let maxDd = 0.0;
  for (const price of closes) {
    if (price > peak) peak = price;
    if (peak > 0) {
      const dd = (peak - price) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

function sigmoid(value: number): number {
  if (value < -35) return 0.0;
  if (value > 35) return 1.0;
  return 1.0 / (1.0 + Math.exp(-value));
}

/** Python `_latest_nonempty_rows`: keep only plain-object (dict) elements. */
function latestNonemptyRows(rows: unknown): Row[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r): r is Row => isPlainObject(r));
}

function isPlainObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Python `_statement_value`: substring match on alphanumeric-normalized keys,
 * returning the first matching cell in insertion (object) order.
 */
function statementValue(row: Row, keys: string[]): Num {
  const normalizedKeys = keys.map(normKey);
  for (const key of Object.keys(row)) {
    const keyNorm = normKey(String(key));
    if (normalizedKeys.some((candidate) => keyNorm.includes(candidate))) {
      const numeric = num(row[key]);
      if (numeric !== null) return numeric;
    }
  }
  return null;
}

/**
 * Python `_parse_trade_date`: returns epoch milliseconds (interpreting the
 * parsed date as IST midnight) or null. Only the formats the source supports.
 */
const MONTHS_SHORT: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTHS_LONG: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function istMidnightMs(year: number, month: number, day: number): number {
  // Construct UTC then subtract IST offset to anchor at IST midnight.
  return Date.UTC(year, month - 1, day) - IST_OFFSET_MS;
}

function parseTradeDate(rawIn: string): number | null {
  const raw = (rawIn || "").trim();
  if (!raw) return null;
  const datePart = raw.split(" ")[0];

  // %Y-%m-%d
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
  if (m) return istMidnightMs(+m[1], +m[2], +m[3]);

  // %d-%b-%Y  (e.g. 05-Jan-2024)
  m = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(datePart);
  if (m) {
    const mon = MONTHS_SHORT[m[2].toLowerCase()];
    if (mon) return istMidnightMs(+m[3], mon, +m[1]);
    // %d-%B-%Y (full month name) — same separator
    const monLong = MONTHS_LONG[m[2].toLowerCase()];
    if (monLong) return istMidnightMs(+m[3], monLong, +m[1]);
    return null;
  }

  // %d-%m-%Y
  m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(datePart);
  if (m) return istMidnightMs(+m[3], +m[2], +m[1]);

  // %d/%m/%Y
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(datePart);
  if (m) return istMidnightMs(+m[3], +m[2], +m[1]);

  return null;
}

/**
 * Banker's rounding (round-half-to-even) to `digits` decimal places, matching
 * Python's built-in `round(x, n)` bit-for-bit.
 *
 * CPython rounds the TRUE value of the double, not a scaled multiple — e.g.
 * `round(2.675, 2) == 2.67` because 2.675 is stored as 2.67499.... A naive
 * `value * 10**n` approach gets this wrong (2.675*100 === 267.5 in IEEE-754).
 * So we derive the rounding decision from the exact decimal expansion of the
 * double (via `toFixed`, which is correctly rounded to many places, capturing
 * the true binary value's direction), then apply half-to-even on it.
 *
 * NaN/Inf pass through (Python round would raise, but our inputs are finite).
 */
function roundHalfEven(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;
  const neg = value < 0;
  const v = Math.abs(value);

  // Decimal expansion of the exact double value, far past the target precision.
  const expanded = v.toFixed(Math.min(100, digits + 30));
  const dot = expanded.indexOf(".");
  const intPart = dot === -1 ? expanded : expanded.slice(0, dot);
  const fracPart = dot === -1 ? "" : expanded.slice(dot + 1);
  const keep = fracPart.slice(0, digits);
  const rest = fracPart.slice(digits);

  let base = Number(digits > 0 ? `${intPart}.${keep}` : intPart);
  const incr = Math.pow(10, -digits);

  if (rest.length > 0) {
    const firstRest = rest[0];
    if (firstRest > "5") {
      base = Number((base + incr).toFixed(digits));
    } else if (firstRest === "5") {
      const after = rest.slice(1).replace(/0+$/, "");
      if (after.length > 0) {
        base = Number((base + incr).toFixed(digits));
      } else {
        // Exact half -> round to even on the last kept digit.
        const lastDigit =
          digits > 0
            ? Number(keep[keep.length - 1] || "0")
            : Number(intPart[intPart.length - 1]);
        if (lastDigit % 2 === 1) base = Number((base + incr).toFixed(digits));
      }
    }
    // firstRest < "5" -> keep `base` as-is.
  }

  base = Number(base.toFixed(digits));
  return neg ? -base : base;
}

const round2 = (v: number): number => roundHalfEven(v, 2);
const round4 = (v: number): number => roundHalfEven(v, 4);

/**
 * Python truthiness for the `or` chains used in scoring.py. Returns the first
 * "truthy" value, else the last. In scoring.py the operands are `float|None`,
 * where 0.0 and NaN are falsy and None is falsy.
 */
function pyOr(...vals: Num[]): Num {
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (i === vals.length - 1) return v; // last value is the fallback
    if (v !== null && v !== 0 && !Number.isNaN(v)) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Feature extraction blocks.
// ---------------------------------------------------------------------------

interface GrowthFeatures {
  revenueGrowth: Num;
  profitGrowth: Num;
  epsGrowth: Num;
  freeCashFlowGrowth: Num;
}

function extractGrowthFeatures(financials: Row): GrowthFeatures {
  const quarterly = latestNonemptyRows(financials["quarterly"]);
  const yearly = latestNonemptyRows(financials["yearly"]);
  const qdCons = latestNonemptyRows(financials["quarterlyDetailedConsolidated"]);
  const qdStandalone = latestNonemptyRows(financials["quarterlyDetailedStandalone"]);
  const qd = qdCons.length ? qdCons : qdStandalone;

  let revenueGrowth: Num = null;
  let profitGrowth: Num = null;
  if (quarterly.length >= 5) {
    revenueGrowth = pctChange(num(quarterly[quarterly.length - 1]["revenue"]), num(quarterly[quarterly.length - 5]["revenue"]));
    profitGrowth = pctChange(num(quarterly[quarterly.length - 1]["profit"]), num(quarterly[quarterly.length - 5]["profit"]));
  } else if (yearly.length >= 2) {
    revenueGrowth = pctChange(num(yearly[yearly.length - 1]["revenue"]), num(yearly[yearly.length - 2]["revenue"]));
    profitGrowth = pctChange(num(yearly[yearly.length - 1]["profit"]), num(yearly[yearly.length - 2]["profit"]));
  }

  let epsGrowth: Num = null;
  if (qd.length >= 5) {
    const latestEps = pyOr(num(qd[qd.length - 1]["basicEps"]), num(qd[qd.length - 1]["dilutedEps"]));
    const prevEps = pyOr(num(qd[qd.length - 5]["basicEps"]), num(qd[qd.length - 5]["dilutedEps"]));
    epsGrowth = pctChange(latestEps, prevEps);
  }

  let fcfGrowth: Num = null;
  if (yearly.length >= 2) {
    const latestFcf = num(yearly[yearly.length - 1]["cashFlow"]);
    const previousFcf = num(yearly[yearly.length - 2]["cashFlow"]);
    fcfGrowth = pctChange(latestFcf, previousFcf);
  }

  return {
    revenueGrowth,
    profitGrowth,
    epsGrowth,
    freeCashFlowGrowth: fcfGrowth,
  };
}

function computeAltmanZ(metrics: Row, financials: Row): Num {
  const balanceSheetRows = latestNonemptyRows(financials["balanceSheet"]);
  const incomeRows = latestNonemptyRows(financials["incomeStatement"]);
  if (!balanceSheetRows.length || !incomeRows.length) return null;

  const bs = balanceSheetRows[0];
  const inc = incomeRows[0];
  const totalAssets = statementValue(bs, ["totalAssets", "assets"]);
  const totalLiabilities = statementValue(bs, ["totalLiabilities", "liabilities"]);
  const retainedEarnings = statementValue(bs, ["retainedEarnings"]);
  const currentAssets = statementValue(bs, ["currentAssets"]);
  const currentLiabilities = statementValue(bs, ["currentLiabilities"]);
  const directWorkingCapital = statementValue(bs, ["workingCapital"]);
  const workingCapital: Num =
    directWorkingCapital !== null
      ? directWorkingCapital
      : currentAssets !== null && currentLiabilities !== null
        ? currentAssets - currentLiabilities
        : null;
  const ebit = statementValue(inc, ["ebit", "operatingIncome"]);
  const sales = statementValue(inc, ["revenue", "sales"]);
  const marketValueEquity = num(metrics["marketCap"]);

  if (
    totalAssets === null ||
    Math.abs(totalAssets) < 1e-9 ||
    totalLiabilities === null ||
    Math.abs(totalLiabilities) < 1e-9 ||
    marketValueEquity === null ||
    workingCapital === null ||
    retainedEarnings === null ||
    ebit === null ||
    sales === null
  ) {
    return null;
  }

  const zScore =
    1.2 * (workingCapital / totalAssets) +
    1.4 * (retainedEarnings / totalAssets) +
    3.3 * (ebit / totalAssets) +
    0.6 * (marketValueEquity / totalLiabilities) +
    1.0 * (sales / totalAssets);
  return Number.isFinite(zScore) ? zScore : null;
}

function insiderSignal(corporateActions: Row | null | undefined): number {
  const actions = corporateActions || {};
  const rows = isPlainObject(actions) ? (actions as Row)["insiderTrades"] : [];
  if (!Array.isArray(rows)) return 0.5;
  const now = Date.now();
  const cutoff = now - 180 * 24 * 60 * 60 * 1000;
  let buys = 0;
  let sells = 0;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const tradeDate = parseTradeDate(String(row["date"] ?? ""));
    if (tradeDate !== null && tradeDate < cutoff) continue;
    const transactionType = row["transactionType"] ?? "";
    const orderType = row["orderType"] ?? "";
    const signalText = `${transactionType} ${orderType}`.toLowerCase();
    if (["buy", "acquire", "purchase"].some((token) => signalText.includes(token))) {
      buys += 1;
    } else if (["sell", "dispose", "pledge"].some((token) => signalText.includes(token))) {
      sells += 1;
    }
  }
  if (buys + sells === 0) return 0.5;
  const netRatio = (buys - sells) / (buys + sells);
  return clamp((netRatio + 1.0) / 2.0, 0.0, 1.0);
}

function institutionalSignal(shareholding: Row | null | undefined): number {
  if (!isPlainObject(shareholding)) return 0.5;
  const fii = num(shareholding["fii"]);
  const dii = num(shareholding["dii"]);
  const promoters = num(shareholding["promoters"]);
  const institutional: Num = fii !== null && dii !== null ? fii + dii : null;
  const components: Num[] = [
    normalize(institutional, 15.0, 75.0),
    normalize(promoters, 20.0, 75.0),
  ];
  return avg(components, 0.5);
}

interface PriceFeatures {
  return1M: Num;
  return3M: Num;
  return6M: Num;
  volatility3M: Num;
  drawdown1Y: Num;
}

function extractPriceFeatures(priceHistory: unknown): PriceFeatures {
  const history = Array.isArray(priceHistory) ? priceHistory : [];
  const closes: number[] = [];
  for (const item of history) {
    if (!isPlainObject(item)) continue;
    const c = num((item as Row)["close"]);
    if (c !== null) closes.push(c);
  }
  if (closes.length < 10) {
    return { return1M: null, return3M: null, return6M: null, volatility3M: null, drawdown1Y: null };
  }
  const returns = dailyReturns(closes);
  const last = closes[closes.length - 1];
  const return1M = closes.length > 22 ? pctChange(last, closes[closes.length - 22]) : null;
  const return3M = closes.length > 64 ? pctChange(last, closes[closes.length - 64]) : null;
  const return6M = closes.length > 127 ? pctChange(last, closes[closes.length - 127]) : null;
  const last63Returns = returns.length >= 63 ? returns.slice(returns.length - 63) : returns;
  let vol3m = std(last63Returns);
  if (vol3m !== null) vol3m *= Math.sqrt(252);
  const window = closes.length >= 252 ? closes.slice(closes.length - 252) : closes;
  const drawdown1Y = maxDrawdown(window);
  return {
    return1M,
    return3M,
    return6M,
    volatility3M: vol3m,
    drawdown1Y,
  };
}

const ACTUAL_KEYS = [
  "eps_actual",
  "eps",
  "reportedEPS",
  "reported_eps",
  "epsActual",
  "basicEps",
  "dilutedEps",
];
const ESTIMATE_KEYS = [
  "eps_estimate",
  "estimatedEPS",
  "estimated_eps",
  "epsEstimate",
  "consensus_eps",
];

function computeEarningsSurprise(quarterlyDetailed: unknown): number {
  if (!Array.isArray(quarterlyDetailed) || quarterlyDetailed.length < 2) return 0.0;

  const surprises: number[] = [];
  const slice = quarterlyDetailed.slice(Math.max(0, quarterlyDetailed.length - 4));
  for (const row of slice) {
    if (!isPlainObject(row)) continue;

    let actual: Num = null;
    for (const key of ACTUAL_KEYS) {
      actual = num((row as Row)[key]);
      if (actual !== null) break;
    }

    let estimate: Num = null;
    for (const key of ESTIMATE_KEYS) {
      estimate = num((row as Row)[key]);
      if (estimate !== null) break;
    }

    if (actual === null || estimate === null || Math.abs(estimate) < 0.01) continue;

    const surprise = clamp((actual - estimate) / Math.abs(estimate), -1.0, 1.0);
    surprises.push(surprise);
  }

  if (!surprises.length) return 0.0;
  return clamp(arithmeticMean(surprises) * 0.5, -0.5, 0.5);
}

function computeVolumePriceDivergence(closes: number[], volumes: number[], windowIn = 20): number {
  if (!closes.length || !volumes.length) return 0.0;

  let window = windowIn;
  const n = Math.min(closes.length, volumes.length);
  if (n < 4) return 0.0;
  if (n < window) window = n;
  if (window % 2 === 1) window -= 1;
  if (window < 4) return 0.0;

  const closesW = closes.slice(closes.length - window);
  const volumesW = volumes.slice(volumes.length - window);
  const half = Math.floor(window / 2);
  if (half <= 0) return 0.0;

  const priceStart = closesW[0];
  const priceEnd = closesW[closesW.length - 1];
  if (priceStart <= 0) return 0.0;
  const priceChange = (priceEnd - priceStart) / priceStart;

  const priorVol = volumesW.slice(0, half);
  const recentVol = volumesW.slice(half);
  if (!priorVol.length || !recentVol.length) return 0.0;

  const avgPrior = arithmeticMean(priorVol);
  const avgRecent = arithmeticMean(recentVol);
  if (avgPrior <= 0) return 0.0;

  const volChange = (avgRecent - avgPrior) / avgPrior;
  return clamp(priceChange - volChange, -1.0, 1.0);
}

function historicalEarningsSurprise(quarterlyDetailed: unknown[], tradingDaysFromEnd: number): number {
  if (!Array.isArray(quarterlyDetailed) || !quarterlyDetailed.length) return 0.0;
  const quartersBack = Math.max(0, Math.floor(tradingDaysFromEnd / 63));
  const cutoff = Math.max(0, quarterlyDetailed.length - quartersBack);
  const visibleRows = cutoff > 0 ? quarterlyDetailed.slice(0, cutoff) : [];
  return computeEarningsSurprise(visibleRows);
}

/** In-house logistic regression — deterministic (zero init, LR 0.15, 140 epochs). */
function fitLogisticProbability(
  features: number[][],
  labels: number[],
  latestRow: number[],
): [number, number] {
  // Guard the invariant the caller relies on (features/labels built together
  // from the same sample array): an empty or mismatched pair would index
  // out of bounds below instead of failing loudly.
  if (features.length === 0 || features.length !== labels.length) {
    return [0.5, 0.0];
  }
  const numFeatures = features[0].length;
  const mins: number[] = new Array(numFeatures).fill(0);
  const maxs: number[] = new Array(numFeatures).fill(0);
  for (let i = 0; i < numFeatures; i++) {
    let mn = Infinity;
    let mx = -Infinity;
    for (const row of features) {
      const v = row[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    mins[i] = mn;
    maxs[i] = mx;
  }

  const scaleRow = (row: number[]): number[] => {
    const scaled: number[] = new Array(row.length);
    for (let idx = 0; idx < row.length; idx++) {
      const spread = maxs[idx] - mins[idx];
      if (spread <= 1e-12) scaled[idx] = 0.5;
      else scaled[idx] = (row[idx] - mins[idx]) / spread;
    }
    return scaled;
  };

  const xRows = features.map((row) => scaleRow(row));
  const weights = new Array(numFeatures + 1).fill(0.0);
  const learningRate = 0.15;

  for (let epoch = 0; epoch < 140; epoch++) {
    const grad = new Array(weights.length).fill(0.0);
    for (let r = 0; r < xRows.length; r++) {
      const row = xRows[r];
      const label = labels[r];
      let z = weights[0];
      for (let j = 0; j < row.length; j++) z += weights[j + 1] * row[j];
      const pred = sigmoid(z);
      const err = pred - label;
      grad[0] += err;
      for (let j = 0; j < row.length; j++) grad[j + 1] += err * row[j];
    }
    const invN = 1.0 / xRows.length;
    for (let i = 0; i < weights.length; i++) {
      weights[i] -= learningRate * grad[i] * invN;
    }
  }

  let correct = 0;
  for (let r = 0; r < xRows.length; r++) {
    const row = xRows[r];
    const label = labels[r];
    let z = weights[0];
    for (let j = 0; j < row.length; j++) z += weights[j + 1] * row[j];
    const pred = sigmoid(z);
    if ((pred >= 0.5 && label === 1) || (pred < 0.5 && label === 0)) correct += 1;
  }
  const accuracy = correct / labels.length;

  const latestScaled = scaleRow(latestRow);
  let zLatest = weights[0];
  for (let j = 0; j < latestScaled.length; j++) zLatest += weights[j + 1] * latestScaled[j];
  return [sigmoid(zLatest), accuracy];
}

const NEGATION_TOKENS = new Set(["no", "not", "avoids", "cleared", "denies", "dismisses", "rejects", "without", "free"]);
const HIGH_RISK_WORDS = new Set(["fraud", "default", "bankruptcy", "scam", "downgrade", "probe", "collapse"]);
const MEDIUM_RISK_WORDS = new Set(["decline", "debt", "penalty", "delay", "loss", "miss", "cut", "weak"]);

/** Strip the same leading/trailing punctuation Python str.strip(chars) removes. */
const STRIP_CHARS = new Set([".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", '"', "'"]);
function stripPunct(word: string): string {
  let start = 0;
  let end = word.length;
  while (start < end && STRIP_CHARS.has(word[start])) start++;
  while (end > start && STRIP_CHARS.has(word[end - 1])) end--;
  return word.slice(start, end);
}

function articleRiskWeight(text: string): number {
  const rawWords = String(text ?? "").toLowerCase().split(/\s+/);
  const words: string[] = [];
  for (const w of rawWords) {
    const stripped = stripPunct(w);
    if (stripped) words.push(stripped);
  }
  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    const context = new Set(words.slice(Math.max(0, idx - 4), idx));
    if (HIGH_RISK_WORDS.has(word)) {
      if (intersects(context, NEGATION_TOKENS)) return 0.35;
      return 0.85;
    }
    if (MEDIUM_RISK_WORDS.has(word)) {
      if (intersects(context, NEGATION_TOKENS)) return 0.25;
      return 0.65;
    }
  }
  return 0.35;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

interface HorizonResult {
  label: string;
  days: number;
  weight: number;
  samples: number;
  hitRate: number;
  upProbability: number;
}

type MlDetails = {
  samples: number;
  horizonDays: number;
  hitRate: number | null;
  upProbability?: number;
  availableHorizons?: number[];
  horizons?: Record<string, { samples: number; hitRate: number; upProbability: number }>;
  features?: { earningsSurprise: number; volumePriceDivergence: number };
};

function walkForwardMlAdjustment(
  priceHistory: unknown,
  financialHealthScore: number,
  valuationScore: number,
  quarterlyDetailed: Row[] | null | undefined,
): [number, number, MlDetails] {
  const history = Array.isArray(priceHistory) ? priceHistory : [];
  const closes: number[] = [];
  const volumes: number[] = [];
  for (const item of history) {
    if (!isPlainObject(item)) continue;
    const close = num((item as Row)["close"]);
    if (close === null) continue;
    const volume =
      pyOr(
        num((item as Row)["volume"]),
        num((item as Row)["vol"]),
        num((item as Row)["traded_quantity"]),
        num((item as Row)["tradedQuantity"]),
        0.0,
      ) ?? 0.0;
    closes.push(close);
    volumes.push(volume);
  }

  if (closes.length < 220) {
    return [0.0, 0.0, { samples: 0, horizonDays: 63, hitRate: null }];
  }

  const latestEpsSurprise = computeEarningsSurprise(quarterlyDetailed);
  const latestVpd = computeVolumePriceDivergence(closes, volumes);
  const latestRow: number[] = [
    closes[closes.length - 1] / closes[closes.length - 22] - 1.0,
    closes[closes.length - 1] / closes[closes.length - 64] - 1.0,
    closes[closes.length - 1] / closes[closes.length - 127] - 1.0,
    std(dailyReturns(closes.slice(closes.length - 64))) ?? 0.0,
    maxDrawdown(closes.slice(closes.length - 127)) ?? 0.0,
    latestEpsSurprise,
    latestVpd,
  ];

  const horizonSpecs: Array<[number, string, number]> = [
    [21, "short", 0.25],
    [63, "base", 0.4],
    [126, "long", 0.35],
  ];
  const horizonResults: HorizonResult[] = [];

  for (const [horizon, label, weight] of horizonSpecs) {
    const samples: Array<[number[], number]> = [];
    for (let idx = 130; idx < closes.length - horizon; idx++) {
      const pNow = closes[idx];
      const p1m = closes[idx - 21];
      const p3m = closes[idx - 63];
      const p6m = closes[idx - 126];
      const future = closes[idx + horizon];
      if (Math.min(pNow, p1m, p3m, p6m) <= 0) continue;

      const mom1m = pNow / p1m - 1.0;
      const mom3m = pNow / p3m - 1.0;
      const mom6m = pNow / p6m - 1.0;
      const windowReturns = dailyReturns(closes.slice(idx - 63, idx + 1));
      const vol = std(windowReturns) ?? 0.0;
      const drawdown = maxDrawdown(closes.slice(idx - 126, idx + 1)) ?? 0.0;
      const sampleEpsSurprise = historicalEarningsSurprise(
        quarterlyDetailed ?? [],
        closes.length - 1 - idx,
      );
      const sampleVpd = computeVolumePriceDivergence(closes.slice(0, idx + 1), volumes.slice(0, idx + 1));
      const labelValue = future / pNow - 1.0 > 0 ? 1 : 0;
      samples.push([[mom1m, mom3m, mom6m, vol, drawdown, sampleEpsSurprise, sampleVpd], labelValue]);
    }

    if (samples.length < 60) continue;

    const features = samples.map((row) => row[0]);
    const labels = samples.map((row) => row[1]);
    const [pUp, accuracy] = fitLogisticProbability(features, labels, latestRow);
    horizonResults.push({
      label,
      days: horizon,
      weight,
      samples: samples.length,
      hitRate: accuracy,
      upProbability: pUp,
    });
  }

  if (!horizonResults.length) {
    return [0.0, 0.0, { samples: 0, horizonDays: 63, hitRate: null }];
  }

  const totalWeight = horizonResults.reduce((acc, item) => acc + item.weight, 0);
  const blendedProbability =
    totalWeight > 0
      ? horizonResults.reduce((acc, item) => acc + item.upProbability * item.weight, 0) / totalWeight
      : 0.5;
  const blendedHitRate =
    totalWeight > 0
      ? horizonResults.reduce((acc, item) => acc + item.hitRate * item.weight, 0) / totalWeight
      : 0.5;
  const totalSamples = horizonResults.reduce((acc, item) => acc + Math.trunc(item.samples), 0);
  const coverage = horizonResults.length / horizonSpecs.length;
  const confidence = clamp(
    Math.abs(blendedHitRate - 0.5) * 2.0 * coverage * Math.min(1.0, totalSamples / 320.0),
    0.0,
    1.0,
  );

  const fundamentalsBias = (financialHealthScore - 0.5) * 0.08 + (valuationScore - 0.5) * 0.06;
  const rawAdjustment = (blendedProbability - 0.5) * 0.2 + fundamentalsBias;

  const horizons: Record<string, { samples: number; hitRate: number; upProbability: number }> = {};
  for (const item of horizonResults) {
    horizons[`${Math.trunc(item.days)}d`] = {
      samples: Math.trunc(item.samples),
      hitRate: round4(item.hitRate),
      upProbability: round4(item.upProbability),
    };
  }

  const details: MlDetails = {
    samples: totalSamples,
    horizonDays: 63,
    hitRate: round4(blendedHitRate),
    upProbability: round4(blendedProbability),
    availableHorizons: horizonResults.map((item) => Math.trunc(item.days)),
    horizons,
    features: {
      earningsSurprise: round4(latestEpsSurprise),
      volumePriceDivergence: round4(latestVpd),
    },
  };
  return [clamp(rawAdjustment, -0.08, 0.08), confidence, details];
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Port of `compute_smart_score`. Pure; never throws. Returns the smartScore
 * shape including score10 and the ML/validation fields the Python source sets.
 */
export function computeSmartScore(input: SmartScoreInput): DashboardData["smartScore"] {
  try {
    const metrics: Row = (input?.metrics as Row) ?? {};
    const technicals: Row = (input?.technicals as unknown as Row) ?? {};
    const financials: Row = (input?.financials as unknown as Row) ?? {};
    const priceHistory = input?.priceHistory ?? [];
    // returnsSummary and news are accepted but unused (mirrors Python `_ = ...`).

    const growthFeatures = extractGrowthFeatures(financials);
    const priceFeatures = extractPriceFeatures(priceHistory);
    const qdCons = latestNonemptyRows(financials["quarterlyDetailedConsolidated"]);
    const qdStandalone = latestNonemptyRows(financials["quarterlyDetailedStandalone"]);
    const quarterlyDetailed = qdCons.length ? qdCons : qdStandalone;

    const roe = num(metrics["roe"]);
    const roa = num(metrics["roa"]);
    const roce = num(metrics["roce"]);
    const profitMargin = num(metrics["profitMargin"]);
    const peRatio = num(metrics["peRatio"]);
    const pbRatio = num(metrics["pbRatio"]);
    const evToSales = num(metrics["evToSales"]);
    const pegRatio = num(metrics["pegRatio"]);
    const dividendYield = num(metrics["dividendYield"]);
    const debtToEquity = num(metrics["debtToEquity"]);
    const currentRatio = num(metrics["currentRatio"]);
    const rsi14 = num(technicals["rsi14"]);
    const macd = num(technicals["macd"]);
    const ema20 = num(technicals["ema20"]);
    const ema50 = num(technicals["ema50"]);
    const trend = String(technicals["trend"] || "Neutral").toLowerCase();

    const altmanZ = computeAltmanZ(metrics, financials);
    let interestCoverage = num(metrics["interestCoverage"]);
    if (interestCoverage === null) {
      const incomeRows = latestNonemptyRows(financials["incomeStatement"]);
      if (incomeRows.length) {
        const ebit = statementValue(incomeRows[0], ["ebit", "operatingIncome"]);
        const interest = statementValue(incomeRows[0], ["interestExpense", "interestCost"]);
        if (ebit !== null && interest !== null && Math.abs(interest) > 1e-9) {
          interestCoverage = ebit / Math.abs(interest);
        }
      }
    }

    const profitability = median(
      [
        normalize(roe, 5.0, 25.0),
        normalize(roa, 1.0, 10.0),
        normalize(roce, 8.0, 30.0),
        normalize(profitMargin, 5.0, 25.0),
      ],
      0.5,
    );

    const growth = median(
      [
        normalize(growthFeatures.revenueGrowth, 0.0, 25.0),
        normalize(growthFeatures.profitGrowth, 0.0, 25.0),
        normalize(growthFeatures.epsGrowth, 0.0, 20.0),
        normalize(growthFeatures.freeCashFlowGrowth, 0.0, 20.0),
      ],
      0.5,
    );

    const valuation = median(
      [
        inverseNormalize(peRatio !== null && peRatio > 0 ? peRatio : null, 8.0, 45.0),
        inverseNormalize(pbRatio !== null && pbRatio > 0 ? pbRatio : null, 1.0, 8.0),
        inverseNormalize(pegRatio, 0.5, 3.0),
        inverseNormalize(evToSales, 1.0, 12.0),
        normalize(dividendYield, 0.0, 4.0),
      ],
      0.5,
    );

    let rsiScore: Num = null;
    if (rsi14 !== null) rsiScore = clamp(1.0 - Math.abs(rsi14 - 55.0) / 45.0, 0.0, 1.0);
    let macdScore: Num = null;
    if (macd !== null) macdScore = sigmoid(macd / 2.5);
    const trendScore = trend === "bullish" ? 0.7 : trend === "bearish" ? 0.35 : 0.5;
    let emaScore: Num = null;
    if (ema20 !== null && ema50 !== null) emaScore = ema20 >= ema50 ? 1.0 : 0.25;

    const momentum = median(
      [
        rsiScore,
        macdScore,
        emaScore,
        trendScore,
        normalize(priceFeatures.return3M, -15.0, 35.0),
        normalize(priceFeatures.return6M, -20.0, 50.0),
      ],
      0.5,
    );

    const financialHealth = median(
      [
        inverseNormalize(debtToEquity, 0.0, 2.5),
        normalize(currentRatio, 1.0, 3.0),
        normalize(interestCoverage, 1.5, 8.0),
        normalize(altmanZ, 1.8, 4.0),
        insiderSignal(input?.corporateActions as unknown as Row),
        institutionalSignal(input?.shareholding as unknown as Row),
      ],
      0.5,
    );

    const baseScore01 =
      0.25 * profitability +
      0.2 * growth +
      0.2 * valuation +
      0.2 * momentum +
      0.15 * financialHealth;

    const [mlAdjustment, mlConfidence, validation] = walkForwardMlAdjustment(
      priceHistory,
      financialHealth,
      valuation,
      quarterlyDetailed,
    );
    const finalScore01 = clamp(baseScore01 + mlAdjustment * mlConfidence, 0.0, 1.0);
    const fundamentalCoverage = [
      roe, roa, roce, profitMargin,
      growthFeatures.revenueGrowth, growthFeatures.profitGrowth,
      peRatio, pbRatio, pegRatio, evToSales,
      debtToEquity, currentRatio, interestCoverage, altmanZ,
    ].filter((value) => value !== null).length;
    const isRated = fundamentalCoverage >= 3;
    const score5 = isRated ? round2(finalScore01 * 5.0) : 0;

    const dimensions: Record<string, number> = {
      profitability: round2(profitability * 5.0),
      growth: round2(growth * 5.0),
      valuation: round2(valuation * 5.0),
      momentum: round2(momentum * 5.0),
      financialHealth: round2(financialHealth * 5.0),
    };

    return {
      score: score5,
      maxScore: 5,
      dimensions,
      label: !isRated ? "Unrated" : score5 >= 4 ? "Strong" : score5 >= 2.5 ? "Moderate" : "Weak",
      explanation:
        "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. " +
        "A bounded multi-horizon walk-forward ML signal blends price trend persistence with earnings surprise " +
        "and volume confirmation before applying a small score adjustment.",
      score10: isRated ? round2(finalScore01 * 10.0) : 0,
      mlAdjustment: round2(mlAdjustment * mlConfidence * 5.0),
      mlConfidence: round2(mlConfidence),
      validation: validation as DashboardData["smartScore"]["validation"],
      modelVersion: "factor-v3",
    };
  } catch {
    // GOLDEN RULE: never throw. Return a neutral skeleton on any failure.
    return {
      score: 0,
      maxScore: 5,
      dimensions: {
        profitability: 0,
        growth: 0,
        valuation: 0,
        momentum: 0,
        financialHealth: 0,
      },
      label: "Weak",
      explanation:
        "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. " +
        "A bounded multi-horizon walk-forward ML signal blends price trend persistence with earnings surprise " +
        "and volume confirmation before applying a small score adjustment.",
      score10: 0,
      mlAdjustment: 0,
      mlConfidence: 0,
      validation: { samples: 0, horizonDays: 63, hitRate: null },
      modelVersion: "factor-v3",
    };
  }
}

/**
 * Port of `compute_risk_score`. Pure; never throws. No score10/ML/validation
 * fields (those belong to smartScore only).
 */
export function computeRiskScore(input: RiskScoreInput): DashboardData["riskScore"] {
  try {
    const newsItems = Array.isArray(input?.news) ? input.news : [];
    const metrics: Row = (input?.metrics as Row) ?? {};
    const technicals: Row = (input?.technicals as unknown as Row) ?? {};
    const financials: Row = (input?.financials as unknown as Row) ?? {};
    const priceHistory = input?.priceHistory ?? [];
    const brokerageResearch = input?.brokerageResearch as unknown;

    const sentiments: number[] = [];
    const narrativeRiskScores: number[] = [];

    for (const article of newsItems) {
      const articleRow: Row = isPlainObject(article) ? (article as unknown as Row) : {};
      const sentiment = num(articleRow["sentimentScore"], 0.5);
      sentiments.push(clamp(sentiment !== null ? sentiment : 0.5, 0.0, 1.0));
      const text = (String(articleRow["title"] ?? "") + " " + String(articleRow["summary"] ?? "")).toLowerCase();
      if (["lawsuit", "forensic", "insolvency", "raid", "restatement"].some((token) => text.includes(token))) {
        narrativeRiskScores.push(0.85);
      } else if (["fall", "pledge", "regulatory", "volatility", "outflow"].some((token) => text.includes(token))) {
        narrativeRiskScores.push(0.65);
      } else {
        narrativeRiskScores.push(articleRiskWeight(text));
      }
    }

    if (isPlainObject(brokerageResearch)) {
      const summaryRaw = (brokerageResearch as Row)["summary"];
      const summary: Row = isPlainObject(summaryRaw) ? summaryRaw : {};
      const total = num(summary["total"]);
      const buys = num(summary["buy"]);
      const sells = num(summary["sell"]);
      const holds = num(summary["hold"]);
      // Python: `total not in {None, 0}` — excludes both null and 0.
      if (total !== null && total !== 0 && buys !== null && sells !== null) {
        const structuredSentiment = clamp(0.5 + ((buys - sells) / total) * 0.35, 0.0, 1.0);
        sentiments.push(structuredSentiment);
        if (holds !== null && holds / total > 0.55) {
          narrativeRiskScores.push(0.5);
        }
      }
    }

    const sentimentRisk = clamp(1.0 - avg(sentiments, 0.5), 0.0, 1.0);
    const narrativeRisk = clamp(avg(narrativeRiskScores, 0.45), 0.0, 1.0);

    const debtToEquity = num(metrics["debtToEquity"]);
    const currentRatio = num(metrics["currentRatio"]);
    const roa = num(metrics["roa"]);
    const altmanZ = computeAltmanZ(metrics, financials);
    const interestCoverage = num(metrics["interestCoverage"]);

    const neutralIfMissing = (value: Num): number => value === null ? 0.5 : value;
    const financialRisk = avg(
      [
        normalize(debtToEquity, 0.4, 2.5),
        1.0 - neutralIfMissing(normalize(currentRatio, 1.0, 3.0)),
        1.0 - neutralIfMissing(normalize(roa, 1.0, 10.0)),
        1.0 - neutralIfMissing(normalize(interestCoverage, 1.5, 8.0)),
        1.0 - neutralIfMissing(normalize(altmanZ, 1.8, 4.0)),
      ],
      0.5,
    );

    const priceFeatures = extractPriceFeatures(priceHistory);
    const rsi14 = num(technicals["rsi14"]);
    const macd = num(technicals["macd"]);
    const trend = String(technicals["trend"] || "Neutral").toLowerCase();
    const technicalRisk = avg(
      [
        normalize(Math.abs((pyOr(rsi14, 50.0) as number) - 50.0), 0.0, 35.0),
        normalize(priceFeatures.volatility3M, 0.15, 0.55),
        normalize(priceFeatures.drawdown1Y, 0.08, 0.45),
        trend === "bullish" ? 0.35 : trend === "bearish" ? 0.7 : 0.5,
        macd !== null && macd > 0 ? 0.35 : macd !== null && macd < 0 ? 0.65 : 0.5,
      ],
      0.5,
    );

    const weightedRisk =
      0.25 * sentimentRisk + 0.25 * financialRisk + 0.3 * narrativeRisk + 0.2 * technicalRisk;
    const riskCoverage =
      sentiments.length +
      narrativeRiskScores.length +
      [debtToEquity, currentRatio, roa, altmanZ, interestCoverage, rsi14, macd]
        .filter((value) => value !== null).length +
      (priceHistory.length >= 2 ? 1 : 0);
    const isRated = riskCoverage >= 2;
    const riskScore = isRated ? round2(clamp(weightedRisk, 0.0, 1.0) * 5.0) : 0;

    return {
      score: riskScore,
      maxScore: 5,
      components: {
        sentiment: round2(sentimentRisk * 5.0),
        financialRisk: round2(financialRisk * 5.0),
        narrativeRisk: round2(narrativeRisk * 5.0),
        technicalRisk: round2(technicalRisk * 5.0),
      },
      label: !isRated ? "Unrated" : riskScore < 2 ? "Low" : riskScore < 3.5 ? "Medium" : "High",
      explanation:
        "Risk score blends sentiment risk, financial stress, narrative red flags, and technical instability " +
        "using weighted normalized factors.",
      modelVersion: "risk-v2",
    };
  } catch {
    // GOLDEN RULE: never throw. Return a neutral skeleton on any failure.
    return {
      score: 0,
      maxScore: 5,
      components: {
        sentiment: 0,
        financialRisk: 0,
        narrativeRisk: 0,
        technicalRisk: 0,
      },
      label: "Low",
      explanation:
        "Risk score blends sentiment risk, financial stress, narrative red flags, and technical instability " +
        "using weighted normalized factors.",
      modelVersion: "risk-v2",
    };
  }
}
