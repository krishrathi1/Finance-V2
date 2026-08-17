/**
 * What a bonus, split, rights issue or buyback does to a holding.
 *
 * These confuse people more than any other part of Indian retail investing,
 * and the confusion is always the same shape: a corporate action changes the
 * *number* of shares and the *price per share* without, by itself, changing
 * what the position is worth. A 1:1 bonus doubles the share count and halves
 * the price. Nothing was gained. Yet the holding suddenly shows a 50% "loss"
 * against an unadjusted cost basis, and the chart shows a cliff.
 *
 * So every function here reports the unchanged total alongside the changed
 * per-share figures — not as a footnote, but because it is the fact that
 * makes the rest make sense.
 *
 * The exception is a rights issue, which genuinely does involve new money and
 * therefore genuinely does change the total. It is modelled separately for
 * that reason.
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

export type BonusInput = {
  quantity: number;
  buyPrice: number;
  /** The "N" in an N:M bonus — new shares granted. */
  bonusNew: number;
  /** The "M" in an N:M bonus — shares already held that qualify. */
  bonusHeld: number;
};

export type AdjustedHolding = {
  newQuantity: number;
  newAveragePrice: number;
  /** Unchanged by construction — the point of the whole card. */
  totalInvested: number;
  /** Extra shares received, for a bonus; zero for a split. */
  sharesReceived: number;
  /** What the market price becomes, if it adjusts perfectly. */
  adjustmentFactor: number;
};

/**
 * A bonus issue: free shares in a fixed ratio to those held.
 *
 * A 1:1 bonus grants one new share per share held, doubling the count and
 * halving both the market price and the cost basis. `totalInvested` is
 * returned precisely because it does not move — the single most useful thing
 * to show someone who has just watched their holding's price halve overnight.
 *
 * Fractional entitlements are floored: exchanges settle bonus shares in whole
 * units and pay cash in lieu of the fraction, so granting 3.5 shares would
 * describe something that does not happen.
 */
export function bonusIssue(input: BonusInput): AdjustedHolding | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, buyPrice, bonusNew, bonusHeld } = input;

  if (!isFinitePositive(quantity) || !isFinitePositive(buyPrice)) return null;
  if (!isFinitePositive(bonusNew) || !isFinitePositive(bonusHeld)) return null;

  const sharesReceived = Math.floor((quantity * bonusNew) / bonusHeld);
  const newQuantity = quantity + sharesReceived;
  const totalInvested = quantity * buyPrice;
  if (!Number.isFinite(totalInvested) || newQuantity <= 0) return null;

  return {
    newQuantity,
    newAveragePrice: round4(totalInvested / newQuantity),
    totalInvested: round2(totalInvested),
    sharesReceived,
    adjustmentFactor: round4(quantity / newQuantity),
  };
}

export type SplitInput = {
  quantity: number;
  buyPrice: number;
  /** Face value before the split. */
  oldFaceValue: number;
  /** Face value after. A 10 -> 1 split multiplies the share count by ten. */
  newFaceValue: number;
};

/**
 * A stock split: the same capital divided into more, smaller shares.
 *
 * Economically identical to a bonus in its effect on a holding — count up,
 * price down, total flat — but expressed in face values rather than a ratio,
 * because that is how Indian companies announce it ("face value split from
 * ₹10 to ₹1").
 *
 * Unlike a bonus, no new shares are "received": the existing ones are
 * subdivided. `sharesReceived` is therefore reported as zero, and the extra
 * count shows up in `newQuantity` alone.
 */
export function stockSplit(input: SplitInput): AdjustedHolding | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, buyPrice, oldFaceValue, newFaceValue } = input;

  if (!isFinitePositive(quantity) || !isFinitePositive(buyPrice)) return null;
  if (!isFinitePositive(oldFaceValue) || !isFinitePositive(newFaceValue)) return null;
  // A "split" to a larger face value is a reverse split, which is a different
  // action with different mechanics; refused rather than silently modelled.
  if (newFaceValue >= oldFaceValue) return null;

  const multiple = oldFaceValue / newFaceValue;
  const newQuantity = Math.floor(quantity * multiple);
  const totalInvested = quantity * buyPrice;
  if (!Number.isFinite(totalInvested) || newQuantity <= 0) return null;

  return {
    newQuantity,
    newAveragePrice: round4(totalInvested / newQuantity),
    totalInvested: round2(totalInvested),
    sharesReceived: 0,
    adjustmentFactor: round4(quantity / newQuantity),
  };
}

export type RightsInput = {
  quantity: number;
  buyPrice: number;
  /** The "N" in an N:M rights issue — shares offered. */
  rightsNew: number;
  /** The "M" — shares held that qualify. */
  rightsHeld: number;
  /** The discounted price at which the new shares are offered. */
  rightsPrice: number;
  /** Current market price, to judge whether the offer is worth taking. */
  marketPrice: number;
};

export type RightsOutcome = {
  entitlement: number;
  /** Fresh money required to take the whole entitlement. */
  costToSubscribe: number;
  quantityIfSubscribed: number;
  averagePriceIfSubscribed: number;
  /** Total invested after subscribing — this one genuinely rises. */
  totalInvestedIfSubscribed: number;
  /** Theoretical price after the issue, blending old and new shares. */
  theoreticalExRightsPrice: number;
  /** Value of the right itself: what the discount is worth per new share. */
  valuePerRight: number;
  /** False when the rights price is at or above the market price. */
  worthSubscribing: boolean;
};

