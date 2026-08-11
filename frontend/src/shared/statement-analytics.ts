/**
 * Analytics derived from the financial statements already in the dashboard
 * payload — the "why" behind the headline ratios.
 *
 * A single ROE number says a company is profitable; it doesn't say whether
 * that came from fat margins, hard-working assets, or simply a lot of
 * borrowing. These break that apart, and track the direction of travel across
 * reported years.
 *
 * Every function returns `null` when its inputs are absent, rather than
 * substituting zero. `Number(null)` is 0, and a 0% margin presented as fact is
 * far more damaging than a blank.
 *
 * Pure and dependency-free.
 */

import type { BalanceSheetRow, CashFlowRow, IncomeStatementRow } from "@/shared/forensic-scores";

export type StatementInput = {
  incomeStatement?: IncomeStatementRow[] | null;
  balanceSheet?: BalanceSheetRow[] | null;
  cashFlow?: CashFlowRow[] | null;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** Newest first. Ordering is enforced, not assumed — providers disagree. */
function newestFirst<T extends { period: string }>(rows: T[] | null | undefined): T[] {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => String(b.period).localeCompare(String(a.period)));
}

// ---------------------------------------------------------------------------
// DuPont decomposition
// ---------------------------------------------------------------------------

export type DuPontBreakdown = {
  period: string;
  /** Net income / revenue. */
  netMargin: number;
  /** Revenue / total assets. */
  assetTurnover: number;
  /** Total assets / equity. */
  equityMultiplier: number;
  /** The product of the three — ROE, as a percentage. */
  roe: number;
  /** Which term contributes most to the ROE. */
  primaryDriver: "margin" | "turnover" | "leverage";
};

/**
 * Three-step DuPont: ROE = net margin × asset turnover × equity multiplier.
 *
 * The point is that two companies with identical ROE can be entirely
 * different businesses — one earning it through pricing power, the other
 * through leverage. `primaryDriver` names which, using the largest term
 * relative to a neutral baseline of 1.0, since the three terms live on
 * different scales and can't be compared raw.
 */
export function duPont(statements: StatementInput): DuPontBreakdown | null {
  const income = newestFirst(statements.incomeStatement)[0];
  const balance = newestFirst(statements.balanceSheet)[0];
  if (!income || !balance) return null;

  const revenue = num(income.revenue);
  const netIncome = num(income.netIncome);
  const totalAssets = num(balance.totalAssets);

  // Prefer reported equity; fall back to assets - liabilities, which many
  // providers leave implicit.
  const reportedEquity = num(balance.equity);
  const totalLiabilities = num(balance.totalLiabilities);
  const equity =
    reportedEquity !== null && reportedEquity !== 0
      ? reportedEquity
      : totalAssets !== null && totalLiabilities !== null
      ? totalAssets - totalLiabilities
      : null;

  const netMargin = ratio(netIncome, revenue);
  const assetTurnover = ratio(revenue, totalAssets);
  const equityMultiplier = ratio(totalAssets, equity);

  if (netMargin === null || assetTurnover === null || equityMultiplier === null) return null;
  // Negative equity makes the multiplier meaningless (and flips ROE's sign for
  // the wrong reason) — a genuinely distressed balance sheet the decomposition
  // can't describe.
  if (equity !== null && equity <= 0) return null;

  const roe = netMargin * assetTurnover * equityMultiplier * 100;
  if (!Number.isFinite(roe)) return null;

  const distances: Array<[DuPontBreakdown["primaryDriver"], number]> = [
    ["margin", Math.abs(netMargin)],
    ["turnover", Math.abs(assetTurnover - 1)],
    ["leverage", Math.abs(equityMultiplier - 1)],
  ];
  distances.sort((a, b) => b[1] - a[1]);

  return {
    period: String(income.period),
    netMargin: netMargin * 100,
    assetTurnover,
    equityMultiplier,
    roe,
    primaryDriver: distances[0][0],
  };
}

// ---------------------------------------------------------------------------
// Cash conversion
// ---------------------------------------------------------------------------

export type CashConversion = {
  period: string;
  /** Operating cash flow / net income. */
  ratio: number;
  /** Below 1 means reported profit isn't arriving as cash. */
  quality: "strong" | "adequate" | "weak";
  operatingCashFlow: number;
  netIncome: number;
};

/**
 * How much of reported profit turns into actual cash.
 *
 * Persistently below 1.0 is the classic signature of revenue recognised long
 * before it is collected. Requires positive net income: with a loss the ratio
 * inverts in sign and stops meaning anything.
 */
