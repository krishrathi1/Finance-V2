/**
 * Realised-return maths for the portfolio ledger.
 *
 * Pure and dependency-free, and deliberately in `shared/` rather than
 * `server/domain/`: the portfolio page renders these numbers directly, so
 * client and server must compute them from the same code. Two people looking
 * at "realised P&L" in the UI and in a data export getting different answers
 * would be worse than not showing it.
 *
 * Nothing here rounds for display — callers format. Rounding mid-calculation
 * is how a set of individually plausible rows stops summing to the total.
 */

export type TransactionSide = "buy" | "sell";

export type Transaction = {
  id: string;
  symbol: string;
  companyName?: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  /** Brokerage, STT, stamp duty — whatever the user chose to record. */
  fees: number;
  /** ISO calendar date, "YYYY-MM-DD". */
  tradedOn: string;
  notes?: string;
};

/** One sale matched against one earlier purchase. */
export type RealisedLot = {
  symbol: string;
  companyName?: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  buyDate: string;
  sellDate: string;
  /** Cost of the matched units, including the buy fee apportioned to them. */
  costBasis: number;
  /** Sale value of the matched units, net of the apportioned sell fee. */
  proceeds: number;
  realisedPnl: number;
  realisedPnlPercent: number;
  holdingDays: number;
  term: "short" | "long";
};

export type RealisedSummary = {
  lots: RealisedLot[];
  totalRealisedPnl: number;
  totalCostBasis: number;
  totalProceeds: number;
  shortTermPnl: number;
  longTermPnl: number;
  /**
   * Units sold with no earlier purchase to match against — the ledger says
   * they sold more than they ever bought. Surfaced rather than swallowed so
   * the UI can tell the user their history is incomplete instead of quietly
   * under-reporting their gains.
   */
  unmatchedSellQuantity: number;
};

/**
 * Listed Indian equity is long-term past 12 months of holding. Kept as a named
 * constant because the threshold is a tax rule, not an arbitrary number, and
 * it has moved before.
 */
export const LONG_TERM_HOLDING_DAYS = 365;

