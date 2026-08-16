// Quality & Safety scorecard — a rule-based fundamental-quality checklist plus
// rule-based red flags, computed from the snapshot ratios, multi-year revenue/
// net-income, and growth figures that the dashboard payload actually provides.
//
// (The deep balance-sheet / cash-flow statements are frequently empty from the
// free data providers, so we deliberately do NOT depend on them for the core
// score; the optional Altman Z-Score is shown only when that data is present.)
//
// Every check is null-safe: a check whose inputs are missing is reported as
// `pass: null` (not counted), so partial data degrades gracefully.

type Row = Record<string, any>;

export interface QualityInput {
  metrics?: Record<string, number | null>; // roe, roa, roce, profitMargin, debtToEquity, currentRatio, peRatio, marketCap
  incomeStatement?: Row[]; // { period, revenue, netIncome }
  balanceSheet?: Row[]; // optional, for Altman Z
  growthSnapshot?: { periods?: Array<{ label?: string; metrics?: Array<{ label?: string; value?: number | null }> }> };
  /** Used only to suppress Altman Z where the model doesn't apply — see altmanAppliesTo. */
  sector?: string | null;
}

/**
 * Altman's 1968 model was fitted to public *manufacturers*. Banks, NBFCs and
 * insurers hold structurally high liabilities and have no working capital in
 * the industrial sense, so terms A and D drag the score down and the formula
 * reports "distress" for institutions that are perfectly sound — and that
 * verdict then propagates into the red-flag list.
 *
 * Suppressing the score for those sectors is the honest option: showing
 * nothing beats showing a confident, wrong bankruptcy rating.
 */
export function altmanAppliesTo(sector: string | null | undefined): boolean {
  const normalized = String(sector ?? "").toLowerCase();
  if (!normalized) return true;
  return !["financial", "bank", "insurance", "capital market", "nbfc", "asset management"].some(
    (term) => normalized.includes(term)
  );
}

export interface QualityCheck {
  label: string;
  pass: boolean | null;
  detail: string;
}

export type QualityLabel = "Strong" | "Moderate" | "Weak" | "Unrated";
export type AltmanZone = "Safe" | "Grey" | "Distress";

