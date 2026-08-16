/**
 * Single-stock calculators — the arithmetic a retail investor does about one
 * holding, on the back of an envelope, usually while the market is open.
 *
 * `planning-tools` sizes a trade that does not exist yet and projects a
 * portfolio decades forward. This module answers the smaller, sharper questions
 * asked about a position already on screen: what my average becomes if I buy
 * more, what the price has to do for this to double, how far a loss has to
 * climb back, what capital a dividend cheque demands, and where a percentage
 * stop actually sits in rupees. The discipline is the same as everywhere else
 * in `src/shared` — pure functions, one input object, no clock, null instead of
 * a throw — because these numbers get typed into a broker terminal, and a
 * figure the UI shows must be reproducible in a test to the paisa.
 */

/**
 * Rounding that cannot overflow. Scaling by the factor can exceed
 * Number.MAX_VALUE at extreme magnitudes, and `Infinity / factor` is still
 * Infinity — an output this module promises never to emit. At those magnitudes
 * a double has no fractional part left to round anyway, so passing the value
 * through unchanged is both safe and exact.
 */
const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};

/** Paise precision — the unit Indian equity prices and P&L are quoted in. */
const round2 = (value: number): number => roundTo(value, 100);

/**
 * Ratios keep two extra digits. A multiple rounded to paise precision would
 * report 1.005x and 1.0149x as the same 1.01x while their return percentages
 * differ threefold, which reads as an inconsistency between two numbers sitting
 * side by side.
 */
const round4 = (value: number): number => roundTo(value, 10_000);

/**
 * Quantities are counted rather than priced, but fractional-unit platforms make
 * the sum a float — 0.1 + 0.2 lands on 0.30000000000000004, and a share count
 * with sixteen decimals destroys confidence in every figure beside it. Four
 * decimals is finer than any Indian platform allots units and coarse enough to
 * erase the artefact.
 */
const roundQuantity = (value: number): number => roundTo(value, 10_000);

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

export type AverageDownInput = {
  existingQuantity: number;
  existingAvgPrice: number;
  newQuantity: number;
  newPrice: number;
};

export type AveragedPosition = {
  totalQuantity: number;
  newAveragePrice: number;
  totalInvested: number;
  /** Rupee move in the average price — negative when the top-up averages down. */
  avgPriceChange: number;
  avgPriceChangePercent: number;
};

/**
 * The blended cost of adding to an existing holding — the "stock average
 * calculator" Indian retail searches for more than any other tool on this list.
 *
 * Nothing here assumes the new price is lower. Averaging UP — pyramiding into a
 * winner — is the identical weighted mean, and a calculator that rejected a
 * higher price would refuse half of the question it is asked. The sign of
 * `avgPriceChange` carries that distinction instead: negative means the average
 * came down, positive means the position got more expensive.
 *
 * The average is weighted by rupees committed, not by lot count: one share at
 * ₹1,000 moves the average as much as a thousand shares at ₹1. That is exactly
 * why the naive midpoint of the two prices — the number people actually
 * estimate in their heads — is wrong whenever the two legs differ in size.
 *
 * `avgPriceChange` and its percent are measured against the ROUNDED average
 * rather than the full-precision one, so a user who subtracts the two figures
 * on screen gets the third. A paise of disagreement inside a number they can
 * check by hand costs more trust than the hidden precision is worth.
 *
 * Zero is not a usable quantity or price: a zero-quantity leg is not a trade,
 * and a zero cost basis is a gift rather than a purchase. Both return null, so
 * the caller prompts for input instead of displaying a confident ₹0 average.
 */