const QUANTITY_EPSILON = 1e-9;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcTime(isoDate: string): number {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/** Whole days between two ISO dates. Negative if `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  const start = toUtcTime(from);
  const end = toUtcTime(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / MS_PER_DAY);
}

function isUsable(transaction: Transaction): boolean {
  return (
    Number.isFinite(transaction.quantity) &&
    transaction.quantity > 0 &&
    Number.isFinite(transaction.price) &&
    transaction.price >= 0 &&
    !Number.isNaN(toUtcTime(transaction.tradedOn))
  );
}

/**
 * Order a symbol's trades for matching.
 *
 * Trade date first; ties broken by the order they appear in the input, which
 * preserves the sequence the user entered them. A same-day buy and sell would
 * otherwise match in whichever order the array happened to arrive in, making
 * realised P&L depend on storage ordering rather than on the trades.
 */
function chronologically(transactions: Transaction[]): Transaction[] {
  return transactions
    .map((transaction, index) => ({ transaction, index }))
    .sort((a, b) => {
      const dateDelta = toUtcTime(a.transaction.tradedOn) - toUtcTime(b.transaction.tradedOn);
      if (dateDelta !== 0) return dateDelta;
      return a.index - b.index;
    })
    .map((entry) => entry.transaction);
}

type OpenLot = {
  quantity: number;
  price: number;
  date: string;
  /** Buy-side fee attributable to a single unit of this lot. */
  feePerUnit: number;
  companyName?: string;
};

/**
 * Match sales against purchases first-in-first-out, per symbol.
 *
 * FIFO isn't just a convention here — it's the method Indian capital-gains
 * rules prescribe for listed equity, so the realised figures line up with what
 * the user will actually be assessed on.
 *
 * Fees are apportioned to the units they cover: a buy fee spreads across that
 * lot's units, and a sell fee spreads across the units in that sale. Charging
 * either fee wholly to the first matched lot would misstate every individual
 * row while still totalling correctly, which is the most confusing failure
 * mode available.
 */
export function matchFifo(transactions: Transaction[]): RealisedSummary {
  const bySymbol = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (!isUsable(transaction)) continue;
    const symbol = transaction.symbol.toUpperCase();
    const existing = bySymbol.get(symbol);
    if (existing) existing.push(transaction);
    else bySymbol.set(symbol, [transaction]);
  }

  const lots: RealisedLot[] = [];
  let unmatchedSellQuantity = 0;

  for (const [symbol, symbolTransactions] of bySymbol) {
    const open: OpenLot[] = [];

    for (const transaction of chronologically(symbolTransactions)) {
      if (transaction.side === "buy") {
        open.push({
          quantity: transaction.quantity,
          price: transaction.price,
          date: transaction.tradedOn,
          feePerUnit: (Number.isFinite(transaction.fees) ? transaction.fees : 0) / transaction.quantity,
          companyName: transaction.companyName,
        });
        continue;
      }

      let remaining = transaction.quantity;
      const sellFeePerUnit =
        (Number.isFinite(transaction.fees) ? transaction.fees : 0) / transaction.quantity;

      while (remaining > QUANTITY_EPSILON && open.length > 0) {
        const lot = open[0];
        const matched = Math.min(remaining, lot.quantity);

        const costBasis = matched * (lot.price + lot.feePerUnit);
        const proceeds = matched * (transaction.price - sellFeePerUnit);
        const realisedPnl = proceeds - costBasis;
        const holdingDays = daysBetween(lot.date, transaction.tradedOn);

        lots.push({
          symbol,
          companyName: transaction.companyName || lot.companyName,
          quantity: matched,
          buyPrice: lot.price,
          sellPrice: transaction.price,
          buyDate: lot.date,
          sellDate: transaction.tradedOn,
          costBasis,
          proceeds,
          realisedPnl,
          realisedPnlPercent: costBasis > 0 ? (realisedPnl / costBasis) * 100 : 0,
          holdingDays,
          term: holdingDays > LONG_TERM_HOLDING_DAYS ? "long" : "short",
        });

        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= QUANTITY_EPSILON) open.shift();
      }

      if (remaining > QUANTITY_EPSILON) unmatchedSellQuantity += remaining;
    }
  }

  // Newest sale first — the view users want by default is "what did I just do".
  lots.sort((a, b) => toUtcTime(b.sellDate) - toUtcTime(a.sellDate));

  let totalRealisedPnl = 0;
  let totalCostBasis = 0;
  let totalProceeds = 0;
  let shortTermPnl = 0;
  let longTermPnl = 0;

  for (const lot of lots) {
    totalRealisedPnl += lot.realisedPnl;
    totalCostBasis += lot.costBasis;
    totalProceeds += lot.proceeds;
    if (lot.term === "long") longTermPnl += lot.realisedPnl;
    else shortTermPnl += lot.realisedPnl;
  }

  return {
    lots,
    totalRealisedPnl,
    totalCostBasis,
    totalProceeds,
    shortTermPnl,
    longTermPnl,
    unmatchedSellQuantity,
  };
}

// ---------------------------------------------------------------------------
// XIRR
// ---------------------------------------------------------------------------

export type CashFlow = {
  /** ISO calendar date, "YYYY-MM-DD". */
  date: string;
  /** Negative for money paid in (buys), positive for money received (sells). */
  amount: number;
};

const XIRR_MAX_ITERATIONS = 100;
const XIRR_TOLERANCE = 1e-7;
/** Rates at or below -100% are meaningless and make the discount term explode. */
const XIRR_MIN_RATE = -0.9999;
/**
 * Starting upper bracket. Deliberately modest, because it is *expanded* rather
 * than trusted — see `bracketHigh`. A fixed ceiling here is a trap: annualising
 * a large gain earned over a few weeks produces an astronomically large rate
 * (doubling in a week annualises to ~10^15), so any constant cap silently
 * fails to bracket the root for exactly the positions users are most pleased
 * about.
 */
const XIRR_INITIAL_MAX_RATE = 1e6;
/** Hard stop for the expansion, past which the answer is numerically junk. */
const XIRR_ABSOLUTE_MAX_RATE = 1e18;
/**
 * Below this span, an annualised rate is arithmetic noise rather than
 * information — a 3% gain over two days annualises to roughly 24,000%. XIRR is
 * withheld until the history is long enough for the number to mean something.
 */
const XIRR_MIN_SPAN_DAYS = 30;

function netPresentValue(flows: CashFlow[], rate: number, epoch: string): number {
  let total = 0;
  for (const flow of flows) {
    const years = daysBetween(epoch, flow.date) / 365;
    total += flow.amount / Math.pow(1 + rate, years);
  }
  return total;
}

