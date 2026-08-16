/**
 * Small planning calculators that answer "when" and "how much longer" rather
 * than "how much".
 *
 * `wealth-tools.ts` projects a plan forward from its inputs; these two invert
 * that. Someone with a target already in mind does not want to try monthly
 * amounts until the future value looks right — they want the horizon, or the
 * gap. Both are closed-form inversions of formulas that module already owns,
 * so the two always agree.
 *
 * Pure and dependency-free.
 */

/** Matches wealth-tools: horizons beyond a century are input errors, not plans. */
const MAX_YEARS = 100;
const MAX_MONTHS = MAX_YEARS * 12;

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export type TimeToGoalInput = {
  /** What is already invested. Zero is valid — starting from nothing. */
  currentAmount: number;
  monthlyInvestment: number;
  targetAmount: number;
  annualReturnPercent: number;
};

export type TimeToGoal = {
  months: number;
  years: number;
  /** Total contributed over the horizon, excluding the starting amount. */
  totalInvested: number;
  /** The target minus everything actually paid in — what growth contributed. */
  growth: number;
  /** True when the starting amount alone already clears the target. */
  alreadyThere: boolean;
};

/**
 * How long until a target is reached, given what is invested now and what is
 * added monthly.
 *
 * Solved by stepping month by month rather than by logarithm. The closed form
 * exists, but it has to special-case a zero rate, a zero contribution and a
 * zero starting balance separately, and each of those is a real input someone
 * will type. Stepping handles all of them with one code path, and the loop is
 * bounded at 100 years — past that the answer is "not on this plan" rather
 * than a number worth quoting.
 *
 * Returns null when the goal is unreachable: no contributions and a rate that
 * cannot grow the starting amount to the target within the cap. That is a
 * genuine answer — quoting 1,200 months would imply the plan works.
 */
export function timeToGoal(input: TimeToGoalInput): TimeToGoal | null {
  if (!input || typeof input !== "object") return null;
  const { currentAmount, monthlyInvestment, targetAmount, annualReturnPercent } = input;

  if (!isPositiveFinite(targetAmount)) return null;
  if (!Number.isFinite(currentAmount) || currentAmount < 0) return null;
  if (!Number.isFinite(monthlyInvestment) || monthlyInvestment < 0) return null;
  if (!Number.isFinite(annualReturnPercent)) return null;

  const monthlyRate = annualReturnPercent / 12 / 100;
  // Below -100% a month the balance would flip sign, which is not a market
  // this models.
  if (monthlyRate <= -1) return null;

  if (currentAmount >= targetAmount) {
    return {
      months: 0,
      years: 0,
      totalInvested: 0,
      growth: 0,
      alreadyThere: true,
    };
  }

  let balance = currentAmount;
  for (let month = 1; month <= MAX_MONTHS; month += 1) {
    // Contribution at the start of the month, matching the SIP convention in
    // wealth-tools so the two modules never disagree about the same plan.
    balance = (balance + monthlyInvestment) * (1 + monthlyRate);
    if (!Number.isFinite(balance)) return null;

    if (balance >= targetAmount) {
      const totalInvested = monthlyInvestment * month;
      return {
        months: month,
        years: round2(month / 12),
        totalInvested: round2(totalInvested),
        growth: round2(targetAmount - currentAmount - totalInvested),
        alreadyThere: false,
      };
    }
  }

  return null;
}

export type CoastFireInput = {
  currentAmount: number;
  targetAmount: number;
  years: number;
  annualReturnPercent: number;
};

export type CoastFire = {
  /** What the current amount grows to untouched over the horizon. */
  projectedAmount: number;
  /** Target minus projected. Zero once the target is already covered. */
  shortfall: number;
  /** True when the existing balance alone reaches the target. */
  onTrack: boolean;
  /** Share of the target the existing balance already covers, 0-100+. */
  coveragePercent: number;
};

/**
 * Whether what is already invested reaches the target on its own, with no
 * further contributions.
 *
 * The idea borrowed from "coast FIRE": there is a point where compounding
 * alone finishes the job, and knowing where that point is changes how hard
 * someone needs to keep saving. Reported alongside the shortfall so a plan
 * that is not there yet still gets a usable number rather than just a "no".
 *
 * `coveragePercent` is deliberately allowed above 100 — being 140% of the way
 * there is information, and clamping it would hide how much headroom a plan
 * actually has.
 */
export function coastFire(input: CoastFireInput): CoastFire | null {
  if (!input || typeof input !== "object") return null;
  const { currentAmount, targetAmount, years, annualReturnPercent } = input;

  if (!isPositiveFinite(targetAmount)) return null;
  if (!Number.isFinite(currentAmount) || currentAmount < 0) return null;
  if (!Number.isFinite(years) || years <= 0 || years > MAX_YEARS) return null;
  if (!Number.isFinite(annualReturnPercent) || annualReturnPercent <= -100) return null;

  const projected = currentAmount * Math.pow(1 + annualReturnPercent / 100, years);
  if (!Number.isFinite(projected)) return null;

  const shortfall = Math.max(0, targetAmount - projected);
  return {
    projectedAmount: round2(projected),
    shortfall: round2(shortfall),
    onTrack: projected >= targetAmount,
    coveragePercent: round2((projected / targetAmount) * 100),
  };
}
