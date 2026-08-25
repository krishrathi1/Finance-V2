/**
 * The two mutual-fund questions that move the most money and get asked least.
 *
 *  - **What does the expense ratio actually cost?** A regular plan charges
 *    roughly 1% a year more than the direct plan of the same fund, for the
 *    same portfolio and the same manager. Stated as "1%" it sounds like
 *    rounding. Compounded over twenty years it is commonly a fifth of the
 *    final corpus, because the fee is levied on the whole balance every year
 *    including the returns the earlier fees would have earned.
 *
 *  - **How long does a corpus survive withdrawals?** An SWP is the standard
 *    way to draw an income from a portfolio, and the standard mistake is to
 *    check whether the first year's withdrawal looks affordable against the
 *    return. It does, right up until inflation lifts the withdrawal past what
 *    the corpus earns and the balance starts falling in a way that
 *    accelerates.
 *
 * Both are simulated month by month rather than solved in closed form —
 * withdrawals are monthly, indexation is annual, and a closed form would have
 * to fudge one or the other.
 *
 * Pure and dependency-free.
 */

const MAX_YEARS = 100;
const MONTHS_PER_YEAR = 12;
/** A corpus still standing after a century is perpetual for any real purpose. */
const MAX_SIMULATION_MONTHS = MAX_YEARS * MONTHS_PER_YEAR;

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Monthly rate whose twelve-fold compounding equals the annual one. */
const monthlyRate = (annualPercent: number): number =>
  Math.pow(1 + annualPercent / 100, 1 / MONTHS_PER_YEAR) - 1;

export type ExpenseRatioInput = {
  /** Lump sum invested up front. Either this or `monthlySip` must be positive. */
  amount?: number;
  /** Monthly SIP contribution, invested at the start of each month. */
  monthlySip?: number;
  years: number;
  /** Return before any fees are taken. */
  grossReturnPercent: number;
  /** Expense ratio of the plan being considered. */
  expenseRatioPercent: number;
  /** The cheaper plan to compare against — a direct plan of the same fund. */
  comparisonExpenseRatioPercent?: number;
};

export type PlanOutcome = {
  expenseRatioPercent: number;
  netAnnualPercent: number;
  finalValue: number;
  /** Everything paid in, across the lump sum and every instalment. */
  totalInvested: number;
  /** Cumulative fees, measured as what the fee-free corpus would have been. */
  totalFeesPaid: number;
};

export type ExpenseRatioDrag = {
  plan: PlanOutcome;
  comparison: PlanOutcome;
  /** What the cheaper plan leaves you with, over the costlier one. */
  difference: number;
  /** That difference as a share of the costlier plan's final value. */
  differencePercent: number;
  /** The fee-free corpus, to show what both plans give up. */
  grossValue: number;
};

const simulateFund = (
  amount: number,
  monthlySip: number,
  months: number,
  netAnnual: number
): { finalValue: number; totalInvested: number } => {
  const rate = monthlyRate(netAnnual);
  let balance = amount;
  let totalInvested = amount;

  for (let month = 0; month < months; month += 1) {
    // Contribution goes in at the start of the month, so it earns that month.
    balance += monthlySip;
    totalInvested += monthlySip;
    balance *= 1 + rate;
  }

  return { finalValue: balance, totalInvested };
};

/**
 * What an expense ratio costs over a holding period, against a cheaper plan.
 *
 * The fee is modelled as a haircut on the growth factor — `(1 + gross) x
 * (1 - fee)` — rather than as a subtraction from the return. A TER is charged
 * on assets, not on gains, so it is taken whether or not the fund made money;
 * subtracting it from the return would quietly understate it in bad years and
 * overstate the net figure people are shown.
 *
 * `totalFeesPaid` is the gap against a hypothetical zero-fee version of the
 * same fund, which is the only honest measure: the fee's true cost is not the
 * amount deducted but the amount deducted plus everything it would have gone
 * on to earn.
 */
export function expenseRatioDrag(input: ExpenseRatioInput): ExpenseRatioDrag | null {
  if (!input || typeof input !== "object") return null;
  const { years, grossReturnPercent, expenseRatioPercent } = input;

  if (!isFinitePositive(years) || years > MAX_YEARS) return null;
  if (!Number.isFinite(grossReturnPercent)) return null;
  if (!isFiniteNonNegative(expenseRatioPercent) || expenseRatioPercent >= 100) return null;

  const amount = isFiniteNonNegative(input.amount) ? input.amount : 0;
  const monthlySip = isFiniteNonNegative(input.monthlySip) ? input.monthlySip : 0;
  if (amount <= 0 && monthlySip <= 0) return null;

  const comparisonPercent = isFiniteNonNegative(input.comparisonExpenseRatioPercent)
    ? input.comparisonExpenseRatioPercent
    : 0;
  if (comparisonPercent >= 100) return null;

  const months = Math.round(years * MONTHS_PER_YEAR);
  if (months <= 0) return null;

  // A TER is levied on assets, so it scales the growth factor rather than
  // reducing the return.
  const netFor = (fee: number): number =>
    ((1 + grossReturnPercent / 100) * (1 - fee / 100) - 1) * 100;

  const netPlan = netFor(expenseRatioPercent);
  const netComparison = netFor(comparisonPercent);

  const planRun = simulateFund(amount, monthlySip, months, netPlan);
  const comparisonRun = simulateFund(amount, monthlySip, months, netComparison);
  const grossRun = simulateFund(amount, monthlySip, months, grossReturnPercent);

  const values = [planRun.finalValue, comparisonRun.finalValue, grossRun.finalValue];
  if (!values.every(Number.isFinite)) return null;

  const planFinal = round2(planRun.finalValue);
  const comparisonFinal = round2(comparisonRun.finalValue);
  const grossFinal = round2(grossRun.finalValue);
  // Derived from the rounded figures so a reader subtracting the two numbers
  // on screen gets the number printed beside them.
  const difference = round2(comparisonFinal - planFinal);

  return {
    plan: {
      expenseRatioPercent: round2(expenseRatioPercent),
      netAnnualPercent: round2(netPlan),
      finalValue: planFinal,
      totalInvested: round2(planRun.totalInvested),
      totalFeesPaid: round2(grossFinal - planFinal),
    },
    comparison: {
      expenseRatioPercent: round2(comparisonPercent),
      netAnnualPercent: round2(netComparison),
      finalValue: comparisonFinal,
      totalInvested: round2(comparisonRun.totalInvested),
      totalFeesPaid: round2(grossFinal - comparisonFinal),
    },
    difference,
    differencePercent: planFinal > 0 ? round2((difference / planFinal) * 100) : 0,
    grossValue: grossFinal,
  };
}

