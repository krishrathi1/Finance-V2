/**
 * Margin, leverage and liquidation arithmetic for NSE cash-market intraday
 * and MTF (margin trading facility) trading — the leveraged buying-on-
 * borrowed-money mechanics a discount broker's margin calculator performs,
 * scoped deliberately to plain equity leverage.
 *
 * Options and futures margin runs on SPAN + exposure, a portfolio-level risk
 * model that shares nothing with the single-position arithmetic here; folding
 * the two into one module would misrepresent both, so that model is explicitly
 * out of scope. This module answers only: how much margin does a leveraged
 * cash position demand, how many shares does a margin budget buy, at what
 * price does a leveraged position get force-closed, how much fresh capital
 * closes a shortfall, and how violently does leverage amplify a losing move
 * against the trader's own equity. Same discipline as the rest of
 * `src/shared` — pure functions, one input object, null instead of a throw,
 * and every output finite even at extreme inputs.
 */

/**
 * Rounding that cannot overflow. Scaling by the factor can exceed
 * Number.MAX_VALUE at extreme magnitudes, and `Infinity / factor` is still
 * Infinity — an output this module promises never to emit. At those
 * magnitudes a double has no fractional part left to round anyway, so passing
 * the value through unchanged is both safe and exact.
 */
const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};

/** Paise / rupee precision for money amounts. */
const round2 = (value: number): number => roundTo(value, 100);

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

/** Broker margin percentages are quoted 0–100 exclusive of 0, inclusive of 100 (100 = fully paid, no leverage). */
const isValidMarginPercent = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && value <= 100;

/**
 * Maintenance margin must leave room both above 0% (no floor means any price
 * "satisfies" it, which is not a real maintenance requirement) and below 100%
 * (a requirement that equity be the entire position value can never be met by
 * a leveraged position, since some of that value is, by definition, borrowed).
 */
const isValidMaintenancePercent = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && value < 100;

export type IntradayMarginInput = {
  quantity: number;
  price: number;
  marginPercent: number;
};

export type IntradayMarginResult = {
  positionValue: number;
  marginRequired: number;
  leverage: number;
  borrowedAmount: number;
};

/**
 * The headline "how much margin do I need" calculation behind every discount
 * broker's intraday/MTF margin calculator.
 *
 * `marginPercent` is the broker's own quoted figure — the fraction of position
 * value they demand up front — not a leverage multiple, because that is how
 * brokers publish it (e.g. "20% margin" rather than "5x"). `leverage` is
 * derived (100/marginPercent) rather than taken as input so the two numbers
 * can never disagree with each other on screen.
 *
 * `marginPercent` above 100 is refused rather than accepted as "very
 * conservative": above 100% is not a smaller leverage, it is paying more cash
 * than the position is worth, which is not a term any broker margin schedule
 * uses — the input is almost certainly a misplaced decimal or a leverage
 * multiple entered where a percentage was expected, and answering it
 * confidently would launder that mistake into a number that looks like real
 * broker output.
 */
export function intradayMargin(input: IntradayMarginInput): IntradayMarginResult | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, price, marginPercent } = input;

  if (!isPositiveFinite(quantity) || !isPositiveFinite(price)) return null;
  if (!isValidMarginPercent(marginPercent)) return null;

  const positionValue = quantity * price;
  const marginRequired = positionValue * (marginPercent / 100);
  const leverage = 100 / marginPercent;
  const borrowedAmount = positionValue - marginRequired;

  if (
    ![positionValue, marginRequired, leverage, borrowedAmount].every((value) =>
      Number.isFinite(value)
    )
  ) {
    return null;
  }

  return {
    positionValue: round2(positionValue),
    marginRequired: round2(marginRequired),
    leverage: round2(leverage),
    borrowedAmount: round2(borrowedAmount),
  };
}

export type MaxQuantityForMarginInput = {
  availableMargin: number;
  price: number;
  marginPercent: number;
};

export type MaxQuantityForMarginResult = {
  maxQuantity: number;
  positionValue: number;
  marginUsed: number;
  marginRemaining: number;
};

/**
 * The inverse of `intradayMargin`: given a margin budget and a leverage
 * schedule, how many shares can actually be bought — the question a trader
 * asks before placing the order, rather than after.
 *
 * `maxQuantity` is floored, never rounded. A broker's order book has no
 * concept of a fractional intraday share, so rounding 133.7 up to 134 would
 * quote a quantity the margin budget cannot actually cover, and displaying it
 * would send the user into a rejected or under-margined order. Flooring is
 * the only direction that keeps `marginUsed` at or under `availableMargin` in
 * every case.
 *
 * `marginRemaining` is reported explicitly, and can be a meaningfully large
 * leftover — the whole point is to show the change from rounding a real share
 * count down to a whole number, money the flooring left unused rather than
 * money that was miscalculated.
 */
