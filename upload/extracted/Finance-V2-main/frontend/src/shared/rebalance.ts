/**
 * Rebalancing plan — the trades that would move a portfolio back to its target
 * shape.
 *
 * `portfolio-risk.ts` measures how concentrated a portfolio is. That diagnosis
 * on its own leaves the user with "your top position is 38%" and no next step,
 * because working out what to actually sell means solving for weights across
 * every holding at once. This does that arithmetic.
 *
 * Three constraints keep the output a plan someone would follow rather than a
 * theoretically optimal one they'd ignore:
 *
 *  - **Whole shares.** Indian equity does not trade in fractions, so a plan
 *    quoting 12.7 shares cannot be executed as written.
 *  - **A minimum trade size.** Rebalancing is not free — brokerage, STT and
 *    the bid-ask spread all take a cut, and a ₹200 trade to correct a 0.3%
 *    drift costs more than the drift. Small corrections are dropped.
 *  - **Trimming only what breaches the cap.** A plan that touches every
 *    position to reach perfect equal weight triggers capital-gains tax across
 *    the whole book; capping the outliers achieves most of the risk reduction
 *    for a fraction of the churn.
 *
 * Pure and dependency-free.
 */

export type RebalanceHolding = {
  symbol: string;
  companyName?: string;
  /** Units currently held. */
  quantity: number;
  /** Live price per unit. */
  price: number;
};

export type RebalanceTrade = {
  symbol: string;
  companyName?: string;
  action: "buy" | "sell";
  /** Whole units to trade. */
  quantity: number;
  price: number;
  /** Rupee value of the trade. */
  value: number;
  currentWeightPercent: number;
  targetWeightPercent: number;
  reason: string;
};

export type RebalancePlan = {
  strategy: RebalanceStrategy;
  trades: RebalanceTrade[];
  /** Total rupee value moved. */
  turnover: number;
  /** Share of the portfolio that changes hands, 0-100. */
  turnoverPercent: number;
  totalValue: number;
  /** Largest position weight before and after the plan. */
  topWeightBefore: number;
  topWeightAfter: number;
  /** Cash left over after the trades — sells rarely fund buys exactly. */
  residualCash: number;
  /** Positions already inside target that the plan deliberately leaves alone. */
  untouched: number;
};

export type RebalanceStrategy =
  /** Trim anything above `maxWeightPercent`, redeploy into the smallest holdings. */
  | "cap"
  /** Move every position toward an equal share of the portfolio. */
  | "equal";

export type RebalanceOptions = {
  strategy?: RebalanceStrategy;
  /** Only meaningful for the "cap" strategy. */
  maxWeightPercent?: number;
  /** Trades below this rupee value are not worth the costs. */
  minTradeValue?: number;
};

export const DEFAULT_MAX_WEIGHT_PERCENT = 20;
export const DEFAULT_MIN_TRADE_VALUE = 1_000;

type Position = {
  symbol: string;
  companyName?: string;
  quantity: number;
  price: number;
  value: number;
};

/**
 * Merge duplicate symbols and drop anything unpriced.
 *
 * Same reasoning as the concentration measure: tranches of one stock are one
 * position, and treating them separately would have the plan sell a holding it
 * thinks is small while the real exposure is several times that.
 */
function normalise(holdings: RebalanceHolding[]): Position[] {
  const merged = new Map<string, Position>();
  for (const holding of holdings) {
    const symbol = String(holding?.symbol ?? "").trim().toUpperCase();
    const quantity = Number(holding?.quantity);
    const price = Number(holding?.price);
    if (!symbol) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(price) || price <= 0) continue;

    const existing = merged.get(symbol);
    if (existing) {
      existing.quantity += quantity;
      existing.value = existing.quantity * price;
      // A later tranche's price is as good as an earlier one; both are the
      // same live quote in practice.
      existing.price = price;
    } else {
      merged.set(symbol, {
        symbol,
        companyName: holding.companyName,
        quantity,
        price,
        value: quantity * price,
      });
    }
  }
  return [...merged.values()];
}

/**
 * Build the trade list that moves a portfolio toward its target weights.
 *
 * Returns null when there is nothing to plan against — fewer than two priced
 * positions, or no value. A "rebalance" of one holding is a liquidation
 * decision, not an allocation one.
 */
