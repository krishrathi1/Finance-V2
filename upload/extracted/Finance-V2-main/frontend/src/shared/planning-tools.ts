/**
 * Position sizing and goal planning — the forward-looking arithmetic.
 *
 * Everything else in `src/shared` measures what already happened; this module
 * answers "what should I do next": how many shares a risk budget buys, what a
 * monthly SIP grows into, what monthly amount a goal demands, and what rate a
 * past journey implies. The same discipline applies as everywhere else in this
 * directory — pure functions, no clock, null for unusable input — because a
 * plan the UI shows must be reproducible in a test to the rupee.
 */

export type PositionSizeInput = {
  capital: number;
  /** Percent of capital the trader accepts losing if the stop is hit. */
  riskPercent: number;
  entry: number;
  stopLoss: number;
  target?: number | null;
};

export type PositionSizePlan = {
  quantity: number;
  positionValue: number;
  /** The rupee amount lost if the stop fires at full quantity. */
  riskAmount: number;
  riskPerShare: number;
  /** Position value as a share of capital — the deployment this plan implies. */
  capitalSharePercent: number;
  /** True when the risk budget sizes a position larger than the account. */
  exceedsCapital: boolean;
  rewardPerShare: number | null;
  rewardRiskRatio: number | null;
  direction: "long" | "short";
};

/**
 * Fixed-fractional position sizing: quantity is derived from the loss the
 * trader has budgeted, not from the capital they happen to hold. Sizing from
 * capital is how one bad trade becomes a drawdown; sizing from risk caps every
 * trade at the same fraction of the account.
 *
 * Direction is inferred from which side of entry the stop sits — a stop below
 * entry only protects a long, a stop above only a short — so the caller cannot
 * pass a direction that contradicts its own stop. A stop equal to entry
 * defines no risk per share (and would divide by zero), so it is unusable
 * input, not a zero-risk trade. Likewise a risk of 100% or more is not a sized
 * trade but the absence of one.
 *
 * Quantity is floored because brokers do not fill fractional equity shares,
 * and rounding up would overshoot the risk budget the user just set. When even
 * one share risks more than the budget, the plan is returned with quantity 0
 * rather than null: "your risk budget cannot afford one share" is advice the
 * caller should show, where null would read as a validation error.
 *
 * A tight stop can legitimately size a position larger than the account. That
 * is reported via `exceedsCapital` instead of silently capping quantity,
 * because capping would change the risk the user asked for without telling
 * them — the honest options (reduce size, or use leverage knowingly) are the
 * caller's to present.
 *
 * `rewardRiskRatio` is quoted only when the target sits on the profitable side
 * of entry for the inferred direction. A "target" below a long entry is a
 * second stop, and printing a ratio for it would dress a data-entry mistake up
 * as a real number. A garbled target (NaN, zero, negative) is treated the same
 * as no target — the sizing itself is still sound and should not be withheld
 * over an optional field.
 */
export function positionSize(input: PositionSizeInput): PositionSizePlan | null {
  if (!input || typeof input !== "object") return null;
  const { capital, riskPercent, entry, stopLoss, target } = input;

  if (![capital, riskPercent, entry, stopLoss].every((value) => Number.isFinite(value))) {
    return null;
  }
  if (capital <= 0 || riskPercent <= 0 || entry <= 0 || stopLoss <= 0) return null;
  if (riskPercent >= 100) return null;
  if (stopLoss === entry) return null;

  const direction: "long" | "short" = stopLoss < entry ? "long" : "short";
  const riskPerShare = Math.abs(entry - stopLoss);
  const riskAmount = (capital * riskPercent) / 100;
  const rawQuantity = Math.floor(riskAmount / riskPerShare);
  const quantity = rawQuantity >= 1 ? rawQuantity : 0;
  const positionValue = quantity * entry;
  const capitalSharePercent = (positionValue / capital) * 100;

  let rewardPerShare: number | null = null;
  let rewardRiskRatio: number | null = null;
  if (typeof target === "number" && Number.isFinite(target) && target > 0) {
    const profitableSide = direction === "long" ? target > entry : target < entry;
    if (profitableSide) {
      rewardPerShare = Math.abs(target - entry);
      rewardRiskRatio = rewardPerShare / riskPerShare;
    }
  }

  // Degenerate magnitudes (subnormal prices against a large budget) can push
  // the arithmetic past Number.MAX_VALUE; an Infinity quantity is not a plan.
  const derived = [quantity, positionValue, riskAmount, riskPerShare, capitalSharePercent];
  if (!derived.every((value) => Number.isFinite(value))) return null;
  if (rewardRiskRatio !== null && !Number.isFinite(rewardRiskRatio)) return null;

  return {
    quantity,
    positionValue,
    riskAmount,
    riskPerShare,
    capitalSharePercent,
    exceedsCapital: positionValue > capital,
    rewardPerShare,
    rewardRiskRatio,
    direction,
  };
}

