/**
 * Plain-vanilla options payoff arithmetic for NSE index and stock options —
 * European-style, cash-settled at expiry, exactly as Indian retail F&O
 * trades them. What a trader needs before placing a trade is not a fair
 * value or a Greek, it is the answer to "what does this position pay at
 * various expiry prices, and where does it stop losing money" — arithmetic
 * an exchange settles by, not a model that estimates it.
 *
 * This module deliberately stops short of pricing. There is no
 * Black-Scholes, no implied volatility, no delta/theta/vega — those price an
 * option BEFORE expiry, when time value and volatility still matter, and
 * every one of them is a modelling opinion rather than a settled fact.
 * Payoff-at-expiry is the one number that is not an opinion: intrinsic
 * value versus strike is exactly what NSE's clearing corporation pays out,
 * so it is the only figure this module will ever assert as truth.
 * `impliedLeverage` is the sole nod to "before expiry", and it is flagged
 * explicitly as a rough approximation rather than a real delta, precisely so
 * it is never mistaken for the pricing model this module refuses to be.
 *
 * Same discipline as the rest of `src/shared` — pure functions, one input
 * object, no clock, null instead of a throw, and every output finite even
 * at extreme inputs.
 */

/**
 * Rounding that cannot overflow. Scaling by the factor can exceed
 * Number.MAX_VALUE at extreme magnitudes, and `Infinity / factor` is still
 * Infinity — an output this module promises never to emit. At those
 * magnitudes a double has no fractional part left to round anyway, so
 * passing the value through unchanged is both safe and exact.
 */
const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};

/** Paise precision — the unit premiums, strikes and P&L are quoted in. */
const round2 = (value: number): number => roundTo(value, 100);

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;
const isNonNegativeFinite = (value: number): boolean => Number.isFinite(value) && value >= 0;

type OptionType = "call" | "put";
type Position = "long" | "short";

const isOptionType = (value: unknown): value is OptionType => value === "call" || value === "put";
const isPosition = (value: unknown): value is Position => value === "long" || value === "short";

export type OptionPayoffInput = {
  optionType: OptionType;
  position: Position;
  strikePrice: number;
  premium: number;
  spotAtExpiry: number;
  /** Shares per lot. Defaults to 1 — the per-share basis — when omitted or unusable. */
  lotSize?: number;
};

export type OptionPayoffResult = {
  intrinsicValue: number;
  payoffPerShare: number;
  payoffPerLot: number;
  profitable: boolean;
};

/**
 * The core primitive every other export in this module is built from:
 * settlement P&L for one option position at one expiry spot price.
 *
 * `intrinsicValue` is defined the same way regardless of who holds the
 * option — max(spot−strike, 0) for a call, max(strike−spot, 0) for a put —
 * because that is what the exchange pays the LONG side and collects from the
 * SHORT side; it is a property of the contract, not of the position.
 *
 * The long/short asymmetry is the entire reason a separate `position` field
 * exists rather than just negating the result. A LONG's payoff,
 * `intrinsicValue − premium`, is naturally floored at `−premium` because
 * intrinsicValue can never go below zero — you cannot lose more than the
 * premium paid, full stop, and that floor falls out of the arithmetic
 * without a clamp. A SHORT's payoff, `premium − intrinsicValue`, carries no
 * such floor: intrinsicValue is unbounded above (a stock or index can rally
 * without limit), so the short's loss is unbounded too. That unbounded tail
 * is not a bug to guard against — it is the one fact about writing naked
 * options a payoff calculator exists to make undeniable.
 *
 * `profitable` is read off the ROUNDED `payoffPerShare` rather than the raw
 * value, so it always agrees with the number displayed beside it — a
 * position rounding to exactly ₹0.00 is reported as not profitable rather
 * than as a true-but-invisible fraction of a paisa in the black.
 *
 * `lotSize` is deliberately forgiving: any value that is not a finite
 * positive number (missing, zero, negative, NaN, Infinity) falls back to 1
 * rather than failing the whole calculation, because the per-share payoff is
 * still a complete and useful answer on its own.
 */