export function averageDown(input: AverageDownInput): AveragedPosition | null {
  if (!input || typeof input !== "object") return null;
  const { existingQuantity, existingAvgPrice, newQuantity, newPrice } = input;

  if (![existingQuantity, existingAvgPrice, newQuantity, newPrice].every(isPositiveFinite)) {
    return null;
  }

  const totalQuantity = existingQuantity + newQuantity;
  const totalInvested = existingQuantity * existingAvgPrice + newQuantity * newPrice;
  const averagePrice = totalInvested / totalQuantity;
  if (![totalQuantity, totalInvested, averagePrice].every((value) => Number.isFinite(value))) {
    return null;
  }

  const newAveragePrice = round2(averagePrice);
  const avgPriceChange = newAveragePrice - existingAvgPrice;
  const avgPriceChangePercent = (avgPriceChange / existingAvgPrice) * 100;
  // A subnormal cost basis against a large top-up can push the percent past
  // Number.MAX_VALUE; an Infinity move in the average is not an answer.
  if (!Number.isFinite(avgPriceChangePercent)) return null;

  return {
    totalQuantity: roundQuantity(totalQuantity),
    newAveragePrice,
    totalInvested: round2(totalInvested),
    avgPriceChange: round2(avgPriceChange),
    avgPriceChangePercent: round2(avgPriceChangePercent),
  };
}

export type RequiredReturnInput = {
  currentPrice: number;
  targetPrice: number;
  /** Horizon for the annualised figure. Omit to ask "how much", not "how fast". */
  years?: number | null;
};

export type RequiredReturn = {
  totalReturnPercent: number;
  /** Quoted only when a positive horizon was supplied. */
  annualisedPercent: number | null;
  /** target ÷ current — the "2x" the question is usually phrased in. */
  multiple: number;
};

/**
 * What the price has to do to reach a target — "what do I need for this to 2x".
 *
 * A target below the current price is a legitimate question, not a typo: it is
 * how an exit plan, a downside case, or a short's objective gets expressed. So
 * a lower target returns a negative `totalReturnPercent` rather than null. Only
 * a non-positive price is refused — a zero target is a bankruptcy thesis rather
 * than a price target, and a zero current price has no ratio to it at all.
 *
 * `annualisedPercent` is the geometric rate, multiple^(1/years) − 1, matching
 * `cagr` in planning-tools so that the return this target demands and the
 * return the holding has actually delivered are quoted on the same basis.
 * Without a horizon the honest answer is "no rate" rather than a rate over one
 * implied year, so a missing, zero, negative or garbled `years` nulls that one
 * field and leaves the rest of the answer standing — the same treatment an
 * optional target gets in `positionSize`.
 */
export function requiredReturn(input: RequiredReturnInput): RequiredReturn | null {
  if (!input || typeof input !== "object") return null;
  const { currentPrice, targetPrice, years } = input;

  if (!isPositiveFinite(currentPrice) || !isPositiveFinite(targetPrice)) return null;

  const multiple = targetPrice / currentPrice;
  const totalReturnPercent = (multiple - 1) * 100;
  if (!Number.isFinite(multiple) || !Number.isFinite(totalReturnPercent)) return null;

  let annualisedPercent: number | null = null;
  if (typeof years === "number" && Number.isFinite(years) && years > 0) {
    const rate = (Math.pow(multiple, 1 / years) - 1) * 100;
    // A horizon short enough to demand an unrepresentable rate has no rate to
    // quote, but the total return is still true — only the field drops.
    annualisedPercent = Number.isFinite(rate) ? round2(rate) : null;
  }

  return {
    totalReturnPercent: round2(totalReturnPercent),
    annualisedPercent,
    multiple: round4(multiple),
  };
}

export type BreakEvenAfterLossInput = {
  lossPercent: number;
};

/**
 * The gain needed to climb back to breakeven after a drawdown:
 * gain = loss / (100 − loss) × 100.
 *
 * The asymmetry is the entire point and it is not intuitive: −50% needs +100%,
 * −80% needs +400%. The instinctive answer ("lose 50, make 50 back") is wrong
 * because the recovery is earned on the smaller capital that survived, and
 * printing the real figure is the most useful correction a loss calculator can
 * make to how a holder thinks about averaging into a falling stock.
 *
 * A loss of 100% or more returns null rather than an enormous number, because
 * it is unrecoverable in a stricter sense than "hard": once capital is zero, no
 * percentage gain multiplies it back to anything, and the formula's division by
 * zero is telling the truth. Beyond 100% the algebra would even flip sign and
 * report a negative "gain", which would be worse than no answer.
 *
 * A zero or negative "loss" is not a loss at all — there is nothing to
 * recover — so it is refused rather than answered with 0, which a user would
 * read as "already recovered" for input they plainly mistyped.
 */
