/**
 * The metrics catalog: every figure the dashboard payload can support, named,
 * categorised and computed in one place.
 *
 * The stock page's cards each present a curated view. This is the opposite —
 * the full reference, ~110 metrics across twelve categories, for the reader
 * who wants to look something specific up rather than be told what matters.
 * Screener.in's data page is the model: exhaustive, searchable, dense.
 *
 * Design rules, all in service of "works for every stock":
 *
 *  - **Null-safe throughout.** Every metric computes independently inside a
 *    guard; one missing statement line costs that metric, not the grid.
 *  - **Honest denominators.** The grid reports "N of M available" — a metric
 *    the data cannot support is absent, never zero.
 *  - **No new arithmetic.** Everything reuses the tested pure modules
 *    (price-stats, return-analytics, technical-indicators, statement-
 *    analytics, dividend-history, drawdown-analysis, rolling-returns,
 *    shareholding-trend, forensic-scores, quality-checklist). This file only
 *    names, formats and arranges — so it introduces no formula that isn't
 *    already under test.
 *  - **Tone is sparing.** A metric gets a good/bad tint only where the
 *    threshold is conventional (D/E above 2, interest cover under 2). Most
 *    figures are context-dependent, and colouring them would editorialise.
 */

import { computeQuality } from "@/lib/quality-checklist";
import { drawdownAnalysis } from "@/shared/drawdown-analysis";
import { dividendTrackRecord } from "@/shared/dividend-history";
import { piotroskiFScore } from "@/shared/forensic-scores";
import {
  annualisedVolatility,
  maxDrawdown,
  priceCagr,
  rangePosition,
  returnDistribution,
} from "@/shared/price-stats";
import { calendarYearReturns, downsideRisk, volatilityRegime } from "@/shared/return-analytics";
import { rollingReturns } from "@/shared/rolling-returns";
import { shareholdingTrend } from "@/shared/shareholding-trend";
import {
  cashConversion,
  duPont,
  freeCashFlowYield,
  growthProfile,
  leverageTrend,
  netMarginTrend,
} from "@/shared/statement-analytics";
import {
  bollingerBands,
  macd,
  movingAverages,
  pivotLevels,
  rsi,
  volumeProfile,
} from "@/shared/technical-indicators";

export type MetricCategory =
  | "Valuation"
  | "Profitability"
  | "Growth"
  | "Financial Health"
  | "Cash Flow"
  | "Per Share"
  | "Dividends"
  | "Ownership"
  | "Price & Range"
  | "Returns"
  | "Risk"
  | "Technicals";

/**
 * "percent" is a signed change (+/-); "share" is an unsigned 0-100 level
 * (a position in a range, a proportion of days). The sign is the only
 * difference, and printing "+42%" for "share of holds beating FD" reads as a
 * change that never happened.
 */
export type MetricFormat = "rupees" | "crore" | "percent" | "share" | "ratio" | "number" | "days" | "text";

export type MetricEntry = {
  key: string;
  label: string;
  category: MetricCategory;
  value: number | string;
  format: MetricFormat;
  /** One line on what the figure means — reference, not commentary. */
  about: string;
  tone?: "good" | "bad";
};