/**
 * Money-weighted annualised return (the spreadsheet XIRR).
 *
 * This is the honest headline number for a portfolio built up over time:
 * simple "current value vs invested" ignores *when* money went in, so a
 * position bought last week and one held three years look identical at the
 * same percentage gain. XIRR does not.
 *
 * Returns null rather than a number when the answer would be meaningless —
 * fewer than two flows, all flows the same sign (money only ever went one way,
 * so there is no return to solve for), or a history too short to annualise.
 * Callers hide the metric in that case instead of showing a confident 0%.
 *
 * Solved by bisection. Newton-Raphson converges faster but diverges on the
 * irregular, sign-alternating flows a real trading history produces, and a
 * silently wrong rate is worse than a few extra iterations.
 */
export function xirr(cashFlows: CashFlow[]): number | null {
  const flows = cashFlows.filter(
    (flow) => Number.isFinite(flow.amount) && flow.amount !== 0 && !Number.isNaN(toUtcTime(flow.date))
  );
  if (flows.length < 2) return null;

  const hasInflow = flows.some((flow) => flow.amount > 0);
  const hasOutflow = flows.some((flow) => flow.amount < 0);
  if (!hasInflow || !hasOutflow) return null;

  const epoch = flows.reduce(
    (earliest, flow) => (toUtcTime(flow.date) < toUtcTime(earliest) ? flow.date : earliest),
    flows[0].date
  );

  const latest = flows.reduce(
    (newest, flow) => (toUtcTime(flow.date) > toUtcTime(newest) ? flow.date : newest),
    flows[0].date
  );
  if (daysBetween(epoch, latest) < XIRR_MIN_SPAN_DAYS) return null;

  let low = XIRR_MIN_RATE;
  let npvLow = netPresentValue(flows, low, epoch);
  if (!Number.isFinite(npvLow)) return null;

  // Widen the upper bracket until it straddles the root instead of assuming a
  // single ceiling covers every history. Without this, a position that gained
  // sharply over a short window has its true rate sitting outside the bracket,
  // no sign change is detected, and a perfectly well-defined XIRR is reported
  // as "not computable" — the metric vanishing precisely when it is largest.
  let high = XIRR_INITIAL_MAX_RATE;
  let npvHigh = netPresentValue(flows, high, epoch);
  while (Number.isFinite(npvHigh) && npvLow * npvHigh > 0 && high < XIRR_ABSOLUTE_MAX_RATE) {
    high *= 1e3;
    npvHigh = netPresentValue(flows, high, epoch);
  }

  // No sign change even across the widened bracket means no root to find.
  if (!Number.isFinite(npvHigh)) return null;
  if (npvLow * npvHigh > 0) return null;

  for (let iteration = 0; iteration < XIRR_MAX_ITERATIONS; iteration += 1) {
    const mid = (low + high) / 2;
    const npvMid = netPresentValue(flows, mid, epoch);
    if (!Number.isFinite(npvMid)) return null;
    if (Math.abs(npvMid) < XIRR_TOLERANCE || (high - low) / 2 < XIRR_TOLERANCE) return mid;
    if (npvMid * npvLow < 0) {
      high = mid;
      npvHigh = npvMid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return (low + high) / 2;
}

/**
 * Build the cash-flow series for a whole portfolio.
 *
 * Open positions are represented as a single closing inflow at `asOf` — the
 * money you'd get if you sold everything today. Without that terminal flow the
 * series only contains money spent and XIRR would describe a portfolio that
 * was bought and never valued.
 */
export function portfolioCashFlows(
  transactions: Transaction[],
  currentValue: number,
  asOf: string
): CashFlow[] {
  const flows: CashFlow[] = [];

  for (const transaction of transactions) {
    if (!isUsable(transaction)) continue;
    const fees = Number.isFinite(transaction.fees) ? transaction.fees : 0;
    const gross = transaction.quantity * transaction.price;
    flows.push({
      date: transaction.tradedOn,
      // Fees always reduce what you end up with, on both sides of a trade.
      amount: transaction.side === "buy" ? -(gross + fees) : gross - fees,
    });
  }

  if (Number.isFinite(currentValue) && currentValue > 0) {
    flows.push({ date: asOf, amount: currentValue });
  }

  return flows;
}