export function optionPayoff(input: OptionPayoffInput): OptionPayoffResult | null {
  if (!input || typeof input !== "object") return null;
  const { optionType, position, strikePrice, premium, spotAtExpiry } = input;

  if (!isOptionType(optionType) || !isPosition(position)) return null;
  if (!isPositiveFinite(strikePrice)) return null;
  if (!isNonNegativeFinite(premium) || !isNonNegativeFinite(spotAtExpiry)) return null;

  const lotSize =
    typeof input.lotSize === "number" && Number.isFinite(input.lotSize) && input.lotSize > 0
      ? input.lotSize
      : 1;

  const intrinsicValue =
    optionType === "call"
      ? Math.max(spotAtExpiry - strikePrice, 0)
      : Math.max(strikePrice - spotAtExpiry, 0);
  if (!Number.isFinite(intrinsicValue)) return null;

  const rawPayoffPerShare =
    position === "long" ? intrinsicValue - premium : premium - intrinsicValue;
  if (!Number.isFinite(rawPayoffPerShare)) return null;
  const payoffPerShare = round2(rawPayoffPerShare);

  const rawPayoffPerLot = payoffPerShare * lotSize;
  if (!Number.isFinite(rawPayoffPerLot)) return null;
  const payoffPerLot = round2(rawPayoffPerLot);

  return {
    intrinsicValue: round2(intrinsicValue),
    payoffPerShare,
    payoffPerLot,
    profitable: payoffPerShare > 0,
  };
}

export type OptionBreakevenInput = {
  optionType: OptionType;
  strikePrice: number;
  premium: number;
};

/**
 * The spot price at expiry where the option exactly pays back its premium —
 * the level a trader watches the underlying against, not the option.
 *
 * Deliberately position-independent: breakeven is a property of the
 * contract's terms, the same point whether you bought or sold it. What
 * differs by position is only which SIDE of that point is profitable (long
 * wants spot to move past it, short wants spot to stay short of it), and
 * that distinction belongs to `optionPayoff`'s `profitable` flag, not here.
 *
 * A call's breakeven, strike + premium, can never fall below zero given
 * valid inputs, so it always exists. A put's breakeven, strike − premium,
 * can: a premium larger than the strike implies a breakeven at a negative
 * share price, which is not a level any underlying can ever reach — so that
 * case returns null rather than a number nobody could act on.
 */
export function optionBreakeven(input: OptionBreakevenInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { optionType, strikePrice, premium } = input;

  if (!isOptionType(optionType)) return null;
  if (!isPositiveFinite(strikePrice) || !isNonNegativeFinite(premium)) return null;

  const raw = optionType === "call" ? strikePrice + premium : strikePrice - premium;
  if (!Number.isFinite(raw) || raw < 0) return null;

  return round2(raw);
}

export type OptionPayoffCurveInput = {
  optionType: OptionType;
  position: Position;
  strikePrice: number;
  premium: number;
  lotSize?: number;
  /** +/- percent of strike the curve spans. Defaults to 30 when omitted or unusable. */
  range?: number | null;
};

export type OptionPayoffCurvePoint = {
  spot: number;
  payoffPerLot: number;
};

/**
 * Payoff at 21 evenly-spaced expiry prices around the strike — the data a
 * payoff-diagram chart plots, not a number a trader reads directly.
 *
 * The 21 points run from strike × (1 − range/100) to strike × (1 + range/100)
 * in 10 equal steps each side of the strike, which sits at the centre point
 * by construction — a symmetric, denser-than-it-looks sweep that still puts
 * a point exactly on the strike, where every payoff curve kinks.
 *
 * Every point is computed by calling `optionPayoff`, not by reimplementing
 * its formula — one source of truth for the payoff math, so a fix or a
 * change there is a fix everywhere, including the chart.
 *
 * A candidate spot is floored at zero rather than allowed to go negative,
 * because a share or index price cannot; a `range` above 100 would otherwise
 * ask the downside for a price below zero. A candidate spot that still
 * overflows to Infinity (an astronomical strike combined with an
 * astronomical range) is simply dropped rather than forcing the whole curve
 * to fail — the remaining points still describe a usable, finite curve. Only
 * when every single point is unusable does the function give up and return
 * null; a curve with one point is still a curve, an empty one is not.
 *
 * `range` is forgiving the same way `lotSize` is elsewhere in this module:
 * missing, null, zero, negative, NaN or Infinity all fall back to the
 * default 30% rather than failing the call.
 */
