/**
 * Valuation, framed as a question about belief rather than a verdict.
 *
 * A forward DCF asks you for a growth rate and hands back a "fair value",
 * which is a number with false authority: change the growth assumption by two
 * points and the answer moves by a third. The assumption does all the work,
 * and printing a single rupee figure hides that.
 *
 * A REVERSE DCF turns it around. It takes the price the market is already
 * charging and solves for the growth rate that would justify it. The output
 * is not "this is worth ₹1,400" but "at ₹1,400 you are paying for 18% growth
 * for a decade" — which is a claim you can actually evaluate against what the
 * company has managed historically, and disagree with honestly.
 *
 * The earnings-yield comparison does the same job more crudely: it asks what
 * a rupee of price buys in earnings, against what the same rupee buys risk-free
 * in a government bond. In India that bond has yielded 6-7.5% for years, which
 * is a genuinely high bar — it is why an Indian P/E of 40 implies far more
 * about expected growth than an American one at the same multiple.
 *
 * Pure and dependency-free.
 */

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Growth rates outside this band describe something other than a business. */
const MIN_GROWTH = -0.99;
const MAX_GROWTH = 3;
const BISECTION_STEPS = 200;

export type EarningsYieldInput = {
  price: number;
  /** Earnings per share, trailing or forward — whichever the caller means. */
  eps: number;
  /** The risk-free comparison, typically the 10-year G-sec. */
  bondYieldPercent: number;
};

export type EarningsYieldGap = {
  earningsYieldPercent: number;
  peRatio: number;
  bondYieldPercent: number;
  /** Earnings yield less the bond yield, in percentage points. */
  gapPercent: number;
  /** True when a rupee of price buys more earnings here than in the bond. */
  beatsBond: boolean;
  /** The P/E at which the earnings yield would exactly match the bond. */
  peAtBondParity: number;
};

/**
 * What a rupee of share price buys in earnings, against a government bond.
 *
 * The comparison is deliberately crude and worth stating plainly: an earnings
 * yield is not income. The bond pays its coupon contractually; the earnings
 * belong to the company, which may reinvest them, waste them, or never
 * distribute them at all. What the comparison establishes is the hurdle —
 * equity has to out-grow the gap to have been worth the risk, and
 * `peAtBondParity` shows how far the multiple would have to fall for the two
 * to be level on today's earnings alone.
 */
export function earningsYieldGap(input: EarningsYieldInput): EarningsYieldGap | null {
  if (!input || typeof input !== "object") return null;
  const { price, eps, bondYieldPercent } = input;

  if (!isFinitePositive(price)) return null;
  // A loss-making company has no meaningful earnings yield to compare.
  if (!isFinitePositive(eps)) return null;
  if (!isFinitePositive(bondYieldPercent)) return null;

  const earningsYieldPercent = (eps / price) * 100;
  const peRatio = price / eps;
  if (!Number.isFinite(earningsYieldPercent) || !Number.isFinite(peRatio)) return null;

  // Derived from the rounded figures so the subtraction on screen reconciles.
  const roundedYield = round2(earningsYieldPercent);
  const roundedBond = round2(bondYieldPercent);

  return {
    earningsYieldPercent: roundedYield,
    peRatio: round2(peRatio),
    bondYieldPercent: roundedBond,
    gapPercent: round2(roundedYield - roundedBond),
    beatsBond: roundedYield > roundedBond,
    peAtBondParity: round2(100 / bondYieldPercent),
  };
}

export type DcfInput = {
  /** Current per-share cashflow or earnings the growth applies to. */
  cashflow: number;
  /** Annual growth through the explicit forecast period, as a percentage. */
  growthPercent: number;
  /** Required return — the rate future money is discounted at. */
  discountPercent: number;
  /** Perpetual growth after the forecast period. Must stay below the discount rate. */
  terminalGrowthPercent: number;
  /** Length of the explicit forecast, in years. */
  years: number;
};

/**
 * A two-stage discounted cashflow: explicit growth for N years, then a
 * perpetuity growing at the terminal rate.
 *
 * Exported mainly so the reverse solve below can be verified by round-trip —
 * value a known growth rate, feed the result back as a price, and the implied
 * growth must return the rate you started from. A forward DCF on its own is
 * the tool this module is sceptical of.
 *
 * The terminal rate must sit below the discount rate. At or above it the
 * perpetuity diverges: a business growing forever at least as fast as money
 * is discounted is worth infinity, which is a statement about the model
 * rather than about the business.
 */