export function rebalancePlan(
  holdings: RebalanceHolding[] | null | undefined,
  options: RebalanceOptions = {}
): RebalancePlan | null {
  const positions = normalise(Array.isArray(holdings) ? holdings : []);
  if (positions.length < 2) return null;

  const totalValue = positions.reduce((sum, position) => sum + position.value, 0);
  if (!(totalValue > 0)) return null;

  const strategy: RebalanceStrategy = options.strategy === "equal" ? "equal" : "cap";
  const minTradeValue = Number.isFinite(options.minTradeValue as number)
    ? Math.max(0, options.minTradeValue as number)
    : DEFAULT_MIN_TRADE_VALUE;

  // The cap can never be below an equal share, or every position breaches it
  // and the "plan" is to sell the entire portfolio.
  const equalWeight = 100 / positions.length;
  const requestedCap = Number.isFinite(options.maxWeightPercent as number)
    ? (options.maxWeightPercent as number)
    : DEFAULT_MAX_WEIGHT_PERCENT;
  const maxWeightPercent = Math.max(equalWeight, Math.min(100, requestedCap));

  const targetWeightOf = (position: Position): number => {
    if (strategy === "equal") return equalWeight;
    const currentWeight = (position.value / totalValue) * 100;
    // Under the cap, a position is already where it should be. Naming its own
    // weight as the target is what keeps it out of the trade list.
    return currentWeight > maxWeightPercent ? maxWeightPercent : currentWeight;
  };

  const trades: RebalanceTrade[] = [];
  let untouched = 0;

  for (const position of positions) {
    const currentWeightPercent = (position.value / totalValue) * 100;
    const targetWeightPercent = targetWeightOf(position);
    const targetValue = (targetWeightPercent / 100) * totalValue;
    const delta = targetValue - position.value;

    if (Math.abs(delta) < minTradeValue) {
      untouched += 1;
      continue;
    }

    // Whole shares only, and always rounded *toward* the current position so a
    // rounding step never overshoots the target and creates the opposite
    // imbalance.
    const rawQuantity = Math.abs(delta) / position.price;
    const quantity = Math.floor(rawQuantity);
    if (quantity < 1) {
      untouched += 1;
      continue;
    }

    const value = quantity * position.price;
    if (value < minTradeValue) {
      untouched += 1;
      continue;
    }

    // Never sell more units than are held.
    const action: RebalanceTrade["action"] = delta < 0 ? "sell" : "buy";
    const bounded = action === "sell" ? Math.min(quantity, Math.floor(position.quantity)) : quantity;
    if (bounded < 1) {
      untouched += 1;
      continue;
    }

    trades.push({
      symbol: position.symbol,
      companyName: position.companyName,
      action,
      quantity: bounded,
      price: position.price,
      value: bounded * position.price,
      currentWeightPercent,
      targetWeightPercent,
      reason:
        action === "sell"
          ? strategy === "cap"
            ? `Above the ${maxWeightPercent.toFixed(0)}% cap at ${currentWeightPercent.toFixed(1)}%`
            : `Overweight at ${currentWeightPercent.toFixed(1)}% versus ${equalWeight.toFixed(1)}%`
          : `Underweight at ${currentWeightPercent.toFixed(1)}% versus ${targetWeightPercent.toFixed(1)}%`,
    });
  }

  // Largest trades first: they carry most of the risk reduction, so a user who
  // only does the top one or two still gets most of the benefit.
  trades.sort((a, b) => b.value - a.value);

  const sold = trades
    .filter((trade) => trade.action === "sell")
    .reduce((sum, trade) => sum + trade.value, 0);
  const bought = trades
    .filter((trade) => trade.action === "buy")
    .reduce((sum, trade) => sum + trade.value, 0);
  const turnover = sold + bought;

  const topWeightBefore = Math.max(
    ...positions.map((position) => (position.value / totalValue) * 100)
  );

  // Recompute weights from the post-trade values rather than assuming the
  // targets were hit — whole-share rounding and the minimum trade size both
  // leave positions short of their target, and reporting the target as the
  // outcome would overstate what the plan achieves.
  const afterValues = new Map(positions.map((position) => [position.symbol, position.value]));
  for (const trade of trades) {
    const current = afterValues.get(trade.symbol) ?? 0;
    afterValues.set(trade.symbol, current + (trade.action === "sell" ? -trade.value : trade.value));
  }
  const afterTotal = [...afterValues.values()].reduce((sum, value) => sum + value, 0);
  const topWeightAfter =
    afterTotal > 0 ? Math.max(...[...afterValues.values()].map((value) => (value / afterTotal) * 100)) : 0;

  return {
    strategy,
    trades,
    turnover,
    turnoverPercent: (turnover / totalValue) * 100,
    totalValue,
    topWeightBefore,
    topWeightAfter,
    residualCash: sold - bought,
    untouched,
  };
}