export function optionPayoffCurve(
  input: OptionPayoffCurveInput
): Array<OptionPayoffCurvePoint> | null {
  if (!input || typeof input !== "object") return null;
  const { optionType, position, strikePrice, premium } = input;

  if (!isOptionType(optionType) || !isPosition(position)) return null;
  if (!isPositiveFinite(strikePrice) || !isNonNegativeFinite(premium)) return null;

  const range =
    typeof input.range === "number" && Number.isFinite(input.range) && input.range > 0
      ? input.range
      : 30;

  const points: Array<OptionPayoffCurvePoint> = [];
  for (let step = -10; step <= 10; step += 1) {
    const rawSpot = strikePrice * (1 + (step / 10) * (range / 100));
    if (!Number.isFinite(rawSpot)) continue;
    const spot = Math.max(rawSpot, 0);

    const payoff = optionPayoff({
      optionType,
      position,
      strikePrice,
      premium,
      spotAtExpiry: spot,
      lotSize: input.lotSize,
    });
    if (!payoff) continue;

    points.push({ spot: round2(spot), payoffPerLot: payoff.payoffPerLot });
  }

  return points.length > 0 ? points : null;
}

export type CoveredCallInput = {
  sharesHeld: number;
  buyPrice: number;
  strikePrice: number;
  premium: number;
  spotAtExpiry: number;
};

export type CoveredCallResult = {
  stockPnl: number;
  optionPnl: number;
  totalPnl: number;
  maxProfit: number;
  breakeven: number;
  capped: boolean;
};

/**
 * Selling a call against shares already held — income against a holding,
 * with upside traded away above the strike.
 *
 * `optionPnl` is computed by calling `optionPayoff` for a SHORT call sized
 * to `sharesHeld` as its lot, rather than re-deriving the short-call formula
 * here — the same one-source-of-truth reasoning as `optionPayoffCurve`.
 *
 * `maxProfit` is exact and constant for every spot at or above the strike,
 * not merely an asymptote: once assigned, the shares are sold at the strike
 * regardless of how far above it spot has run, so
 * (strike − buyPrice + premium) × shares is the whole answer whether spot
 * finishes 1% or 1,000% above strike. `capped` flags that this ceiling is
 * the one in effect, so a caller can tell "this is the max" from "this is
 * still climbing" without recomputing the comparison itself.
 *
 * `breakeven` is buyPrice − premium — deliberately a different number from
 * the naked-call breakeven in `optionBreakeven` (strike + premium), because
 * it is answering a different question. Here the premium collected cushions
 * the STOCK's own cost basis, not the option's strike; that cushion, on
 * shares the trader already intended to hold, is the entire reason this
 * strategy exists rather than just holding the shares outright.
 */
export function coveredCall(input: CoveredCallInput): CoveredCallResult | null {
  if (!input || typeof input !== "object") return null;
  const { sharesHeld, buyPrice, strikePrice, premium, spotAtExpiry } = input;

  if (!isPositiveFinite(sharesHeld) || !isPositiveFinite(buyPrice) || !isPositiveFinite(strikePrice)) {
    return null;
  }
  if (!isNonNegativeFinite(premium) || !isNonNegativeFinite(spotAtExpiry)) return null;

  const shortCall = optionPayoff({
    optionType: "call",
    position: "short",
    strikePrice,
    premium,
    spotAtExpiry,
    lotSize: sharesHeld,
  });
  if (!shortCall) return null;

  const rawStockPnl = (spotAtExpiry - buyPrice) * sharesHeld;
  if (!Number.isFinite(rawStockPnl)) return null;
  const stockPnl = round2(rawStockPnl);

  const optionPnl = shortCall.payoffPerLot;
  const rawTotalPnl = stockPnl + optionPnl;
  if (!Number.isFinite(rawTotalPnl)) return null;

  const rawMaxProfit = (strikePrice - buyPrice + premium) * sharesHeld;
  if (!Number.isFinite(rawMaxProfit)) return null;

  const rawBreakeven = buyPrice - premium;
  if (!Number.isFinite(rawBreakeven)) return null;

  return {
    stockPnl,
    optionPnl,
    totalPnl: round2(rawTotalPnl),
    maxProfit: round2(rawMaxProfit),
    breakeven: round2(rawBreakeven),
    capped: spotAtExpiry >= strikePrice,
  };
}