export function dcfValue(input: DcfInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { cashflow, growthPercent, discountPercent, terminalGrowthPercent, years } = input;

  if (!isFinitePositive(cashflow)) return null;
  if (!Number.isFinite(growthPercent) || growthPercent / 100 <= MIN_GROWTH) return null;
  if (!isFinitePositive(discountPercent)) return null;
  if (!Number.isFinite(terminalGrowthPercent)) return null;
  if (!isFinitePositive(years) || years > 50) return null;
  if (terminalGrowthPercent >= discountPercent) return null;

  const value = discountedValue(
    cashflow,
    growthPercent / 100,
    discountPercent / 100,
    terminalGrowthPercent / 100,
    Math.round(years)
  );
  return Number.isFinite(value) ? round2(value) : null;
}

/** The unrounded core, shared by the forward and reverse paths. */
function discountedValue(
  cashflow: number,
  growth: number,
  discount: number,
  terminal: number,
  years: number
): number {
  let explicit = 0;
  let projected = cashflow;

  for (let year = 1; year <= years; year += 1) {
    projected *= 1 + growth;
    explicit += projected / Math.pow(1 + discount, year);
  }

  // Gordon growth on the final year's cashflow, discounted back.
  const terminalValue = (projected * (1 + terminal)) / (discount - terminal);
  return explicit + terminalValue / Math.pow(1 + discount, years);
}

export type ImpliedGrowthInput = {
  /** What the market is charging today. */
  price: number;
  cashflow: number;
  discountPercent: number;
  terminalGrowthPercent: number;
  years: number;
};

export type ImpliedGrowth = {
  /** The growth rate the current price already assumes. */
  impliedGrowthPercent: number;
  /** Value contributed by the explicit forecast years. */
  explicitValue: number;
  /** Value contributed by the terminal perpetuity. */
  terminalValue: number;
  /**
   * Share of the price resting on the terminal value. Above roughly 70% the
   * valuation depends more on the perpetuity assumption than on anything
   * forecastable.
   */
  terminalSharePercent: number;
};

/**
 * Solve for the growth rate that would justify today's price.
 *
 * Bisection rather than a closed form: the two-stage DCF has no clean inverse
 * in g, but it is strictly increasing in it — more growth always means more
 * value — so bisection converges reliably and without the derivative trouble
 * Newton's method runs into near the terminal-rate boundary.
 *
 * A price outside the bracket is refused rather than clamped. If not even 300%
 * annual growth justifies the price, or the price is below what a business in
 * near-total decline would be worth, then the answer is that the model does
 * not describe this situation — and reporting the bracket edge as though it
 * were a result would hide exactly that.
 *
 * `terminalSharePercent` is reported because it is the honest health warning
 * on any DCF. When most of the value sits in the perpetuity, the number is
 * driven by an assumption about the year 2050, not by the forecast.
 */
export function impliedGrowth(input: ImpliedGrowthInput): ImpliedGrowth | null {
  if (!input || typeof input !== "object") return null;
  const { price, cashflow, discountPercent, terminalGrowthPercent, years } = input;

  if (!isFinitePositive(price) || !isFinitePositive(cashflow)) return null;
  if (!isFinitePositive(discountPercent)) return null;
  if (!Number.isFinite(terminalGrowthPercent)) return null;
  if (!isFinitePositive(years) || years > 50) return null;
  if (terminalGrowthPercent >= discountPercent) return null;

  const discount = discountPercent / 100;
  const terminal = terminalGrowthPercent / 100;
  const forecastYears = Math.round(years);

  const valueAt = (growth: number): number =>
    discountedValue(cashflow, growth, discount, terminal, forecastYears);

  const low = valueAt(MIN_GROWTH);
  const high = valueAt(MAX_GROWTH);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  // Outside the bracket the model has nothing to say about this price.
  if (price < low || price > high) return null;

  let lo = MIN_GROWTH;
  let hi = MAX_GROWTH;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (valueAt(mid) < price) lo = mid;
    else hi = mid;
  }
  const growth = (lo + hi) / 2;

  // Re-decompose at the solved rate so the parts sum to the price.
  let explicit = 0;
  let projected = cashflow;
  for (let year = 1; year <= forecastYears; year += 1) {
    projected *= 1 + growth;
    explicit += projected / Math.pow(1 + discount, year);
  }
  const terminalPart =
    ((projected * (1 + terminal)) / (discount - terminal)) / Math.pow(1 + discount, forecastYears);

  const total = explicit + terminalPart;
  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    impliedGrowthPercent: round2(growth * 100),
    explicitValue: round2(explicit),
    terminalValue: round2(terminalPart),
    terminalSharePercent: round2((terminalPart / total) * 100),
  };
}