export function maxQuantityForMargin(
  input: MaxQuantityForMarginInput
): MaxQuantityForMarginResult | null {
  if (!input || typeof input !== "object") return null;
  const { availableMargin, price, marginPercent } = input;

  if (!isPositiveFinite(availableMargin) || !isPositiveFinite(price)) return null;
  if (!isValidMarginPercent(marginPercent)) return null;

  const marginPerShare = price * (marginPercent / 100);
  if (!Number.isFinite(marginPerShare) || marginPerShare <= 0) return null;

  const rawQuantity = availableMargin / marginPerShare;
  if (!Number.isFinite(rawQuantity)) return null;

  const maxQuantity = Math.floor(rawQuantity);
  const positionValue = maxQuantity * price;
  const marginUsed = positionValue * (marginPercent / 100);
  const marginRemaining = availableMargin - marginUsed;

  if (
    ![positionValue, marginUsed, marginRemaining].every((value) => Number.isFinite(value))
  ) {
    return null;
  }

  return {
    maxQuantity,
    positionValue: round2(positionValue),
    marginUsed: round2(marginUsed),
    marginRemaining: round2(marginRemaining),
  };
}

export type LiquidationPriceInput = {
  entryPrice: number;
  marginPercent: number;
  maintenanceMarginPercent: number;
  direction?: "long" | "short";
};

/**
 * The price at which a leveraged intraday/MTF position gets force-closed
 * because equity, marked to the current price, has fallen to the broker's
 * maintenance requirement.
 *
 * Derivation (long): buying at `entryPrice` (P0) with initial margin m% means
 * the broker fronts the rest — `borrowedPerShare = P0 * (1 − m/100)` — and
 * that rupee amount owed does not move as the price moves. At any later price
 * P, equity per share is `P − borrowedPerShare`. Liquidation is defined
 * against the CURRENT position value (the standard broker convention, because
 * that is the value the loan is actually collateralised against right now),
 * so it fires when:
 *
 *   (P − borrowedPerShare) / P = maintenanceMarginPercent / 100
 *
 * Solving for P (no iteration — this is linear in P once cross-multiplied):
 *
 *   P − borrowedPerShare = P · mm/100
 *   P · (1 − mm/100) = borrowedPerShare
 *   P = borrowedPerShare / (1 − mm/100)
 *
 * Derivation (short): shorting at P0 with initial margin m% posts
 * `P0 * m/100` as collateral; the short's mark-to-market P&L per share is
 * `P0 − P` (a gain as price falls). Equity per share at price P is therefore
 * `P0 * (1 + m/100) − P` — by construction this equals the initial margin at
 * P = P0, matching the long side's equity at entry. Setting that ratio to
 * maintenance and solving the same way:
 *
 *   (P0·(1+m/100) − P) / P = mm/100
 *   P0·(1+m/100) = P · (1 + mm/100)
 *   P = P0·(1+m/100) / (1+mm/100)
 *
 * This lands above entry whenever the initial margin exceeds the maintenance
 * margin (the ordinary case), matching the intuition that a short is
 * liquidated by the price rising rather than falling.
 *
 * A long liquidation price that computes to zero or less (only possible when
 * `marginPercent` is 100, i.e. no borrowing at all) is treated as "not
 * applicable" rather than an error: a fully cash-collateralised position has
 * no lender to satisfy and cannot be liquidated by a price fall.
 * `maintenanceMarginPercent` at or above 100 is refused outright — no price
 * fall or rise could ever satisfy "equity must equal or exceed the full
 * position value" for a position that is, by definition, partly borrowed.
 */
export function liquidationPrice(input: LiquidationPriceInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { entryPrice, marginPercent, maintenanceMarginPercent } = input;
  const direction = input.direction ?? "long";

  if (direction !== "long" && direction !== "short") return null;
  if (!isPositiveFinite(entryPrice)) return null;
  if (!isValidMarginPercent(marginPercent)) return null;
  if (!isValidMaintenancePercent(maintenanceMarginPercent)) return null;

  const m = marginPercent / 100;
  const mm = maintenanceMarginPercent / 100;

  let raw: number;
  if (direction === "long") {
    const borrowedPerShare = entryPrice * (1 - m);
    raw = borrowedPerShare / (1 - mm);
  } else {
    raw = (entryPrice * (1 + m)) / (1 + mm);
  }

  if (!Number.isFinite(raw)) return null;

  const price = round2(raw);
  // A fully-collateralised long (marginPercent = 100) or any result that
  // rounds through zero has no meaningful liquidation price to show.
  if (price <= 0) return null;

  return price;
}

export type MarginCallInput = {
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  marginPercent: number;
  maintenanceMarginPercent: number;
  direction?: "long" | "short";
};