export type ProtectivePutInput = {
  sharesHeld: number;
  buyPrice: number;
  strikePrice: number;
  premium: number;
  spotAtExpiry: number;
};

export type ProtectivePutResult = {
  stockPnl: number;
  optionPnl: number;
  totalPnl: number;
  maxLoss: number;
  breakeven: number;
};

/**
 * Buying a put against shares already held — portfolio insurance, at the
 * cost of the premium.
 *
 * `optionPnl` again comes from `optionPayoff`, this time a LONG put sized to
 * `sharesHeld` as its lot — the same reuse discipline as `coveredCall`.
 *
 * `maxLoss` is exact and constant for every spot at or below the strike, the
 * mirror image of `coveredCall`'s `maxProfit`: below the strike the put's
 * intrinsic value rises rupee-for-rupee with the stock's fall, so the two
 * legs cancel exactly and only (buyPrice − strikePrice + premium) × shares
 * remains, however far below the strike spot ultimately lands — proof the
 * insurance actually has a floor rather than merely slowing the bleed. A
 * positive `maxLoss` is the ordinary case (the strike sits below cost) and
 * is a real, expected loss, not a sign of bad input — it is the price of
 * the insurance plus how far below cost basis the floor was set.
 *
 * `breakeven` is buyPrice + premium: the stock has to recover not just to
 * what was paid for it but also to what was paid for the insurance before
 * the position is whole.
 */
export function protectivePut(input: ProtectivePutInput): ProtectivePutResult | null {
  if (!input || typeof input !== "object") return null;
  const { sharesHeld, buyPrice, strikePrice, premium, spotAtExpiry } = input;

  if (!isPositiveFinite(sharesHeld) || !isPositiveFinite(buyPrice) || !isPositiveFinite(strikePrice)) {
    return null;
  }
  if (!isNonNegativeFinite(premium) || !isNonNegativeFinite(spotAtExpiry)) return null;

  const longPut = optionPayoff({
    optionType: "put",
    position: "long",
    strikePrice,
    premium,
    spotAtExpiry,
    lotSize: sharesHeld,
  });
  if (!longPut) return null;

  const rawStockPnl = (spotAtExpiry - buyPrice) * sharesHeld;
  if (!Number.isFinite(rawStockPnl)) return null;
  const stockPnl = round2(rawStockPnl);

  const optionPnl = longPut.payoffPerLot;
  const rawTotalPnl = stockPnl + optionPnl;
  if (!Number.isFinite(rawTotalPnl)) return null;

  const rawMaxLoss = (buyPrice - strikePrice + premium) * sharesHeld;
  if (!Number.isFinite(rawMaxLoss)) return null;

  const rawBreakeven = buyPrice + premium;
  if (!Number.isFinite(rawBreakeven)) return null;

  return {
    stockPnl,
    optionPnl,
    totalPnl: round2(rawTotalPnl),
    maxLoss: round2(rawMaxLoss),
    breakeven: round2(rawBreakeven),
  };
}

export type ImpliedLeverageInput = {
  premium: number;
  strikePrice: number;
  spotPrice: number;
};

/**
 * spotPrice / premium — how many times more, in percentage terms, an
 * option's price is popularly expected to move versus its underlying, at
 * the current moment. This is the retail rule of thumb, not a real figure:
 * an actual option's sensitivity to the underlying is its delta, which
 * depends on moneyness, time to expiry and volatility and moves continuously
 * as all three change. This ratio holds none of that — it is a snapshot
 * division, included because it is the number retail platforms show under
 * "leverage" and traders will look for it here, but documented plainly so it
 * is never read as delta.
 *
 * `strikePrice` is accepted only for symmetry with this module's other
 * inputs — a caller assembling the same input shape for every function
 * should not need a special case here — and never enters the formula.
 */
export function impliedLeverage(input: ImpliedLeverageInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { premium, spotPrice } = input;

  if (!isPositiveFinite(premium) || !isPositiveFinite(spotPrice)) return null;

  const raw = spotPrice / premium;
  return Number.isFinite(raw) ? round2(raw) : null;
}