export type MetricsCatalog = {
  entries: MetricEntry[];
  /** Metrics with data behind them. */
  available: number;
  /** Metrics defined in the catalog. */
  total: number;
  categories: MetricCategory[];
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type Candidate = {
  key: string;
  label: string;
  category: MetricCategory;
  format: MetricFormat;
  about: string;
  /** Returns the value, or null when the data cannot support it. */
  compute: () => number | string | null;
  /** Optional tint, judged only when the value exists. */
  tone?: (value: number) => "good" | "bad" | undefined;
};

/** Build the full catalog from a dashboard payload. */
export function buildMetricsCatalog(data: any): MetricsCatalog {
  const price = data?.price ?? {};
  const metrics = data?.metrics ?? {};
  const financials = data?.financials ?? {};
  const history = price.history;

  // Shared intermediate results, each computed once and guarded — a throw in
  // any of these must cost its metrics, not the catalog.
  const safe = <T>(fn: () => T): T | null => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  const growth = safe(() => growthProfile(financials));
  const dupont = safe(() => duPont(financials));
  const conversion = safe(() => cashConversion(financials));
  const piotroski = safe(() => piotroskiFScore(financials));
  const marginTrend = safe(() => netMarginTrend(financials));
  const debtTrend = safe(() => leverageTrend(financials));
  const quality = safe(() =>
    computeQuality({
      metrics,
      incomeStatement: financials.incomeStatement,
      balanceSheet: financials.balanceSheet,
      growthSnapshot: financials.growthSnapshot,
      sector: data?.sector,
    })
  );
  const dividends = safe(() =>
    dividendTrackRecord(data?.corporateActions?.dividends, price.cmp, todayKey())
  );
  const ownership = safe(() => shareholdingTrend(data?.shareholding?.history));
  const promoters = ownership?.trends.find((t) => t.key === "promoters") ?? null;
  const range = safe(() => rangePosition(price.cmp, price.fiftyTwoWeekLow, price.fiftyTwoWeekHigh));
  const distribution = safe(() => returnDistribution(history));
  const drawdown = safe(() => maxDrawdown(history));
  const underwater = safe(() => drawdownAnalysis(history));
  const downside = safe(() => downsideRisk(history));
  const regime = safe(() => volatilityRegime(history));
  const rolling = safe(() => rollingReturns(history)) ?? [];
  const oneYearRoll = rolling.find((w) => w.label === "1Y") ?? null;
  const threeYearRoll = rolling.find((w) => w.label === "3Y") ?? null;
  const calendar = safe(() => calendarYearReturns(history)) ?? [];
  const completeYears = calendar.filter((y) => y.complete);
  const averages = safe(() => movingAverages(history));
  const rsiReading = safe(() => rsi(history));
  const macdReading = safe(() => macd(history));
  const bands = safe(() => bollingerBands(history));
  const volume = safe(() => volumeProfile(history));
  const pivots = safe(() => pivotLevels(history));
  const cashLatest = safe(() => {
    const rows = Array.isArray(financials.cashFlow) ? [...financials.cashFlow] : [];
    rows.sort((a: any, b: any) => String(b.period).localeCompare(String(a.period)));
    return rows[0] ?? null;
  });
  const quarterly = Array.isArray(financials.quarterly) ? financials.quarterly : [];
  const quarterlyYoY = (field: "revenue" | "profit"): number | null => {
    if (quarterly.length < 5) return null;
    const latest = num(quarterly[quarterly.length - 1]?.[field]);
    const yearAgo = num(quarterly[quarterly.length - 5]?.[field]);
    if (latest === null || yearAgo === null || yearAgo <= 0) return null;
    return ((latest - yearAgo) / yearAgo) * 100;
  };
  const summaryReturn = (label: string): number | null => {
    const rows = Array.isArray(data?.returnsSummary) ? data.returnsSummary : [];
    return num(rows.find((r: any) => r?.label === label)?.value);
  };

  const fromHigh = range ? range.fromHighPercent : null;
  const fromLow = range ? range.fromLowPercent : null;

  const CANDIDATES: Candidate[] = [
    // ── Valuation ──────────────────────────────────────────────────────
    { key: "pe", label: "P/E ratio", category: "Valuation", format: "ratio",
      about: "Price per rupee of trailing earnings.",
      compute: () => { const v = num(metrics.peRatio); return v !== null && v > 0 ? v : null; } },
    { key: "industry-pe", label: "Industry P/E", category: "Valuation", format: "ratio",
      about: "The sector's average earnings multiple.",
      compute: () => { const v = num(metrics.industryPe); return v !== null && v > 0 ? v : null; } },
    { key: "pe-vs-industry", label: "P/E vs industry", category: "Valuation", format: "percent",
      about: "Premium (+) or discount (−) to the sector multiple.",
      compute: () => { const pe = num(metrics.peRatio), ind = num(metrics.industryPe);
        return pe !== null && ind !== null && pe > 0 && ind > 0 ? ((pe - ind) / ind) * 100 : null; } },
    { key: "peg", label: "PEG ratio", category: "Valuation", format: "ratio",
      about: "P/E per unit of growth; under 1 is cheap growth.",
      compute: () => { const v = num(metrics.pegRatio); return v !== null && v > 0 ? v : null; } },
    { key: "pb", label: "P/B ratio", category: "Valuation", format: "ratio",
      about: "Price against book value per share.",
      compute: () => { const v = num(metrics.pbRatio); return v !== null && v > 0 ? v : null; } },
    { key: "ev-sales", label: "EV / Sales", category: "Valuation", format: "ratio",
      about: "Enterprise value per rupee of revenue.",
      compute: () => { const v = num(metrics.evToSales); return v !== null && v > 0 ? v : null; } },
    { key: "earnings-yield", label: "Earnings yield", category: "Valuation", format: "percent",
      about: "Inverse of P/E — earnings as a return on today's price.",
      compute: () => { const pe = num(metrics.peRatio); return pe !== null && pe > 0 ? 100 / pe : null; } },
    { key: "fcf-yield", label: "FCF yield", category: "Valuation", format: "percent",
      about: "Free cash flow against market value — hard to flatter by accounting.",
      compute: () => safe(() => freeCashFlowYield(financials, metrics.marketCap)) },
    { key: "market-cap", label: "Market cap", category: "Valuation", format: "crore",
      about: "What the market prices the whole company at.",
      compute: () => { const v = num(metrics.marketCap); return v !== null && v > 0 ? v : null; } },

    // ── Profitability ──────────────────────────────────────────────────
    { key: "roe", label: "Return on equity", category: "Profitability", format: "percent",
      about: "Profit earned on shareholders' capital.",
      compute: () => num(metrics.roe) },
    { key: "roce", label: "Return on capital employed", category: "Profitability", format: "percent",
      about: "Operating return on all long-term capital, debt included.",
      compute: () => num(metrics.roce) },
    { key: "roa", label: "Return on assets", category: "Profitability", format: "percent",
      about: "Profit per rupee of assets — hardest ratio to inflate with leverage.",
      compute: () => num(metrics.roa) },
    { key: "net-margin", label: "Net profit margin", category: "Profitability", format: "percent",
      about: "Share of revenue that survives to the bottom line.",
      compute: () => num(metrics.profitMargin) },
    { key: "ebitda-margin", label: "EBITDA margin", category: "Profitability", format: "percent",
      about: "Operating profitability before financing and depreciation choices.",
      compute: () => num(metrics.ebitdaMargin) },
    { key: "dupont-turnover", label: "Asset turnover (DuPont)", category: "Profitability", format: "ratio",
      about: "Revenue generated per rupee of assets.",
      compute: () => dupont?.assetTurnover ?? null },
    { key: "dupont-leverage", label: "Equity multiplier (DuPont)", category: "Profitability", format: "ratio",
      about: "How much of ROE comes from balance-sheet leverage.",
      compute: () => dupont?.equityMultiplier ?? null },
    { key: "dupont-driver", label: "Primary ROE driver", category: "Profitability", format: "text",
      about: "Which DuPont term contributes most: margin, turnover or leverage.",
      compute: () => dupont?.primaryDriver ?? null },
    { key: "cash-conversion", label: "Cash conversion", category: "Profitability", format: "ratio",
      about: "Operating cash flow per rupee of reported profit; below 1 means profit isn't arriving as cash.",
      compute: () => conversion?.ratio ?? null,
      tone: (v) => (v >= 1 ? "good" : v < 0.7 ? "bad" : undefined) },
    { key: "piotroski", label: "Piotroski F-Score", category: "Profitability", format: "text",
      about: "Pass/fail fundamental checks, year over year.",
      compute: () => (piotroski ? `${piotroski.score} of ${piotroski.testable}` : null) },
    { key: "margin-trend", label: "Net margin trend", category: "Profitability", format: "text",
      about: "Direction of the net margin across reported years.",
      compute: () => marginTrend?.direction ?? null },

    // ── Growth ─────────────────────────────────────────────────────────
    { key: "revenue-cagr", label: "Revenue CAGR", category: "Growth", format: "percent",
      about: "Compound revenue growth across the reported years.",
      compute: () => growth?.revenueCagr ?? null },
    { key: "profit-cagr", label: "Profit CAGR", category: "Growth", format: "percent",
      about: "Compound profit growth across the reported years.",
      compute: () => growth?.profitCagr ?? null },
    { key: "rev-yoy-q", label: "Quarterly revenue YoY", category: "Growth", format: "percent",
      about: "Latest quarter's revenue against the same quarter last year.",
      compute: () => quarterlyYoY("revenue") },
    { key: "profit-yoy-q", label: "Quarterly profit YoY", category: "Growth", format: "percent",
      about: "Latest quarter's profit against the same quarter last year.",
      compute: () => quarterlyYoY("profit") },
    { key: "growth-years", label: "Years of statements", category: "Growth", format: "number",
      about: "Reported annual periods behind the growth figures.",
      compute: () => (growth ? growth.years : null) },

    // ── Financial health ───────────────────────────────────────────────
    { key: "de", label: "Debt to equity", category: "Financial Health", format: "ratio",
      about: "Borrowed capital against shareholders' capital.",
      compute: () => num(metrics.debtToEquity),
      tone: (v) => (v <= 0.3 ? "good" : v >= 2 ? "bad" : undefined) },
    { key: "current-ratio", label: "Current ratio", category: "Financial Health", format: "ratio",
      about: "Short-term assets against short-term obligations.",
      compute: () => num(metrics.currentRatio),
      tone: (v) => (v < 1 ? "bad" : undefined) },
    { key: "interest-cover", label: "Interest coverage", category: "Financial Health", format: "ratio",
      about: "Times operating profit covers the interest bill.",
      compute: () => num(metrics.interestCoverage),
      tone: (v) => (v < 2 ? "bad" : v >= 8 ? "good" : undefined) },
    { key: "total-debt", label: "Total debt", category: "Financial Health", format: "crore",
      about: "Outstanding borrowings.",
      compute: () => num(metrics.totalDebt) },
    { key: "altman", label: "Altman Z-Score", category: "Financial Health", format: "ratio",
      about: "Composite distress score; under 1.81 is the historical distress zone. Not applicable to banks.",
      compute: () => quality?.altmanZ ?? null,
      tone: (v) => (v < 1.81 ? "bad" : v >= 3 ? "good" : undefined) },
    { key: "altman-zone", label: "Altman zone", category: "Financial Health", format: "text",
      about: "Safe, grey or distress, per the Z-Score bands.",
      compute: () => quality?.altmanZone ?? null },
    { key: "quality-checks", label: "Quality checks passed", category: "Financial Health", format: "text",
      about: "Rule-based fundamental checklist result.",
      compute: () => (quality && quality.total > 0 ? `${quality.passed} of ${quality.total}` : null) },
    { key: "red-flags", label: "Red flags", category: "Financial Health", format: "number",
      about: "Rule-based warnings raised by the checklist.",
      // Zero flags only means something once the checklist could actually run.
      // On an empty payload every check is skipped, and reporting "0 red
      // flags" there would print a clean bill of health from no information.
      compute: () => (quality && quality.total > 0 ? quality.redFlags.length : null),
      tone: (v) => (v === 0 ? "good" : v >= 3 ? "bad" : undefined) },
    { key: "debt-assets", label: "Debt to assets", category: "Financial Health", format: "percent",
      about: "Share of the balance sheet funded by debt, latest year.",
      compute: () => { const points = debtTrend?.points; return points?.length ? points[points.length - 1].value : null; } },
    { key: "debt-trend", label: "Leverage trend", category: "Financial Health", format: "text",
      about: "Direction of debt-to-assets across reported years.",
      compute: () => debtTrend?.direction ?? null },

    // ── Cash flow ──────────────────────────────────────────────────────
    { key: "ocf", label: "Operating cash flow", category: "Cash Flow", format: "crore",
      about: "Cash the operations actually produced, latest year.",
      compute: () => num(cashLatest?.operatingCashFlow) },
    { key: "fcf", label: "Free cash flow", category: "Cash Flow", format: "crore",
      about: "Operating cash left after capital spending.",
      compute: () => num(cashLatest?.freeCashFlow) },
    { key: "investing-cf", label: "Investing cash flow", category: "Cash Flow", format: "crore",
      about: "Cash into (−) or out of investments and capex.",
      compute: () => num(cashLatest?.investingCashFlow) },
    { key: "financing-cf", label: "Financing cash flow", category: "Cash Flow", format: "crore",
      about: "Net borrowings, buybacks and dividends.",
      compute: () => num(cashLatest?.financingCashFlow) },
    { key: "capex-proxy", label: "Capex (proxy)", category: "Cash Flow", format: "crore",
      about: "Operating minus free cash flow — what reinvestment consumed.",
      compute: () => { const o = num(cashLatest?.operatingCashFlow), f = num(cashLatest?.freeCashFlow);
        return o !== null && f !== null ? o - f : null; } },
    { key: "fcf-margin", label: "FCF margin", category: "Cash Flow", format: "percent",
      about: "Free cash flow as a share of revenue.",
      compute: () => { const f = num(cashLatest?.freeCashFlow);
        const rows = Array.isArray(financials.incomeStatement) ? [...financials.incomeStatement] : [];
        rows.sort((a: any, b: any) => String(b.period).localeCompare(String(a.period)));
        const rev = num(rows[0]?.revenue);
        return f !== null && rev !== null && rev > 0 ? (f / rev) * 100 : null; } },

    // ── Per share ──────────────────────────────────────────────────────
    { key: "eps", label: "Earnings per share", category: "Per Share", format: "rupees",
      about: "Trailing profit attributable to one share.",
      compute: () => num(metrics.eps) },
    { key: "book-value", label: "Book value per share", category: "Per Share", format: "rupees",
      about: "Net assets attributable to one share.",
      compute: () => num(metrics.bookValue) },
    { key: "face-value", label: "Face value", category: "Per Share", format: "rupees",
      about: "Nominal value a share is denominated in.",
      compute: () => num(metrics.faceValue) },
    { key: "shares-out", label: "Shares outstanding", category: "Per Share", format: "crore",
      about: "Total shares in issue.",
      compute: () => num(metrics.outstandingShares) },

    // ── Dividends ──────────────────────────────────────────────────────
    { key: "div-yield", label: "Dividend yield (TTM)", category: "Dividends", format: "share",
      about: "Last twelve months of dividends against today's price.",
      compute: () => dividends?.yieldPercent ?? null },
    { key: "div-ttm", label: "Dividends, last 12m", category: "Dividends", format: "rupees",
      about: "Per-share cash paid out over the trailing year.",
      compute: () => (dividends && dividends.trailingTwelveMonths > 0 ? dividends.trailingTwelveMonths : null) },
    { key: "div-streak", label: "Paying streak", category: "Dividends", format: "number",
      about: "Consecutive financial years with a payout.",
      compute: () => dividends?.consecutiveYears ?? null },
    { key: "div-years", label: "Years paid", category: "Dividends", format: "number",
      about: "Financial years with at least one dividend on record.",
      compute: () => dividends?.yearsPaid ?? null },
    { key: "div-growth", label: "Dividend growth", category: "Dividends", format: "percent",
      about: "Compound growth of the annual payout, complete years only.",
      compute: () => dividends?.growthCagrPercent ?? null },
    { key: "div-latest", label: "Latest payout", category: "Dividends", format: "rupees",
      about: "Most recent per-share dividend declared.",
      compute: () => dividends?.latestPayout?.amount ?? null },
    { key: "div-latest-date", label: "Latest ex-date", category: "Dividends", format: "text",
      about: "The date entitlement to the latest dividend was fixed.",
      compute: () => dividends?.latestPayout?.date ?? null },

    // ── Ownership ──────────────────────────────────────────────────────
    { key: "promoter-stake", label: "Promoter holding", category: "Ownership", format: "share",
      about: "Founders' and controlling shareholders' stake.",
      compute: () => promoters?.latest ?? null },
    { key: "promoter-change", label: "Promoter change (1Y)", category: "Ownership", format: "percent",
      about: "Points added or shed over the last four reported quarters.",
      compute: () => (promoters?.comparable ? promoters.changeOneYearPoints : null),
      tone: (v) => (v >= 1 ? "good" : v <= -1 ? "bad" : undefined) },
    { key: "fii-stake", label: "Foreign institutions", category: "Ownership", format: "share",
      about: "FII/FPI holding, latest reported quarter.",
      compute: () => ownership?.trends.find((t) => t.key === "fii")?.latest ?? null },
    { key: "dii-stake", label: "Domestic institutions", category: "Ownership", format: "share",
      about: "Mutual funds, insurers and banks, latest quarter.",
      compute: () => ownership?.trends.find((t) => t.key === "dii")?.latest ?? null },
    { key: "public-stake", label: "Public holding", category: "Ownership", format: "share",
      about: "Everyone else — the free float's retail component.",
      compute: () => ownership?.trends.find((t) => t.key === "public")?.latest ?? null },
    { key: "ownership-quarters", label: "Quarters on record", category: "Ownership", format: "number",
      about: "Shareholding filings behind the trend figures.",
      compute: () => ownership?.quarters ?? null },

    // ── Price & range ──────────────────────────────────────────────────
    { key: "cmp", label: "Current price", category: "Price & Range", format: "rupees",
      about: "Last traded price.",
      compute: () => { const v = num(price.cmp); return v !== null && v > 0 ? v : null; } },
    { key: "day-change", label: "Day change", category: "Price & Range", format: "percent",
      about: "Move against the previous close.",
      compute: () => num(price.changePercent) },
    { key: "52w-high", label: "52-week high", category: "Price & Range", format: "rupees",
      about: "Highest price of the last year.",
      compute: () => { const v = num(price.fiftyTwoWeekHigh); return v !== null && v > 0 ? v : null; } },
    { key: "52w-low", label: "52-week low", category: "Price & Range", format: "rupees",
      about: "Lowest price of the last year.",
      compute: () => { const v = num(price.fiftyTwoWeekLow); return v !== null && v > 0 ? v : null; } },
    { key: "from-high", label: "From 52-week high", category: "Price & Range", format: "percent",
      about: "Distance below the year's peak.",
      compute: () => fromHigh },
    { key: "from-low", label: "From 52-week low", category: "Price & Range", format: "share",
      about: "Distance above the year's floor.",
      compute: () => fromLow },
    { key: "range-pos", label: "Range position", category: "Price & Range", format: "share",
      about: "Where the price sits in its 52-week band; 100 is the top.",
      compute: () => range?.percent ?? null },

    // ── Returns ────────────────────────────────────────────────────────
    { key: "ret-1m", label: "1-month return", category: "Returns", format: "percent",
      about: "Point-to-point, last 21 trading days.",
      compute: () => summaryReturn("1 Month") },
    { key: "ret-6m", label: "6-month return", category: "Returns", format: "percent",
      about: "Point-to-point, last 126 trading days.",
      compute: () => summaryReturn("6 Months") },
    { key: "ret-1y", label: "1-year return", category: "Returns", format: "percent",
      about: "Point-to-point over a year.",
      compute: () => summaryReturn("1 Year") },
    { key: "ret-3y", label: "3-year return", category: "Returns", format: "percent",
      about: "Total over three years, not annualised.",
      compute: () => summaryReturn("3 Years") },
    { key: "ret-5y", label: "5-year return", category: "Returns", format: "percent",
      about: "Total over five years, not annualised.",
      compute: () => summaryReturn("5 Years") },
    { key: "price-cagr", label: "Price CAGR", category: "Returns", format: "percent",
      about: "Annualised over the full history available.",
      compute: () => safe(() => priceCagr(history)) },
    { key: "best-cal-year", label: "Best calendar year", category: "Returns", format: "percent",
      about: "Strongest complete year in the history.",
      compute: () => (completeYears.length ? Math.max(...completeYears.map((y) => y.percent)) : null) },
    { key: "worst-cal-year", label: "Worst calendar year", category: "Returns", format: "percent",
      about: "Weakest complete year in the history.",
      compute: () => (completeYears.length ? Math.min(...completeYears.map((y) => y.percent)) : null) },
    { key: "roll-1y-median", label: "Median 1Y hold", category: "Returns", format: "percent",
      about: "Median outcome across every 1-year entry point.",
      compute: () => oneYearRoll?.medianPercent ?? null },
    { key: "roll-1y-worst", label: "Worst 1Y hold", category: "Returns", format: "percent",
      about: "Worst outcome across every 1-year entry point.",
      compute: () => oneYearRoll?.worstPercent ?? null },
    { key: "roll-3y-beat-fd", label: "3Y holds beating FD", category: "Returns", format: "share",
      about: "Share of all 3-year entry points that beat a 7% deposit.",
      compute: () => threeYearRoll?.aboveBenchmarkPercent ?? null },
    { key: "positive-days", label: "Up days", category: "Returns", format: "share",
      about: "Share of sessions that closed higher.",
      compute: () => distribution?.positiveShare ?? null },

    // ── Risk ───────────────────────────────────────────────────────────
    { key: "volatility", label: "Annualised volatility", category: "Risk", format: "share",
      about: "Standard deviation of daily moves, scaled to a year.",
      compute: () => safe(() => annualisedVolatility(history)) },
    { key: "vol-regime", label: "Volatility regime", category: "Risk", format: "text",
      about: "Recent volatility against this stock's own baseline.",
      compute: () => regime?.regime ?? null },
    { key: "max-dd", label: "Max drawdown", category: "Risk", format: "percent",
      about: "Deepest peak-to-trough fall in the history.",
      compute: () => drawdown?.percent ?? null },
    { key: "dd-recovered", label: "Drawdown recovered", category: "Risk", format: "text",
      about: "Whether the old peak was regained afterwards.",
      compute: () => (drawdown ? (drawdown.recovered ? "yes" : "not yet") : null) },
    { key: "var-95", label: "1-day VaR (95%)", category: "Risk", format: "share",
      about: "Loss exceeded on roughly one day in twenty.",
      compute: () => downside?.valueAtRisk95 ?? null },
    { key: "shortfall-95", label: "Expected shortfall", category: "Risk", format: "share",
      about: "Average loss on the worst 5% of days.",
      compute: () => downside?.expectedShortfall95 ?? null },
    { key: "sortino", label: "Sortino ratio", category: "Risk", format: "ratio",
      about: "Excess return per unit of downside deviation.",
      compute: () => downside?.sortinoRatio ?? null },
    { key: "worst-day", label: "Worst single day", category: "Risk", format: "percent",
      about: "Sharpest one-day fall in the history.",
      compute: () => downside?.worstDayPercent ?? null },
    { key: "underwater-share", label: "Time underwater", category: "Risk", format: "share",
      about: "Share of the period spent below a previous high.",
      compute: () => underwater?.timeUnderwaterPercent ?? null },
    { key: "underwater-longest", label: "Longest underwater", category: "Risk", format: "days",
      about: "Longest stretch below a previous high.",
      compute: () => underwater?.longestUnderwaterDays ?? null },
    { key: "recovery-median", label: "Typical recovery", category: "Risk", format: "days",
      about: "Median days from trough back to the old peak.",
      compute: () => underwater?.medianRecoveryDays ?? null },

    // ── Technicals ─────────────────────────────────────────────────────
    { key: "rsi", label: "RSI (14)", category: "Technicals", format: "ratio",
      about: "Momentum oscillator; 70 overbought, 30 oversold by convention.",
      compute: () => rsiReading?.value ?? null },
    { key: "rsi-zone", label: "RSI zone", category: "Technicals", format: "text",
      about: "Conventional reading of the RSI level.",
      compute: () => rsiReading?.zone ?? null },
    { key: "macd-hist", label: "MACD histogram", category: "Technicals", format: "ratio",
      about: "Gap between MACD and its signal line.",
      compute: () => macdReading?.histogram ?? null },
    { key: "macd-cross", label: "MACD crossover", category: "Technicals", format: "text",
      about: "Which side of its signal line MACD sits.",
      compute: () => macdReading?.crossover ?? null },
    { key: "sma50", label: "50-day average", category: "Technicals", format: "rupees",
      about: "Mean close of the last 50 sessions.",
      compute: () => averages?.sma50 ?? null },
    { key: "sma200", label: "200-day average", category: "Technicals", format: "rupees",
      about: "Mean close of the last 200 sessions.",
      compute: () => averages?.sma200 ?? null },
    { key: "vs-sma50", label: "Price vs 50-day", category: "Technicals", format: "percent",
      about: "Distance from the short-term trend line.",
      compute: () => averages?.priceVsSma50Percent ?? null },
    { key: "vs-sma200", label: "Price vs 200-day", category: "Technicals", format: "percent",
      about: "Distance from the long-term trend line.",
      compute: () => averages?.priceVsSma200Percent ?? null },
    { key: "ma-cross", label: "Golden / death cross", category: "Technicals", format: "text",
      about: "50-day above the 200-day is golden; below is death.",
      compute: () => averages?.trend ?? null },
    { key: "boll-b", label: "Bollinger %B", category: "Technicals", format: "share",
      about: "Position in the volatility bands; 100 is the upper band.",
      compute: () => bands?.percentB ?? null },
    { key: "boll-width", label: "Band width", category: "Technicals", format: "percent",
      about: "Band spread as a share of the middle — a squeeze gauge.",
      compute: () => bands?.bandwidthPercent ?? null },
    { key: "rel-volume", label: "Relative volume", category: "Technicals", format: "ratio",
      about: "Latest volume against its 20-day average.",
      compute: () => volume?.relativeVolume ?? null },
    { key: "volume-trend", label: "Volume trend", category: "Technicals", format: "text",
      about: "20-day average volume against the 50-day.",
      compute: () => volume?.trend ?? null },
    { key: "pivot", label: "Pivot point", category: "Technicals", format: "rupees",
      about: "Classic floor-trader pivot from the last session.",
      compute: () => pivots?.pivot ?? null },
    { key: "support-1", label: "Support S1", category: "Technicals", format: "rupees",
      about: "First support level below the pivot.",
      compute: () => pivots?.support1 ?? null },
    { key: "resistance-1", label: "Resistance R1", category: "Technicals", format: "rupees",
      about: "First resistance level above the pivot.",
      compute: () => pivots?.resistance1 ?? null },
  ];

  const entries: MetricEntry[] = [];
  for (const candidate of CANDIDATES) {
    let value: number | string | null = null;
    try {
      value = candidate.compute();
    } catch {
      value = null;
    }
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;

    entries.push({
      key: candidate.key,
      label: candidate.label,
      category: candidate.category,
      value,
      format: candidate.format,
      about: candidate.about,
      ...(typeof value === "number" && candidate.tone ? { tone: candidate.tone(value) } : {}),
    });
  }

  const categories = [...new Set(entries.map((entry) => entry.category))];

  return { entries, available: entries.length, total: CANDIDATES.length, categories };
}

/** Today in IST, without importing the market-status module server-side. */
function todayKey(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Render a metric's value for display. Exported so the UI and tests agree. */
export function formatMetricValue(entry: MetricEntry): string {
  if (typeof entry.value === "string") return entry.value;
  const value = entry.value;
  switch (entry.format) {
    case "rupees":
      return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    case "crore":
      if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(2)} L Cr`;
      return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
    case "percent":
      return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
    case "share":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return value.toFixed(2);
    case "days":
      return value >= 365 ? `${(value / 365.25).toFixed(1)} yr` : `${Math.round(value)} d`;
    case "number":
      return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    default:
      return String(value);
  }
}