export type MarginCallStatus = {
  currentEquity: number;
  requiredEquity: number;
  marginCallAmount: number;
  inMarginCall: boolean;
};

/**
 * Whether a leveraged position is currently below its maintenance
 * requirement, and — if so — how much fresh cash restores it.
 *
 * `currentEquity` reuses the same per-share equity relation derived in
 * `liquidationPrice` (position value minus the fixed rupee amount borrowed at
 * entry, for a long; initial collateral plus mark-to-market P&L, for a
 * short), evaluated at `currentPrice` rather than solved for the price where
 * it hits maintenance.
 *
 * `requiredEquity` tops the position back up to the ORIGINAL initial margin
 * percentage — `marginPercent`, not `maintenanceMarginPercent` — measured
 * against the CURRENT (marked-to-market) position value. Topping up only to
 * the bare maintenance floor is a materially worse answer that this function
 * deliberately does not give: it would leave the account one tick from
 * another call, whereas real margin-call notices from Indian brokers ask for
 * enough to restore the initial requirement, rebuilding the buffer that
 * maintenance alone does not. Both required and maintenance are calculated
 * against `currentPrice`, not the (stale) entry price, because that is the
 * value the position is actually collateralised against right now.
 *
 * `inMarginCall` is decided against the maintenance threshold — it can be
 * false even though `currentEquity` sits below the initial-margin level, the
 * ordinary state of any leveraged position between entry and either a
 * maintenance breach or a profit. `marginCallAmount` is clamped to zero
 * rather than left negative in that state, since "top-up needed" cannot be a
 * negative number without implying a withdrawal, which is a different
 * question this function is not answering.
 */
export function marginCallAmount(input: MarginCallInput): MarginCallStatus | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, entryPrice, currentPrice, marginPercent, maintenanceMarginPercent } = input;
  const direction = input.direction ?? "long";

  if (direction !== "long" && direction !== "short") return null;
  if (!isPositiveFinite(quantity)) return null;
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(currentPrice)) return null;
  if (!isValidMarginPercent(marginPercent)) return null;
  if (!isValidMaintenancePercent(maintenanceMarginPercent)) return null;

  const m = marginPercent / 100;
  const mm = maintenanceMarginPercent / 100;

  const equityPerShare =
    direction === "long"
      ? currentPrice - entryPrice * (1 - m)
      : entryPrice * (1 + m) - currentPrice;

  const currentPositionValue = currentPrice * quantity;
  const currentEquity = equityPerShare * quantity;
  const requiredEquity = currentPositionValue * m;
  const maintenanceRequirement = currentPositionValue * mm;

  if (
    ![currentPositionValue, currentEquity, requiredEquity, maintenanceRequirement].every(
      (value) => Number.isFinite(value)
    )
  ) {
    return null;
  }

  const inMarginCall = currentEquity < maintenanceRequirement;
  const shortfall = requiredEquity - currentEquity;
  const marginCallValue = inMarginCall && Number.isFinite(shortfall) ? Math.max(0, shortfall) : 0;

  return {
    currentEquity: round2(currentEquity),
    requiredEquity: round2(requiredEquity),
    marginCallAmount: round2(marginCallValue),
    inMarginCall,
  };
}

export type LeverageRiskOfRuinInput = {
  leverage: number;
  adverseMovePercent: number;
};

export type LeverageRiskOfRuin = {
  equityLossPercent: number;
  wipedOut: boolean;
};

/**
 * How a price move against the position, scaled by leverage, eats into the
 * trader's own equity — the "5x leverage feels like a small multiplier"
 * intuition this function exists to correct.
 *
 * `equityLossPercent` is deliberately uncapped at 100. A move times leverage
 * that exceeds 100% is not a display bug to clamp away — it is the honest and
 * more important half of the answer: the trader is not just wiped out, they
 * owe the broker the difference, and a number capped at "total loss" would
 * hide exactly the scenario (large leverage, ordinary-sized adverse move)
 * that this calculator is meant to make visible.
 *
 * A zero adverse move is a legitimate, uneventful answer (no loss) and is not
 * refused; only a negative move — which is not a move against the position at
 * all — is invalid, since this function measures adversity, not direction.
 */
export function leverageRiskOfRuin(input: LeverageRiskOfRuinInput): LeverageRiskOfRuin | null {
  if (!input || typeof input !== "object") return null;
  const { leverage, adverseMovePercent } = input;

  if (!isPositiveFinite(leverage)) return null;
  if (!Number.isFinite(adverseMovePercent) || adverseMovePercent < 0) return null;

  const equityLossPercent = adverseMovePercent * leverage;
  if (!Number.isFinite(equityLossPercent)) return null;

  return {
    equityLossPercent: round2(equityLossPercent),
    wipedOut: equityLossPercent >= 100,
  };
}
