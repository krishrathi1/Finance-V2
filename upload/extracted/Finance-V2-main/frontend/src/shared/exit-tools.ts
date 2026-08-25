/**
 * Getting out of a position, which gets far less arithmetic than getting in.
 *
 * Two questions traders ask constantly and usually answer by feel:
 *
 *  - **"I booked half — what does the rest cost me now?"** Selling part of a
 *    position returns cash against the original outlay, so the shares still
 *    held carry a lower effective cost. Sell enough and that cost goes to
 *    zero or below, which is where the phrase "free position" comes from.
 *  - **"Where is my trailing stop, and is it actually protecting a profit?"**
 *    A trailing stop set at entry does not protect anything until the price
 *    has risen far enough for the trail to clear the entry price, and the gap
 *    between those two is much wider than people expect.
 *
 * Neither function models brokerage, STT or tax. Those are real and are
 * handled by the charges and capital-gains tools; folding them in here would
 * conflate two separate questions.
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

export type PartialExitInput = {
  quantity: number;
  buyPrice: number;
  sellQuantity: number;
  sellPrice: number;
};

export type PartialExit = {
  remainingQuantity: number;
  proceeds: number;
  realisedGain: number;
  /** Everything originally paid for the whole position. */
  originalCost: number;
  /**
   * Original cost less the proceeds — what the shares still held have cost
   * on balance. Goes negative once the sale has returned more than the whole
   * position cost.
   */
  netCostOfRemainder: number;
  /** That net cost spread over the shares still held. May be negative. */
  effectiveCostPerShare: number;
  /** True once the sale has returned the entire original outlay. */
  isFreePosition: boolean;
  /**
   * Shares that must be sold at this price to recover the whole original
   * cost. Null when the price is too low for any quantity to manage it.
   */
  sharesToSellForFree: number | null;
};

/**
 * What a partial sale does to the cost of the shares still held.
 *
 * `sharesToSellForFree` is the output people actually want — "sell 67 of your
 * 100 at this price and the other 33 have cost you nothing" — and it is
 * rounded UP, because selling the floor of that figure leaves the cost
 * fractionally unrecovered and the answer wrong in the direction that
 * matters.
 *
 * Selling the entire position is refused rather than modelled: the question
 * this answers is what the REMAINDER costs, and with no remainder there is
 * nothing to answer. A full exit is a realised gain, which the capital-gains
 * tool covers properly including tax.
 *
 * A word on "free": the phrase describes the cost basis, not the risk. Shares
 * held at a zero effective cost still carry their full market value, and that
 * value can still be lost. Nothing here is protected by having been paid for.
 */
export function partialExit(input: PartialExitInput): PartialExit | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, buyPrice, sellQuantity, sellPrice } = input;

  if (!isFinitePositive(quantity) || !isFinitePositive(buyPrice)) return null;
  if (!isFinitePositive(sellQuantity) || !isFinitePositive(sellPrice)) return null;
  // A partial exit that sells everything is a full exit.
  if (sellQuantity >= quantity) return null;

  const remainingQuantity = quantity - sellQuantity;
  const originalCost = round2(quantity * buyPrice);
  const proceeds = round2(sellQuantity * sellPrice);
  const costOfSold = round2(sellQuantity * buyPrice);

  // Derived from the rounded figures, so a reader subtracting the printed
  // numbers gets the printed answer.
  const realisedGain = round2(proceeds - costOfSold);
  const netCostOfRemainder = round2(originalCost - proceeds);

  if (![originalCost, proceeds, realisedGain, netCostOfRemainder].every(Number.isFinite)) {
    return null;
  }

  // Rounded up: selling one share fewer leaves the cost unrecovered.
  const requiredShares = Math.ceil(originalCost / sellPrice);
  const sharesToSellForFree =
    Number.isFinite(requiredShares) && requiredShares <= quantity ? requiredShares : null;

  return {
    remainingQuantity,
    proceeds,
    realisedGain,
    originalCost,
    netCostOfRemainder,
    effectiveCostPerShare: round2(netCostOfRemainder / remainingQuantity),
    isFreePosition: netCostOfRemainder <= 0,
    sharesToSellForFree,
  };
}

export type TrailingStopInput = {
  entryPrice: number;
  /** How far the stop trails below the peak, as a percentage. */
  trailPercent: number;
  /** Highest price reached since entry. */
  highestPrice: number;
  currentPrice: number;
};

export type TrailingStop = {
  /** Where the stop currently sits. */
  stopPrice: number;
  /** Peak actually used, which is never below the entry price. */
  peakUsed: number;
  distanceToStop: number;
  distancePercent: number;
  /** Profit per share the stop would secure. Negative while below entry. */
  lockedInGain: number;
  /** True once the stop has climbed above the entry price. */
  isProfitLocked: boolean;
  /** What the stop hands back from the peak if it triggers. */
  giveBackFromPeak: number;
  /**
   * The peak the price must reach before the trailing stop first covers the
   * entry price — the point from which the trade can no longer lose.
   */
  breakEvenPeak: number;
  /** True when the current price is already at or below the stop. */
  alreadyTriggered: boolean;
};

/**
 * Where a trailing stop sits, and whether it is protecting anything yet.
 *
 * The output that surprises people is `breakEvenPeak`. A 10% trail does not
 * reach breakeven when the price is 10% up — it reaches it at
 * `entry / 0.9`, which is 11.1% up, because the trail is measured down from
 * the peak rather than up from the entry. The wider the trail, the wider that
 * gap: a 25% trail needs a 33.3% rise before the stop clears entry.
 *
 * The peak is clamped to the entry price. A trailing stop trails the highest
 * price reached SINCE ENTRY, and for a position that only ever fell, that
 * high is the entry itself — taking a lower figure at face value would place
 * the stop further down than any real trailing order would sit.
 */
export function trailingStop(input: TrailingStopInput): TrailingStop | null {
  if (!input || typeof input !== "object") return null;
  const { entryPrice, trailPercent, highestPrice, currentPrice } = input;

  if (!isFinitePositive(entryPrice) || !isFinitePositive(currentPrice)) return null;
  if (!isFinitePositive(highestPrice)) return null;
  if (!isFinitePositive(trailPercent) || trailPercent >= 100) return null;

  // The high since entry can never be below entry itself.
  const peakUsed = Math.max(highestPrice, entryPrice);
  const stopPrice = round2(peakUsed * (1 - trailPercent / 100));
  if (!Number.isFinite(stopPrice)) return null;

  const distanceToStop = round2(currentPrice - stopPrice);
  const breakEvenPeak = round2(entryPrice / (1 - trailPercent / 100));

  return {
    stopPrice,
    peakUsed: round2(peakUsed),
    distanceToStop,
    distancePercent: round2((distanceToStop / currentPrice) * 100),
    lockedInGain: round2(stopPrice - entryPrice),
    isProfitLocked: stopPrice > entryPrice,
    giveBackFromPeak: round2(peakUsed - stopPrice),
    breakEvenPeak,
    alreadyTriggered: currentPrice <= stopPrice,
  };
}