export interface QualityResult {
  checks: QualityCheck[];
  passed: number;
  total: number; // computable checks only
  label: QualityLabel;
  altmanZ: number | null;
  altmanZone: AltmanZone | null;
  redFlags: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Sortable rank for a statement period, in months.
 *
 * Both branches must return the *same* unit. They previously did not: a named
 * month ("Mar 2024") produced `year * 12 + month` (~24,290) while an ISO date
 * ("2023-03-31") fell through to `Date.parse` (~1.68e12). Sorting a list
 * containing both then ranked every ISO-dated row above every named-month row
 * regardless of date — so a provider mixing the two formats (common when
 * annual and quarterly rows come from different upstreams) had its *oldest*
 * balance sheet selected as "latest", and the Altman Z-Score computed from it
 * reported distress for a healthy company.
 *
 * Month precision is deliberate: statement rows are annual or quarterly, and
 * it is the granularity the named-month branch can offer anyway. Ties keep
 * their input order, since `Array.prototype.sort` is stable.
 */
function periodKey(p: unknown): number {
  if (p == null) return -Infinity;
  const s = String(p).trim().toLowerCase();
  const m = s.match(/([a-z]{3})[^0-9]*(\d{2,4})/);
  // An unrecognised three-letter run isn't a month; fall through to Date.parse
  // rather than defaulting it to January and inventing an ordering.
  if (m && MONTHS[m[1]] !== undefined) {
    const mon = MONTHS[m[1]];
    let yr = parseInt(m[2], 10);
    if (yr < 100) yr += 2000;
    return yr * 12 + mon;
  }
  const d = Date.parse(s);
  if (Number.isNaN(d)) return -Infinity;
  const parsed = new Date(d);
  return parsed.getUTCFullYear() * 12 + parsed.getUTCMonth();
}

function num(x: unknown): number | null {
  const n = typeof x === "string" ? Number(x) : (x as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Net-income series (newest first), keeping only rows that actually report it.
function netIncomeSeries(rows?: Row[]): number[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => num(r?.netIncome) !== null)
    .sort((a, b) => periodKey(b?.period) - periodKey(a?.period))
    .map((r) => num(r?.netIncome) as number);
}

function growthValue(gs: QualityInput["growthSnapshot"], label: string): number | null {
  const period = gs?.periods?.[0];
  const metric = period?.metrics?.find((m) => m?.label === label);
  return num(metric?.value);
}

// Check helper: threshold comparison that yields null when the input is missing.
function threshold(value: number | null, ok: (v: number) => boolean): boolean | null {
  return value === null ? null : ok(value);
}

export function computeQuality(input: QualityInput): QualityResult {
  const m = input.metrics ?? {};
  const roe = num(m.roe);
  const roce = num(m.roce);
  const profitMargin = num(m.profitMargin);
  const debtToEquity = num(m.debtToEquity);
  const currentRatio = num(m.currentRatio);
  const peRatio = num(m.peRatio);

  const niSeries = netIncomeSeries(input.incomeStatement);
  const revGrowth = growthValue(input.growthSnapshot, "Revenue Growth");
  const profitGrowth = growthValue(input.growthSnapshot, "Net Profit Growth");

  // Consistent profits: every reported year positive (needs >=2 years).
  const consistentProfit: boolean | null =
    niSeries.length >= 2 ? niSeries.every((v) => v > 0) : null;

  // Profit trend fallback when growth snapshot is absent.
  const profitTrend: boolean | null =
    profitGrowth !== null ? profitGrowth > 0 : niSeries.length >= 2 ? niSeries[0] > niSeries[1] : null;

  const checks: QualityCheck[] = [
    { label: "Profitable business", pass: threshold(profitMargin, (v) => v > 0), detail: "Positive net profit margin" },
    { label: "Strong return on equity", pass: threshold(roe, (v) => v >= 12), detail: "ROE ≥ 12%" },
    { label: "Efficient capital use", pass: threshold(roce, (v) => v >= 12), detail: "ROCE ≥ 12%" },
    { label: "Conservative leverage", pass: threshold(debtToEquity, (v) => v <= 1), detail: "Debt-to-equity ≤ 1" },
    { label: "Adequate liquidity", pass: threshold(currentRatio, (v) => v >= 1), detail: "Current ratio ≥ 1" },
    { label: "Growing revenue", pass: threshold(revGrowth, (v) => v > 0), detail: "Revenue rose over the last year" },
    { label: "Growing profit", pass: profitTrend, detail: "Net profit is trending up" },
    { label: "Consistent profits", pass: consistentProfit, detail: "Profitable in every reported year" },
  ];

  const total = checks.filter((c) => c.pass !== null).length;
  const passed = checks.filter((c) => c.pass === true).length;

  let label: QualityLabel = "Unrated";
  if (total >= 4) {
    const frac = passed / total;
    label = frac >= 0.7 ? "Strong" : frac >= 0.45 ? "Moderate" : "Weak";
  }

  // Optional Altman Z (manufacturing model) — only when balance-sheet data exists.
  const bs = Array.isArray(input.balanceSheet)
    ? [...input.balanceSheet]
        .filter((r) => num(r?.totalAssets) !== null)
        .sort((a, b) => periodKey(b?.period) - periodKey(a?.period))[0]
    : undefined;
  const isCur = Array.isArray(input.incomeStatement)
    ? [...input.incomeStatement]
        .filter((r) => num(r?.revenue) !== null)
        .sort((a, b) => periodKey(b?.period) - periodKey(a?.period))[0]
    : undefined;

  let altmanZ: number | null = null;
  let altmanZone: AltmanZone | null = null;
  if (bs && isCur && altmanAppliesTo(input.sector)) {
    const ta = num(bs.totalAssets);
    const tl = num(bs.totalLiabilities);
    const ca = num(bs.currentAssets);
    const cl = num(bs.currentLiabilities);
    const re = num(bs.retainedEarnings);
    const ebit = num(isCur.ebit);
    const rev = num(isCur.revenue);
    const mve = num(m.marketCap);
    if (ta && ta > 0 && tl && tl > 0 && ca !== null && cl !== null && re !== null && ebit !== null && rev !== null && mve !== null) {
      const z =
        1.2 * ((ca - cl) / ta) +
        1.4 * (re / ta) +
        3.3 * (ebit / ta) +
        0.6 * (mve / tl) +
        1.0 * (rev / ta);
      altmanZ = Math.round(z * 100) / 100;
      altmanZone = altmanZ >= 2.99 ? "Safe" : altmanZ >= 1.81 ? "Grey" : "Distress";
    }
  }

  const redFlags: string[] = [];
  if (profitMargin !== null && profitMargin < 0) redFlags.push("Loss-making");
  else if (consistentProfit === false) redFlags.push("Loss in a recent year");
  if (debtToEquity !== null && debtToEquity > 1.5) redFlags.push("High leverage (D/E > 1.5)");
  if (currentRatio !== null && currentRatio < 1) redFlags.push("Current ratio below 1");
  if (revGrowth !== null && revGrowth < 0) redFlags.push("Revenue declining YoY");
  if (profitTrend === false) redFlags.push("Profit under pressure");
  if (peRatio !== null && peRatio > 60) redFlags.push("Rich valuation (P/E > 60)");
  if (altmanZone === "Distress") redFlags.push("Altman Z in distress zone");

  return { checks, passed, total, label, altmanZ, altmanZone, redFlags };
}
