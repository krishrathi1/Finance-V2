/**
 * Piotroski F-Score (Piotroski, 2000) — nine pass/fail fundamental signals
 * comparing the latest reported year against the one before, computed from
 * statements the dashboard already returns. No extra provider calls.
 *
 * Deliberately returns `null` rather than a number when the inputs aren't
 * there. A fundamental-strength score computed from missing statements would
 * look authoritative and mean nothing, which is worse than showing nothing —
 * so every input is checked, and any signal that can't be tested is reported
 * as such instead of being quietly assumed to pass.
 *
 * The Altman Z-Score deliberately does NOT live here: it already exists in
 * `lib/quality-checklist.ts` and is rendered by the Quality & Safety card. Two
 * implementations of one financial model is how the same company ends up with
 * two different distress ratings on one page.
 *
 * Pure and dependency-free so the arithmetic is directly testable.
 */

export type IncomeStatementRow = {
  period: string;
  revenue?: number | null;
  ebit?: number | null;
  netIncome?: number | null;
};

export type BalanceSheetRow = {
  period: string;
  totalAssets?: number | null;
  totalDebt?: number | null;
  totalLiabilities?: number | null;
  equity?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  retainedEarnings?: number | null;
};

export type CashFlowRow = {
  period: string;
  operatingCashFlow?: number | null;
  freeCashFlow?: number | null;
};

export type FinancialsInput = {
  incomeStatement?: IncomeStatementRow[] | null;
  balanceSheet?: BalanceSheetRow[] | null;
  cashFlow?: CashFlowRow[] | null;
};

/** A finite number, or null. Guards against nulls, NaN and Infinity alike. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Division that refuses to produce Infinity or NaN from a zero/absent divisor. */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/**
 * Statement rows arrive newest-first from some providers and oldest-first from
 * others. Sorting by period defensively means "latest" is genuinely the latest
 * rather than whichever end of the array happened to be first — a mix-up that
 * would silently invert every year-over-year comparison below.
 */
function sortByPeriodDescending<T extends { period: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(b.period).localeCompare(String(a.period)));
}

// ---------------------------------------------------------------------------
// Piotroski F-Score
// ---------------------------------------------------------------------------

export type PiotroskiSignal = {
  key: string;
  label: string;
  /** null when the data needed to judge it isn't available. */
  passed: boolean | null;
  detail: string;
  category: "profitability" | "leverage" | "efficiency";
};

export type PiotroskiFScore = {
  /** Signals passed. */
  score: number;
  /** Signals that could actually be tested — the honest denominator. */
  testable: number;
  /** Always 9, so the UI can say how much of the model was applicable. */
  maxScore: number;
  signals: PiotroskiSignal[];
  label: string;
  strength: "weak" | "moderate" | "strong";
};

export const PIOTROSKI_MAX_SIGNALS = 9;

/**
 * Piotroski F-Score: nine binary fundamental signals, needing this year and
 * last.
 *
 * Two of the nine can't be evaluated from the data this app has:
 *
 *   - *No new shares issued* needs a share-count history; only the current
 *     count is available.
 *   - *Gross margin improving* needs gross profit, and only revenue, EBIT and
 *     net income are provided.
 *
 * Rather than assume those pass (inflating every company's score by two) or
 * fail (penalising every company), they're returned with `passed: null` and
 * excluded from `testable`. The UI shows "6 of 7 applicable" honestly instead
 * of a confident but wrong "6 of 9".
 */