/**
 * A rights issue: the option to buy more shares at a discount, in proportion
 * to what is already held.
 *
 * The one action here that involves new money, so it is the one where the
 * total invested genuinely changes. Two things decide whether to take it:
 *
 *  - **Is the offer actually a discount?** A rights price at or above the
 *    market price is not an opportunity — the shares can be bought more
 *    cheaply on the exchange, and `worthSubscribing` says so.
 *  - **What does declining cost?** After the issue the price drifts toward
 *    the theoretical ex-rights price, which is below the current market
 *    price. A holder who does not subscribe absorbs that drop without the
 *    discounted shares that offset it — the dilution is the cost of saying no.
 */
export function rightsIssue(input: RightsInput): RightsOutcome | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, buyPrice, rightsNew, rightsHeld, rightsPrice, marketPrice } = input;

  if (!isFinitePositive(quantity) || !isFinitePositive(buyPrice)) return null;
  if (!isFinitePositive(rightsNew) || !isFinitePositive(rightsHeld)) return null;
  if (!isFinitePositive(rightsPrice) || !isFinitePositive(marketPrice)) return null;

  const entitlement = Math.floor((quantity * rightsNew) / rightsHeld);
  const costToSubscribe = entitlement * rightsPrice;
  const existingCost = quantity * buyPrice;
  const quantityIfSubscribed = quantity + entitlement;
  const totalInvestedIfSubscribed = existingCost + costToSubscribe;

  if (!Number.isFinite(totalInvestedIfSubscribed) || quantityIfSubscribed <= 0) return null;

  // TERP blends the pre-issue market value with the money the new shares
  // bring in — the level the price is expected to settle at once the issue
  // completes.
  const theoreticalExRightsPrice =
    (quantity * marketPrice + entitlement * rightsPrice) / quantityIfSubscribed;

  return {
    entitlement,
    costToSubscribe: round2(costToSubscribe),
    quantityIfSubscribed,
    averagePriceIfSubscribed: round4(totalInvestedIfSubscribed / quantityIfSubscribed),
    totalInvestedIfSubscribed: round2(totalInvestedIfSubscribed),
    theoreticalExRightsPrice: round4(theoreticalExRightsPrice),
    valuePerRight: round4(Math.max(0, theoreticalExRightsPrice - rightsPrice)),
    worthSubscribing: rightsPrice < marketPrice,
  };
}

export type BuybackInput = {
  sharesHeld: number;
  buyPrice: number;
  buybackPrice: number;
  marketPrice: number;
  /** Share of tendered stock the company actually accepts, 0-100. */
  acceptanceRatioPercent: number;
};

export type BuybackOutcome = {
  sharesAccepted: number;
  /** Shares tendered but returned, still held afterwards. */
  sharesReturned: number;
  proceedsFromBuyback: number;
  /** Gain on the accepted shares, against their cost. */
  gainOnAccepted: number;
  /** Premium the buyback price carries over the market price, as a percent. */
  premiumPercent: number;
  /** Gain per share versus simply selling on the exchange today. */
  advantageOverSelling: number;
};

/**
 * A buyback tender: the company offers to repurchase shares above the market
 * price, but usually accepts only a fraction of what is tendered.
 *
 * The acceptance ratio is what people miss. A buyback at a 20% premium sounds
 * like a 20% gain, but if only 15% of tendered shares are accepted, the
 * premium applies to 15% of the position and the rest comes back — often into
 * a price that has drifted down now the buyback support is gone.
 *
 * Accepted shares are floored to whole units, since a company cannot buy back
 * a fraction of a share.
 */
export function buybackTender(input: BuybackInput): BuybackOutcome | null {
  if (!input || typeof input !== "object") return null;
  const { sharesHeld, buyPrice, buybackPrice, marketPrice, acceptanceRatioPercent } = input;

  if (!isFinitePositive(sharesHeld) || !isFinitePositive(buyPrice)) return null;
  if (!isFinitePositive(buybackPrice) || !isFinitePositive(marketPrice)) return null;
  if (
    !Number.isFinite(acceptanceRatioPercent) ||
    acceptanceRatioPercent < 0 ||
    acceptanceRatioPercent > 100
  ) {
    return null;
  }

  const sharesAccepted = Math.floor(sharesHeld * (acceptanceRatioPercent / 100));
  const sharesReturned = sharesHeld - sharesAccepted;
  const proceedsFromBuyback = sharesAccepted * buybackPrice;
  const gainOnAccepted = sharesAccepted * (buybackPrice - buyPrice);
  const advantageOverSelling = sharesAccepted * (buybackPrice - marketPrice);

  if (![proceedsFromBuyback, gainOnAccepted, advantageOverSelling].every(Number.isFinite)) {
    return null;
  }

  return {
    sharesAccepted,
    sharesReturned,
    proceedsFromBuyback: round2(proceedsFromBuyback),
    gainOnAccepted: round2(gainOnAccepted),
    premiumPercent: round2(((buybackPrice - marketPrice) / marketPrice) * 100),
    advantageOverSelling: round2(advantageOverSelling),
  };
}