export function breakEvenAfterLoss(input: BreakEvenAfterLossInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { lossPercent } = input;

  if (!Number.isFinite(lossPercent)) return null;
  if (lossPercent <= 0 || lossPercent >= 100) return null;

  const gain = (lossPercent / (100 - lossPercent)) * 100;
  return Number.isFinite(gain) ? round2(gain) : null;
}

export type DividendIncomePlannerInput = {
  targetMonthlyIncome: number;
  dividendYieldPercent: number;
};

export type DividendIncomePlan = {
  capitalRequired: number;
  annualIncome: number;
};

/**
 * The capital a dividend income target demands: annual income ÷ yield.
 *
 * The maths runs on the annual figure because yields are annual. `annualIncome`
 * is returned rather than kept internal so the caller can show it: most Indian
 * companies pay once or twice a year, and presenting only a monthly number
 * implies a monthly cheque that no single stock actually posts.
 *
 * The figure is gross. Dividends have been taxed at the recipient's slab since
 * FY21, so the capital funding a given post-tax income is materially larger —
 * that disclosure belongs to the caller, because baking in an assumed slab here
 * would quietly answer a different question for every user who reads it.
 *
 * The stated yield is taken at face value with no plausibility ceiling. A cap
 * would be a judgment about the market rather than about the arithmetic, and a
 * user stress-testing an unusual yield deserves the answer they asked for. Only
 * a non-positive yield is refused: with no yield, no amount of capital produces
 * the income, and there is no number to show.
 */
export function dividendIncomePlanner(
  input: DividendIncomePlannerInput
): DividendIncomePlan | null {
  if (!input || typeof input !== "object") return null;
  const { targetMonthlyIncome, dividendYieldPercent } = input;

  if (!isPositiveFinite(targetMonthlyIncome) || !isPositiveFinite(dividendYieldPercent)) {
    return null;
  }

  const annualIncome = targetMonthlyIncome * 12;
  const capitalRequired = (annualIncome / dividendYieldPercent) * 100;
  if (!Number.isFinite(annualIncome) || !Number.isFinite(capitalRequired)) return null;

  return {
    capitalRequired: round2(capitalRequired),
    annualIncome: round2(annualIncome),
  };
}

export type StopLossTargetsInput = {
  entryPrice: number;
  stopLossPercent: number;
  targetPercent?: number | null;
  direction?: "long" | "short";
};

export type StopLossLevels = {
  stopLossPrice: number;
  targetPrice: number | null;
  riskRewardRatio: number | null;
};

/**
 * Converts a percentage stop and target into the rupee prices that get typed
 * into an order window. Percentages are how risk is decided; prices are what
 * the broker accepts, and performing that conversion mentally at the moment of
 * placing a trade is precisely where fat-finger mistakes happen.
 *
 * The two directions are not mirror images, and the asymmetry is real rather
 * than an implementation artefact. A long's stop sits below entry, so it cannot
 * reach 100% — a stop 100% below entry is the company at zero, a level no order
 * ever fills at — and is refused. A short's stop sits above entry and
 * legitimately can exceed 100%: a stock that doubles has cost the short 100% of
 * the position, and 150% or 300% are exactly the numbers that make unhedged
 * shorting dangerous, so they are honoured rather than clamped.
 *
 * A target that would land at or below zero — a short "target" of 100% or more,
 * meaning the company disappears — is treated as no target rather than as fatal
 * input. The stop is the half that protects capital and should still be
 * returned, the same forgiveness `positionSize` extends to a garbled target.
 *
 * `riskRewardRatio` is derived from the ROUNDED prices so it reconciles with
 * the levels displayed beside it. It drops to null when the stop rounds onto
 * the entry price itself, which happens when a stop is tighter than one tick:
 * a ratio against zero risk is a division by zero, not an infinitely good
 * trade. The stop is still returned in that case, sitting visibly at entry,
 * because "your stop is closer than the exchange's tick size" is advice the
 * user needs to see rather than a validation error.
 */
