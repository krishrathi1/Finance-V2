/**
 * Vertical spreads: two options, same expiry, different strikes.
 *
 * The first structure most traders move to after buying a naked option, and
 * the one that most repays being costed properly before it is placed. Every
 * vertical has a hard ceiling on profit AND a hard floor on loss, both known
 * the moment it is opened, which is exactly what a naked option does not
 * offer. The trade-off is that the ceiling is often much closer than people
 * assume once the premium paid is netted off.
 *
 * All four verticals are modelled here:
 *
 *  - **Bull call** (debit) — buy the lower call, sell the higher. Pays if the
 *    underlying rises.
 *  - **Bear put** (debit) — buy the higher put, sell the lower. Pays if it falls.
 *  - **Bull put** (credit) — sell the higher put, buy the lower. Pays if it
 *    rises, stays flat, or falls only slightly.
 *  - **Bear call** (credit) — sell the lower call, buy the higher. Pays if it
 *    falls, stays flat, or rises only slightly.
 *
 * The credit spreads are the ones that get people into trouble, because the
 * money arrives up front and the risk is the larger of the two numbers. A
 * bull put collecting ₹20 on a ₹100-wide spread risks ₹80 to make ₹20, and
 * this reports that ratio rather than the credit alone.
 *
 * Brokerage, STT and the margin actually blocked by the exchange are not
 * modelled — the charges tool covers those.
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

export type SpreadType = "bull-call" | "bear-put" | "bull-put" | "bear-call";

/** The two debit spreads pay premium out; the two credit spreads take it in. */
export const DEBIT_SPREADS: readonly SpreadType[] = ["bull-call", "bear-put"];

export type VerticalSpreadInput = {
  type: SpreadType;
  lowerStrike: number;
  upperStrike: number;
  /** Premium of the option at the LOWER strike, whichever leg that is. */
  lowerPremium: number;
  /** Premium of the option at the UPPER strike. */
  upperPremium: number;
  lotSize: number;
  /** Number of lots. Defaults to one. */
  lots?: number;
};

export type VerticalSpread = {
  /** Net premium per share: positive when paid out, negative when received. */
  netPremium: number;
  /** True when the structure costs money to open. */
  isDebit: boolean;
  /** Distance between the strikes — the spread's total width. */
  strikeWidth: number;
  /** Best case, as a positive rupee total across all lots. */
  maxProfit: number;
  /** Worst case, as a positive rupee total across all lots. */
  maxLoss: number;
  /** Underlying price at which the structure breaks even at expiry. */
  breakEven: number;
  /** Max profit divided by max loss. Below 1 means risking more than the gain. */
  riskRewardRatio: number;
  /** Cash needed to open: the premium for a debit, the max loss for a credit. */
  capitalAtRisk: number;
};

/**
 * Cost out any of the four vertical spreads.
 *
 * Premiums are taken by STRIKE rather than by leg, because that is how a
 * chain is read: the user copies the price beside each strike and picks the
 * structure. Which leg is bought and which is sold follows from the type,
 * so the same two premiums describe a bull call and a bear call — one is
 * simply the other reversed, and the arithmetic reflects that.
 *
 * `maxProfit` and `maxLoss` are both returned as positive magnitudes across
 * the whole position. A signed convention reads well in a formula and badly
 * on a card, where "max loss: -8,000" invites the reader to wonder whether
 * the minus has already been applied.
 *
 * The invariant worth knowing: for any vertical, max profit plus max loss
 * equals the strike width times the quantity. The two numbers are two slices
 * of one fixed pie, which is why a wider credit is always a smaller cushion.
 */
export function verticalSpread(input: VerticalSpreadInput): VerticalSpread | null {
  if (!input || typeof input !== "object") return null;
  const { type, lowerStrike, upperStrike, lowerPremium, upperPremium, lotSize } = input;

  if (!DEBIT_SPREADS.includes(type) && type !== "bull-put" && type !== "bear-call") return null;
  if (!isFinitePositive(lowerStrike) || !isFinitePositive(upperStrike)) return null;
  if (upperStrike <= lowerStrike) return null;
  if (!isFinitePositive(lowerPremium) || !isFinitePositive(upperPremium)) return null;
  if (!isFinitePositive(lotSize)) return null;

  // An absent `lots` means one lot. A PRESENT but unusable one — zero,
  // negative, NaN — is a stated intention that cannot be honoured, and
  // quietly substituting one lot would put a profit on screen for a position
  // the caller said was empty.
  if (input.lots !== undefined && !isFinitePositive(input.lots)) return null;
  const lots = input.lots === undefined ? 1 : Math.floor(input.lots);
  if (lots <= 0) return null;

  const quantity = lotSize * lots;
  const strikeWidth = upperStrike - lowerStrike;

  // Which leg is long follows from the structure. Calls are bought low and
  // sold high for a bull view; puts are the mirror.
  let netPremium: number;
  let breakEven: number;

  switch (type) {
    case "bull-call":
      // Long the lower call, short the upper. Costs the difference.
      netPremium = lowerPremium - upperPremium;
      breakEven = lowerStrike + netPremium;
      break;
    case "bear-call":
      // Short the lower call, long the upper — the bull call reversed.
      netPremium = upperPremium - lowerPremium;
      breakEven = lowerStrike - netPremium;
      break;
    case "bear-put":
      // Long the upper put, short the lower.
      netPremium = upperPremium - lowerPremium;
      breakEven = upperStrike - netPremium;
      break;
    case "bull-put":
      // Short the upper put, long the lower — the bear put reversed.
      netPremium = lowerPremium - upperPremium;
      breakEven = upperStrike + netPremium;
      break;
    default:
      return null;
  }

  const isDebit = netPremium > 0;
  const magnitude = Math.abs(netPremium);

  // No-arbitrage bounds a vertical's net premium strictly inside its width: a
  // debit at or above the width could never profit, and a credit at or above
  // it would be free money. Either means the premiums have been entered
  // against the wrong strikes, and saying so beats reporting a negative
  // "maximum profit" as though it were a result.
  if (!(magnitude > 0 && magnitude < strikeWidth)) return null;

  // The fixed pie: one side gets the premium, the other gets what is left of
  // the strike width.
  const perShareProfit = isDebit ? strikeWidth - magnitude : magnitude;
  const perShareLoss = isDebit ? magnitude : strikeWidth - magnitude;

  const maxProfit = round2(perShareProfit * quantity);
  const maxLoss = round2(perShareLoss * quantity);

  if (![maxProfit, maxLoss, breakEven].every(Number.isFinite)) return null;

  return {
    netPremium: round2(netPremium),
    isDebit,
    strikeWidth: round2(strikeWidth),
    maxProfit,
    maxLoss,
    breakEven: round2(breakEven),
    riskRewardRatio: maxLoss > 0 ? round2(maxProfit / maxLoss) : 0,
    // A debit is paid up front; a credit blocks margin against the worst case.
    capitalAtRisk: maxLoss,
  };
}