export function cashConversion(statements: StatementInput): CashConversion | null {
  const cashFlow = newestFirst(statements.cashFlow)[0];
  const income = newestFirst(statements.incomeStatement)[0];
  if (!cashFlow || !income) return null;

  const operatingCashFlow = num(cashFlow.operatingCashFlow);
  const netIncome = num(income.netIncome);
  if (operatingCashFlow === null || netIncome === null || netIncome <= 0) return null;

  const value = operatingCashFlow / netIncome;
  if (!Number.isFinite(value)) return null;

  return {
    period: String(cashFlow.period),
    ratio: value,
    quality: value >= 1 ? "strong" : value >= 0.8 ? "adequate" : "weak",
    operatingCashFlow,
    netIncome,
  };
}

// ---------------------------------------------------------------------------
// Free cash flow yield
// ---------------------------------------------------------------------------

/**
 * Free cash flow as a percentage of market capitalisation — what the business
 * generates in cash relative to what the market charges for it. A valuation
 * measure that, unlike P/E, can't be flattered by accounting choices.
 */
export function freeCashFlowYield(
  statements: StatementInput,
  marketCap: number | null | undefined
): number | null {
  const cashFlow = newestFirst(statements.cashFlow)[0];
  if (!cashFlow) return null;
  const freeCashFlow = num(cashFlow.freeCashFlow);
  const cap = num(marketCap);
  if (freeCashFlow === null || cap === null || cap <= 0) return null;
  const yieldPercent = (freeCashFlow / cap) * 100;
  return Number.isFinite(yieldPercent) ? yieldPercent : null;
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type TrendSeries = {
  label: string;
  points: Array<{ period: string; value: number }>;
  /** Change from the earliest to the latest reported period, in points. */
  change: number | null;
  direction: "up" | "down" | "flat" | null;
};

function buildTrend(
  label: string,
  points: Array<{ period: string; value: number | null }>
): TrendSeries | null {
  const usable = points.filter((point): point is { period: string; value: number } => point.value !== null);
  if (usable.length < 2) return null;

  // Oldest first so the chart and the change read left-to-right.
  const ordered = [...usable].sort((a, b) => a.period.localeCompare(b.period));
  const change = ordered[ordered.length - 1].value - ordered[0].value;

  return {
    label,
    points: ordered,
    change,
    // A hair either side of zero isn't a trend; treat near-zero as flat so a
    // rounding-level wobble doesn't get an arrow.
    direction: Math.abs(change) < 1e-9 ? "flat" : change > 0 ? "up" : "down",
  };
}

/** Net margin by reported year, as percentages. */
export function netMarginTrend(statements: StatementInput): TrendSeries | null {
  const rows = newestFirst(statements.incomeStatement);
  return buildTrend(
    "Net margin",
    rows.map((row) => {
      const value = ratio(num(row.netIncome), num(row.revenue));
      return { period: String(row.period), value: value === null ? null : value * 100 };
    })
  );
}

/** Debt as a percentage of total assets, by reported year. */
export function leverageTrend(statements: StatementInput): TrendSeries | null {
  const rows = newestFirst(statements.balanceSheet);
  return buildTrend(
    "Debt to assets",
    rows.map((row) => {
      const value = ratio(num(row.totalDebt), num(row.totalAssets));
      return { period: String(row.period), value: value === null ? null : value * 100 };
    })
  );
}

/**
 * Compound annual growth of a statement line across the reported periods.
 *
 * Returns null when the starting value is non-positive: a CAGR out of a loss
 * or a zero base is arithmetically undefined, and providers do report both.
 */
export function statementCagr(
  rows: Array<{ period: string }> | null | undefined,
  pick: (row: any) => number | null | undefined
): number | null {
  const ordered = newestFirst(rows as any[]).reverse();
  const values = ordered
    .map((row) => ({ period: String(row.period), value: num(pick(row)) }))
    .filter((entry): entry is { period: string; value: number } => entry.value !== null);
  if (values.length < 2) return null;

  const first = values[0].value;
  const last = values[values.length - 1].value;
  if (first <= 0 || last <= 0) return null;

  const years = values.length - 1;
  const cagr = (Math.pow(last / first, 1 / years) - 1) * 100;
  return Number.isFinite(cagr) ? cagr : null;
}

export type GrowthProfile = {
  revenueCagr: number | null;
  profitCagr: number | null;
  years: number;
};

/** Revenue and profit CAGR across whatever years the provider reported. */
export function growthProfile(statements: StatementInput): GrowthProfile | null {
  const rows = newestFirst(statements.incomeStatement);
  if (rows.length < 2) return null;
  return {
    revenueCagr: statementCagr(rows, (row) => row.revenue),
    profitCagr: statementCagr(rows, (row) => row.netIncome),
    years: rows.length - 1,
  };
}