export type SipFutureValueInput = {
  monthly: number;
  years: number;
  annualReturnPercent: number;
};

/**
 * Future value of a monthly SIP with contributions at the start of each month
 * (an annuity-due): FV = P × ((1+i)^n − 1)/i × (1+i).
 *
 * The monthly rate is the annual rate divided straight by twelve — i = r/12 —
 * not the geometrically exact (1+r)^(1/12) − 1. The naive division is what
 * every mainstream SIP calculator (AMC sites, banks, Groww et al.) uses, and a
 * projection the user cannot reconcile against the figure their own bank shows
 * reads as our bug even when it is the more correct number. Contributions are
 * credited at month start because that is when a SIP mandate actually debits.
 *
 * A zero rate is the formula's 0/0, so it is handled exactly as P × n rather
 * than smudged with a nearby epsilon rate. A monthly rate at or below −100%
 * (annual ≤ −1200) has no meaning — you cannot lose more than everything each
 * month — and returns null.
 */
export function sipFutureValue(input: SipFutureValueInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { monthly, years, annualReturnPercent } = input;

  if (![monthly, years, annualReturnPercent].every((value) => Number.isFinite(value))) {
    return null;
  }
  if (monthly <= 0 || years <= 0) return null;

  const i = annualReturnPercent / 12 / 100;
  if (i <= -1) return null;

  const n = years * 12;
  const futureValue = i === 0 ? monthly * n : monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  return Number.isFinite(futureValue) ? futureValue : null;
}

export type SipForGoalInput = {
  targetAmount: number;
  years: number;
  annualReturnPercent: number;
};

/**
 * The monthly SIP a goal demands — the algebraic inverse of `sipFutureValue`,
 * using the identical i = r/12 convention so the pair round-trips exactly.
 *
 * The result is rounded UP to the next whole rupee. A plan that undershoots
 * its own goal because of rounding is strictly worse than one a rupee heavy,
 * and no platform accepts a paise-denominated SIP mandate anyway. The same
 * rounding gives a floor of ₹1 for trivially small goals.
 */
export function sipForGoal(input: SipForGoalInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { targetAmount, years, annualReturnPercent } = input;

  if (![targetAmount, years, annualReturnPercent].every((value) => Number.isFinite(value))) {
    return null;
  }
  if (targetAmount <= 0 || years <= 0) return null;

  const i = annualReturnPercent / 12 / 100;
  if (i <= -1) return null;

  const n = years * 12;
  const growthFactor = i === 0 ? n : ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  if (!Number.isFinite(growthFactor) || growthFactor <= 0) return null;

  const monthly = Math.ceil(targetAmount / growthFactor);
  return Number.isFinite(monthly) ? monthly : null;
}

export type LumpsumFutureValueInput = {
  amount: number;
  years: number;
  annualReturnPercent: number;
};

/**
 * One-shot investment compounded annually: FV = A × (1 + r)^years.
 *
 * Annual compounding, not monthly, because mutual-fund and index returns are
 * published as annual CAGR figures — the projection and the number the user is
 * plugging into it must share a convention or they silently disagree. A rate
 * of exactly −100% legitimately compounds to zero; anything below it would
 * mean ending with less than nothing, so it returns null.
 */
export function lumpsumFutureValue(input: LumpsumFutureValueInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { amount, years, annualReturnPercent } = input;

  if (![amount, years, annualReturnPercent].every((value) => Number.isFinite(value))) {
    return null;
  }
  if (amount <= 0 || years <= 0) return null;

  const base = 1 + annualReturnPercent / 100;
  if (base < 0) return null;

  const futureValue = amount * Math.pow(base, years);
  return Number.isFinite(futureValue) ? futureValue : null;
}

export type CagrInput = {
  startValue: number;
  endValue: number;
  years: number;
};

/**
 * Compound annual growth rate, as a percent.
 *
 * The geometric rate, not (end − start)/start/years: a 3-year double is
 * ~26% a year, not 33%, and the arithmetic shortcut flatters every multi-year
 * figure. A decline produces a negative CAGR, which is a valid answer rather
 * than an error — only a non-positive start, end, or span is unusable, because
 * a journey through or from zero has no defined growth rate.
 */
export function cagr(input: CagrInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { startValue, endValue, years } = input;

  if (![startValue, endValue, years].every((value) => Number.isFinite(value))) return null;
  if (startValue <= 0 || endValue <= 0 || years <= 0) return null;

  const growthPercent = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
  return Number.isFinite(growthPercent) ? growthPercent : null;
}