export function piotroskiFScore(financials: FinancialsInput): PiotroskiFScore | null {
  const balanceSheets = Array.isArray(financials.balanceSheet) ? financials.balanceSheet : [];
  const incomeStatements = Array.isArray(financials.incomeStatement) ? financials.incomeStatement : [];
  const cashFlows = Array.isArray(financials.cashFlow) ? financials.cashFlow : [];

  // The model is inherently year-over-year; one year of data can't produce it.
  if (balanceSheets.length < 2 || incomeStatements.length < 2) return null;

  const [balanceNow, balancePrev] = sortByPeriodDescending(balanceSheets);
  const [incomeNow, incomePrev] = sortByPeriodDescending(incomeStatements);
  const sortedCashFlows = sortByPeriodDescending(cashFlows);
  const cashFlowNow = sortedCashFlows[0];
  const cashFlowPrev = sortedCashFlows[1];

  const assetsNow = num(balanceNow?.totalAssets);
  const assetsPrev = num(balancePrev?.totalAssets);
  const netIncomeNow = num(incomeNow?.netIncome);
  const netIncomePrev = num(incomePrev?.netIncome);
  const operatingCashFlowNow = num(cashFlowNow?.operatingCashFlow);

  const roaNow = ratio(netIncomeNow, assetsNow);
  const roaPrev = ratio(netIncomePrev, assetsPrev);

  const signals: PiotroskiSignal[] = [];
  const add = (
    key: string,
    label: string,
    category: PiotroskiSignal["category"],
    passed: boolean | null,
    detail: string
  ) => signals.push({ key, label, category, passed, detail });

  // --- Profitability -------------------------------------------------------
  add(
    "roaPositive",
    "Positive return on assets",
    "profitability",
    roaNow === null ? null : roaNow > 0,
    roaNow === null ? "Return on assets unavailable" : `ROA ${(roaNow * 100).toFixed(1)}%`
  );

  add(
    "operatingCashFlowPositive",
    "Positive operating cash flow",
    "profitability",
    operatingCashFlowNow === null ? null : operatingCashFlowNow > 0,
    operatingCashFlowNow === null
      ? "Operating cash flow unavailable"
      : `Operating cash flow ${operatingCashFlowNow >= 0 ? "positive" : "negative"}`
  );

  add(
    "roaImproving",
    "Return on assets improving",
    "profitability",
    roaNow === null || roaPrev === null ? null : roaNow > roaPrev,
    roaNow === null || roaPrev === null
      ? "Needs two years of data"
      : `${(roaPrev * 100).toFixed(1)}% → ${(roaNow * 100).toFixed(1)}%`
  );

  // Cash-backed earnings. The single most telling signal in the set: profit
  // that isn't matched by cash is the classic marker of aggressive accrual
  // accounting, which is precisely what this score exists to surface.
  add(
    "accruals",
    "Earnings backed by cash",
    "profitability",
    operatingCashFlowNow === null || netIncomeNow === null ? null : operatingCashFlowNow > netIncomeNow,
    operatingCashFlowNow === null || netIncomeNow === null
      ? "Cash flow or net income unavailable"
      : operatingCashFlowNow > netIncomeNow
      ? "Operating cash flow exceeds net profit"
      : "Net profit exceeds operating cash flow",
  );

  // --- Leverage, liquidity, funding ---------------------------------------
  const leverageNow = ratio(num(balanceNow?.totalDebt), assetsNow);
  const leveragePrev = ratio(num(balancePrev?.totalDebt), assetsPrev);
  add(
    "leverageFalling",
    "Debt burden reduced",
    "leverage",
    leverageNow === null || leveragePrev === null ? null : leverageNow < leveragePrev,
    leverageNow === null || leveragePrev === null
      ? "Debt-to-assets unavailable"
      : `Debt/assets ${(leveragePrev * 100).toFixed(1)}% → ${(leverageNow * 100).toFixed(1)}%`
  );

  const currentRatioNow = ratio(num(balanceNow?.currentAssets), num(balanceNow?.currentLiabilities));
  const currentRatioPrev = ratio(num(balancePrev?.currentAssets), num(balancePrev?.currentLiabilities));
  add(
    "currentRatioImproving",
    "Short-term liquidity improving",
    "leverage",
    currentRatioNow === null || currentRatioPrev === null ? null : currentRatioNow > currentRatioPrev,
    currentRatioNow === null || currentRatioPrev === null
      ? "Current ratio unavailable"
      : `Current ratio ${currentRatioPrev.toFixed(2)} → ${currentRatioNow.toFixed(2)}`
  );

  add(
    "noDilution",
    "No new shares issued",
    "leverage",
    null,
    "Not assessed — share count history isn't available"
  );

  // --- Operating efficiency ------------------------------------------------
  add(
    "grossMarginImproving",
    "Gross margin improving",
    "efficiency",
    null,
    "Not assessed — gross profit isn't reported in this dataset"
  );

  const turnoverNow = ratio(num(incomeNow?.revenue), assetsNow);
  const turnoverPrev = ratio(num(incomePrev?.revenue), assetsPrev);
  add(
    "assetTurnoverImproving",
    "Asset turnover improving",
    "efficiency",
    turnoverNow === null || turnoverPrev === null ? null : turnoverNow > turnoverPrev,
    turnoverNow === null || turnoverPrev === null
      ? "Asset turnover unavailable"
      : `Turnover ${turnoverPrev.toFixed(2)}x → ${turnoverNow.toFixed(2)}x`
  );

  const testable = signals.filter((signal) => signal.passed !== null).length;
  if (testable === 0) return null;

  const score = signals.filter((signal) => signal.passed === true).length;

  // Graded on the share of *applicable* signals passed, so a company with
  // fewer testable signals isn't mechanically rated weak.
  const share = score / testable;
  const strength = share >= 0.7 ? "strong" : share >= 0.45 ? "moderate" : "weak";

  return {
    score,
    testable,
    maxScore: PIOTROSKI_MAX_SIGNALS,
    signals,
    strength,
    label: strength === "strong" ? "Strong fundamentals" : strength === "moderate" ? "Mixed fundamentals" : "Weak fundamentals",
  };
}