export function stopLossTargets(input: StopLossTargetsInput): StopLossLevels | null {
  if (!input || typeof input !== "object") return null;
  const { entryPrice, stopLossPercent, targetPercent } = input;

  const direction = input.direction ?? "long";
  if (direction !== "long" && direction !== "short") return null;
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(stopLossPercent)) return null;
  if (direction === "long" && stopLossPercent >= 100) return null;

  const rawStop =
    direction === "long"
      ? entryPrice * (1 - stopLossPercent / 100)
      : entryPrice * (1 + stopLossPercent / 100);
  if (!Number.isFinite(rawStop)) return null;

  // A stop under a paise rounds to zero, and zero is not a level an order can
  // rest at — the percentage is unusable against a price this small.
  const stopLossPrice = round2(rawStop);
  if (stopLossPrice <= 0) return null;

  let targetPrice: number | null = null;
  if (typeof targetPercent === "number" && Number.isFinite(targetPercent) && targetPercent > 0) {
    const rawTarget =
      direction === "long"
        ? entryPrice * (1 + targetPercent / 100)
        : entryPrice * (1 - targetPercent / 100);
    if (Number.isFinite(rawTarget)) {
      const rounded = round2(rawTarget);
      if (rounded > 0) targetPrice = rounded;
    }
  }

  let riskRewardRatio: number | null = null;
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  if (targetPrice !== null && riskPerShare > 0) {
    const ratio = Math.abs(targetPrice - entryPrice) / riskPerShare;
    if (Number.isFinite(ratio)) riskRewardRatio = round2(ratio);
  }

  return { stopLossPrice, targetPrice, riskRewardRatio };
}

export type BuyLot = {
  quantity: number;
  price: number;
};

export type WeightedAverageBuyInput = {
  lots: Array<BuyLot>;
};

export type WeightedAveragePosition = {
  totalQuantity: number;
  averagePrice: number;
  totalInvested: number;
};

/**
 * Weighted average cost across N tranches — `averageDown` generalised from one
 * top-up to an entire accumulation history, and it returns the identical
 * average for the two-lot case by construction.
 *
 * Unusable lots are skipped rather than fatal. This input arrives from a pasted
 * tradebook or from repeatable form rows, where one blank or half-typed line is
 * routine; blanking out the average of nine good lots because of the tenth
 * would be a worse answer than the partial truth. Null is reserved for the one
 * situation with nothing to say — no usable lot at all.
 *
 * The skipping is silent by design. The caller knows which rows it sent and can
 * validate them individually; a combined error here would hide the nine correct
 * lots behind the one mistake, which is the opposite of helpful.
 */
export function weightedAverageBuy(
  input: WeightedAverageBuyInput
): WeightedAveragePosition | null {
  if (!input || typeof input !== "object") return null;
  const { lots } = input;
  if (!Array.isArray(lots)) return null;

  let totalQuantity = 0;
  let totalInvested = 0;
  let usableLots = 0;

  for (const lot of lots) {
    if (!lot || typeof lot !== "object") continue;
    const { quantity, price } = lot;
    if (!isPositiveFinite(quantity) || !isPositiveFinite(price)) continue;

    // A single lot whose value overflows cannot be weighed against the others;
    // dropping it keeps the remaining lots' average intact.
    const invested = quantity * price;
    if (!Number.isFinite(invested)) continue;

    totalQuantity += quantity;
    totalInvested += invested;
    usableLots += 1;
  }

  if (usableLots === 0) return null;

  const averagePrice = totalInvested / totalQuantity;
  if (![totalQuantity, totalInvested, averagePrice].every((value) => Number.isFinite(value))) {
    return null;
  }

  return {
    totalQuantity: roundQuantity(totalQuantity),
    averagePrice: round2(averagePrice),
    totalInvested: round2(totalInvested),
  };
}
