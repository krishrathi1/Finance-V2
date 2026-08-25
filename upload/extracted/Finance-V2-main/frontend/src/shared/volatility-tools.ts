/**
 * Straddles and strangles: buying or selling a move rather than a direction.
 *
 * A straddle takes a call and a put at the SAME strike; a strangle takes them
 * at different ones. Bought, they pay when the underlying moves far enough
 * either way and lose when it sits still. Sold, they do the reverse — and it
 * is the sold side that needs the loudest warning, because short straddles
 * are among the most popular structures with Indian retail and among the few
 * with genuinely unlimited loss.
 *
 * The number that decides a long structure is not the premium but the MOVE
 * the premium demands. Paying ₹480 on a 24,000 index is not "₹480 of risk";
 * it is a requirement that the index travel 2% before the position is worth
 * anything at all. Expiries frequently pass without that happening, which is
 * how a position with two ways to win still loses most of the time.
 *
 * `maxProfit` and `maxLoss` are `null` where the exposure is genuinely
 * unbounded. Substituting a large finite number would make an unlimited risk
 * look surveyable, which is the exact error a short straddle punishes.
 *
 * Brokerage, STT and exchange margin are not modelled here — a short
 * straddle in particular blocks far more margin than the premium collected,
 * and the charges tool covers that side.
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

export type VolatilityDirection = "long" | "short";

export type VolatilityInput = {
  direction: VolatilityDirection;
  /** Current price of the underlying. */
  spot: number;
  /** Strike of the call leg. Equal to the put strike makes it a straddle. */
  callStrike: number;
  /** Strike of the put leg. Must not sit above the call strike. */
  putStrike: number;
  callPremium: number;
  putPremium: number;
  lotSize: number;
  lots?: number;
};

export type VolatilityStructure = {
  /** True when both legs share a strike. */
  isStraddle: boolean;
  /** Combined premium per share, paid out when long and taken in when short. */
  netPremium: number;
  /** That premium across every lot. */
  totalPremium: number;
  upperBreakEven: number;
  lowerBreakEven: number;
  /**
   * How far the underlying must travel from spot to reach the NEARER
   * breakeven, as a percentage. For a long structure this is the hurdle; for
   * a short one it is the cushion before losses begin.
   */
  breakEvenMovePercent: number;
  /**
   * Width of the zone where the worst case applies. Zero for a straddle,
   * which suffers it at a single point, and the strike gap for a strangle,
   * which suffers it across a range.
   */
  maxLossZoneWidth: number;
  /** Null when the upside is unbounded. */
  maxProfit: number | null;
  /** Null when the downside is unbounded. */
  maxLoss: number | null;
  /**
   * Best case if the underlying falls to zero. Bounded even for a long
   * structure, since a price cannot go below nothing.
   */
  profitIfUnderlyingHitsZero: number;
};

/**
 * Cost out a straddle or strangle, long or short.
 *
 * Whether it is a straddle or a strangle is DERIVED from the strikes rather
 * than declared, because a declared type can contradict them and then one of
 * the two has to be ignored. Equal strikes is a straddle; a call above a put
 * is a strangle.
 *
 * The one asymmetry worth knowing: a long structure's upside is unbounded but
 * its downside profit is not, because the underlying stops at zero. That
 * bounded figure is reported separately, since on a stock — as opposed to an
 * index — it is a real and reachable outcome.
 */
export function volatilityStructure(input: VolatilityInput): VolatilityStructure | null {
  if (!input || typeof input !== "object") return null;
  const { direction, spot, callStrike, putStrike, callPremium, putPremium, lotSize } = input;

  if (direction !== "long" && direction !== "short") return null;
  if (!isFinitePositive(spot)) return null;
  if (!isFinitePositive(callStrike) || !isFinitePositive(putStrike)) return null;
  // A call struck below the put would overlap the legs into a different
  // structure entirely (a guts), which this does not model.
  if (callStrike < putStrike) return null;
  if (!isFinitePositive(callPremium) || !isFinitePositive(putPremium)) return null;
  if (!isFinitePositive(lotSize)) return null;

  if (input.lots !== undefined && !isFinitePositive(input.lots)) return null;
  const lots = input.lots === undefined ? 1 : Math.floor(input.lots);
  if (lots <= 0) return null;

  const quantity = lotSize * lots;
  const netPremium = callPremium + putPremium;
  const totalPremium = netPremium * quantity;

  const upperBreakEven = callStrike + netPremium;
  const lowerBreakEven = putStrike - netPremium;

  // Distance to whichever breakeven the underlying would reach first.
  const nearerDistance = Math.min(
    Math.abs(upperBreakEven - spot),
    Math.abs(spot - lowerBreakEven)
  );
  const breakEvenMovePercent = (nearerDistance / spot) * 100;

  const isLong = direction === "long";

  // A fall to zero leaves the put worth its full strike.
  const gainAtZero = (putStrike - netPremium) * quantity;
  const profitIfUnderlyingHitsZero = isLong ? gainAtZero : -gainAtZero;

  const values = [totalPremium, upperBreakEven, lowerBreakEven, breakEvenMovePercent, gainAtZero];
  if (!values.every(Number.isFinite)) return null;

  return {
    isStraddle: callStrike === putStrike,
    netPremium: round2(netPremium),
    totalPremium: round2(totalPremium),
    upperBreakEven: round2(upperBreakEven),
    lowerBreakEven: round2(lowerBreakEven),
    breakEvenMovePercent: round2(breakEvenMovePercent),
    maxLossZoneWidth: round2(callStrike - putStrike),
    // Long: unbounded above, risk capped at the premium. Short: the mirror.
    maxProfit: isLong ? null : round2(totalPremium),
    maxLoss: isLong ? round2(totalPremium) : null,
    profitIfUnderlyingHitsZero: round2(profitIfUnderlyingHitsZero),
  };
}
