/**
 * Adding to a position that is already working.
 *
 * Averaging DOWN gets all the warnings. Averaging UP gets almost none, and it
 * carries a subtler trap: adding at a higher price raises the blended cost,
 * which drags the breakeven up behind it. A position 20% in front can be
 * added to until it is only 8% in front, on exactly the same stock at exactly
 * the same price. Nothing was lost — but the cushion was spent.
 *
 * The arithmetic that matters here turns out to be linear, and pleasantly so.
 * Risk to a stop at S is:
 *
 *     Q0 x (P0 - S)  +  Qa x (Pa - S)
 *
 * — the old shares' exposure plus the new shares'. It never needs the blended
 * average at all. Two things follow:
 *
 *  - Once the stop sits ABOVE the original cost, the first term goes negative:
 *    the existing shares guarantee a profit, and that guarantee is budget the
 *    new shares can spend. This is why a trader with a stop above entry can
 *    often add far more than a fixed rupee risk limit would first suggest.
 *  - The maximum size that fits a risk limit solves exactly, with no search.
 *
 * Charges and tax are not modelled; the charges tool covers those.
 *
 * Pure and dependency-free.
 */

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const round4 = (value: number): number => roundTo(value, 10_000);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export type PyramidInput = {
  /** Shares already held. */
  quantity: number;
  /** Average price they were bought at. */
  buyPrice: number;
  /** Shares being added, at the current market price. */
  addQuantity: number;
  /** Price the addition is made at — also taken as the current market price. */
  addPrice: number;
  /** Where the stop sits for the combined position. */
  stopPrice: number;
  /** Optional rupee ceiling on what the combined position may risk. */
  riskLimit?: number;
};

export type PyramidResult = {
  newQuantity: number;
  blendedAverage: number;
  totalCost: number;
  /** Open profit before adding, in rupees. */
  openProfitBefore: number;
  /** Open profit after adding. Unchanged in rupees — only the base moves. */
  openProfitAfter: number;
  /** Profit as a percentage of cost, before adding. */
  openProfitPercentBefore: number;
  /** The same percentage after. Always lower, and this is the real cost. */
  openProfitPercentAfter: number;
  /**
   * Rupees lost if the stop is hit. Negative when the stop sits above the
   * blended average, meaning the position is locked into a profit.
   */
  riskAtStop: number;
  /** True when the stop guarantees a gain rather than capping a loss. */
  isProfitLocked: boolean;
  /**
   * Largest addition that keeps risk inside `riskLimit`. Null when no limit
   * was given; zero when the existing position already exceeds it.
   */
  maxSharesToAdd: number | null;
};

/**
 * What adding to a winning position does to it.
 *
 * The output people miss is `openProfitPercentAfter`. The rupee profit does
 * not change when shares are bought at the market price — nothing was sold
 * and nothing was lost — but the percentage falls, because the same profit is
 * now measured against a larger cost. That drop is precisely the cushion
 * being spent, and it is invisible if only the rupee figure is watched.
 *
 * `maxSharesToAdd` is solved rather than searched, from the linear risk
 * identity above. It is floored to a whole share, since rounding up would put
 * the position over the very limit the figure exists to respect.
 */
export function pyramidPosition(input: PyramidInput): PyramidResult | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, buyPrice, addQuantity, addPrice, stopPrice } = input;

  if (!isFinitePositive(quantity) || !isFinitePositive(buyPrice)) return null;
  if (!isFinitePositive(addQuantity) || !isFinitePositive(addPrice)) return null;
  if (!isFinitePositive(stopPrice)) return null;
  // Adding at or below the stop would be stopped out on arrival.
  if (stopPrice >= addPrice) return null;

  const newQuantity = quantity + addQuantity;
  const totalCost = quantity * buyPrice + addQuantity * addPrice;
  const blendedAverage = totalCost / newQuantity;

  // Rupee profit is unchanged by buying at the market — only the base moves.
  const openProfitBefore = quantity * (addPrice - buyPrice);
  const openProfitAfter = newQuantity * (addPrice - blendedAverage);

  // Linear in both legs; the blended average never enters.
  const riskAtStop = quantity * (buyPrice - stopPrice) + addQuantity * (addPrice - stopPrice);

  let maxSharesToAdd: number | null = null;
  if (isFinitePositive(input.riskLimit)) {
    const existingExposure = quantity * (buyPrice - stopPrice);
    const perShare = addPrice - stopPrice;
    const headroom = input.riskLimit - existingExposure;
    // Floored: rounding up would breach the limit this figure exists to hold.
    maxSharesToAdd = headroom <= 0 ? 0 : Math.floor(headroom / perShare);
  }

  const values = [blendedAverage, totalCost, openProfitBefore, openProfitAfter, riskAtStop];
  if (!values.every(Number.isFinite)) return null;

  return {
    newQuantity,
    blendedAverage: round4(blendedAverage),
    totalCost: round2(totalCost),
    openProfitBefore: round2(openProfitBefore),
    openProfitAfter: round2(openProfitAfter),
    openProfitPercentBefore: round2(
      ((addPrice - buyPrice) / buyPrice) * 100
    ),
    openProfitPercentAfter: round2(((addPrice - blendedAverage) / blendedAverage) * 100),
    riskAtStop: round2(riskAtStop),
    isProfitLocked: riskAtStop < 0,
    maxSharesToAdd,
  };
}