export type SwpInput = {
  corpus: number;
  monthlyWithdrawal: number;
  /** Expected annual return on whatever the corpus stays invested in. */
  returnPercent: number;
  /** Annual step-up applied to the withdrawal, to hold its buying power. */
  inflationPercent?: number;
};

export type SwpPlan = {
  /** Months the corpus lasts, or null if it outlives a 100-year horizon. */
  monthsLasted: number | null;
  /** The same figure in years, or null when it never depletes. */
  yearsLasted: number | null;
  /** True when the corpus survives the full horizon. */
  sustainable: boolean;
  totalWithdrawn: number;
  /** Balance at the end of the horizon; zero when the corpus ran out. */
  finalBalance: number;
  /** The last monthly withdrawal made, after every indexation step. */
  finalMonthlyWithdrawal: number;
  /**
   * The largest starting withdrawal that survives indefinitely, holding its
   * buying power. Zero when returns do not beat inflation.
   */
  sustainableMonthlyWithdrawal: number;
};

/**
 * How long a corpus survives a monthly withdrawal that rises with inflation.
 *
 * Simulated rather than solved because the two schedules differ: money is
 * drawn monthly and the withdrawal is indexed annually. A closed-form
 * annuity would have to pretend one of those happens on the other's schedule.
 *
 * The withdrawal is taken at the START of each month, before that month's
 * return — the conservative and realistic ordering, since someone living on
 * an SWP needs the money at the beginning of the month, not after it has
 * compounded.
 *
 * `sustainableMonthlyWithdrawal` is the useful counterfactual: the corpus
 * multiplied by the REAL monthly return, which is the most that can be drawn
 * without eroding buying power. When returns do not beat inflation there is no
 * such amount, and it is reported as zero rather than as a negative figure
 * dressed up as guidance.
 */
export function swpPlan(input: SwpInput): SwpPlan | null {
  if (!input || typeof input !== "object") return null;
  const { corpus, monthlyWithdrawal, returnPercent } = input;

  if (!isFinitePositive(corpus)) return null;
  if (!isFiniteNonNegative(monthlyWithdrawal)) return null;
  if (!Number.isFinite(returnPercent) || returnPercent <= -100) return null;

  const inflationPercent = isFiniteNonNegative(input.inflationPercent)
    ? input.inflationPercent
    : 0;

  const rate = monthlyRate(returnPercent);
  if (!Number.isFinite(rate)) return null;

  let balance = corpus;
  let withdrawal = monthlyWithdrawal;
  let totalWithdrawn = 0;
  let monthsLasted: number | null = null;
  let lastWithdrawal = monthlyWithdrawal;

  for (let month = 0; month < MAX_SIMULATION_MONTHS; month += 1) {
    // Index the withdrawal at each anniversary, before that month's draw.
    if (month > 0 && month % MONTHS_PER_YEAR === 0) {
      withdrawal *= 1 + inflationPercent / 100;
    }

    // A corpus that funded its last withdrawal exactly is spent, and lasted
    // the months it paid for — not one more in which it pays nothing.
    if (balance <= 0) {
      monthsLasted = month;
      break;
    }

    if (withdrawal > balance) {
      // The corpus cannot fund a full withdrawal: it is exhausted here, and
      // what remains is paid out as a final partial amount.
      totalWithdrawn += balance;
      lastWithdrawal = balance;
      balance = 0;
      monthsLasted = month + 1;
      break;
    }

    balance -= withdrawal;
    totalWithdrawn += withdrawal;
    lastWithdrawal = withdrawal;
    balance *= 1 + rate;

    if (!Number.isFinite(balance)) return null;
  }

  // Real return is what decides perpetuity — a corpus growing slower than the
  // withdrawal is indexed is being spent down however healthy the nominal
  // number looks.
  const realAnnual = (1 + returnPercent / 100) / (1 + inflationPercent / 100) - 1;
  const realMonthly = Math.pow(1 + realAnnual, 1 / MONTHS_PER_YEAR) - 1;
  const sustainableMonthlyWithdrawal =
    Number.isFinite(realMonthly) && realMonthly > 0 ? corpus * realMonthly : 0;

  const depleted = monthsLasted !== null;

  return {
    monthsLasted,
    yearsLasted: monthsLasted === null ? null : round2(monthsLasted / MONTHS_PER_YEAR),
    sustainable: !depleted,
    totalWithdrawn: round2(totalWithdrawn),
    finalBalance: depleted ? 0 : round2(balance),
    finalMonthlyWithdrawal: round2(lastWithdrawal),
    sustainableMonthlyWithdrawal: round2(sustainableMonthlyWithdrawal),
  };
}
