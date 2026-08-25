/**
 * Prepay the loan, or invest the surplus?
 *
 * Asked more than almost any other personal-finance question in India, and
 * usually answered by comparing the loan rate to an expected equity return —
 * "8.5% loan, 12% equity, obviously invest". That comparison is wrong twice.
 *
 * It is wrong once because a loan saving is TAX-FREE and an investment gain
 * is not. Beating an 8.5% loan with equity taxed at 12.5% needs about 9.7%
 * before tax, not 8.5%.
 *
 * It is wrong again because it never gets to a common finishing line. If you
 * prepay, the loan ends years early and the EMI is then free to invest for
 * all the months that remain — money the naive comparison silently discards.
 * The only fair test runs both choices to the SAME month and compares what
 * you are left holding.
 *
 * That is what this does:
 *
 *  - **Prepay:** hand the surplus to the bank now, finish the loan early,
 *    then invest the freed EMI every month until the original end date.
 *  - **Invest:** keep the loan running its full term and put the surplus to
 *    work from day one.
 *
 * Both spend exactly the same cash — surplus plus one EMI a month for the
 * original tenure — so whatever is left at the end is a clean comparison.
 *
 * The output worth reading is `breakEvenReturnPercent`: the pre-tax return
 * investing must clear to be worth choosing. Below it, prepaying wins — and
 * prepaying wins with certainty, which the expected return does not offer.
 *
 * Pure and dependency-free.
 */

const MONTHS_PER_YEAR = 12;
const MAX_MONTHS = 480;

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Indian lenders quote an annual rate and charge a twelfth of it each month.
 * This is simple division, NOT the twelfth root that a true annual
 * equivalent would use — using the latter would understate every EMI.
 */
const loanMonthlyRate = (annualPercent: number): number => annualPercent / 100 / MONTHS_PER_YEAR;

/** Investment returns do compound, so these convert properly. */
const investMonthlyRate = (annualPercent: number): number =>
  Math.pow(1 + annualPercent / 100, 1 / MONTHS_PER_YEAR) - 1;

/** The standard amortisation formula. */
export function emiFor(principal: number, annualRatePercent: number, months: number): number | null {
  if (!isFinitePositive(principal) || !isFinitePositive(months)) return null;
  if (!isFiniteNonNegative(annualRatePercent)) return null;

  const rate = loanMonthlyRate(annualRatePercent);
  if (rate === 0) return principal / months;

  const factor = Math.pow(1 + rate, months);
  const emi = (principal * rate * factor) / (factor - 1);
  return Number.isFinite(emi) && emi > 0 ? emi : null;
}

/**
 * How many months a given EMI takes to clear a principal.
 *
 * Returns null when the EMI cannot cover even the monthly interest — at that
 * point the balance grows rather than falls and there is no repayment date to
 * report.
 */
function monthsToRepay(principal: number, emi: number, rate: number): number | null {
  if (principal <= 0) return 0;
  if (rate === 0) return principal / emi;
  if (emi <= principal * rate) return null;

  const months = -Math.log(1 - (principal * rate) / emi) / Math.log(1 + rate);
  return Number.isFinite(months) && months >= 0 ? months : null;
}

/** Future value of a monthly contribution made at the start of each month. */
function sipFutureValue(monthly: number, months: number, rate: number): number {
  if (months <= 0) return 0;
  if (rate === 0) return monthly * months;
  return monthly * ((Math.pow(1 + rate, months) - 1) / rate) * (1 + rate);
}

export type PrepayInput = {
  outstandingPrincipal: number;
  annualRatePercent: number;
  /** Months still to run on the current schedule. */
  remainingMonths: number;
  /** The lump sum available, to prepay with or to invest. */
  surplus: number;
  /** Expected pre-tax annual return if the surplus is invested instead. */
  expectedReturnPercent: number;
  /** Tax on investment gains. Defaults to the 12.5% long-term equity rate. */
  taxPercent?: number;
};

export type PrepayComparison = {
  emi: number;
  /** Interest paid over the full original schedule, with no prepayment. */
  originalInterest: number;
  /** Interest paid if the surplus goes to the bank now. */
  interestAfterPrepay: number;
  interestSaved: number;
  /** Whole months the loan finishes early. */
  monthsSaved: number;
  /** Wealth at the original end date if you prepay, then invest the freed EMI. */
  wealthIfPrepaid: number;
  /** Wealth at the same date if you invest the surplus and run the loan out. */
  wealthIfInvested: number;
  /** Positive when investing wins, negative when prepaying does. */
  advantageOfInvesting: number;
  investingWins: boolean;
  /**
   * Pre-tax annual return at which the two choices break even. Null when no
   * return inside a plausible band flips the answer.
   */
  breakEvenReturnPercent: number | null;
  /** The loan rate expressed as the pre-tax return needed to match it. */
  taxAdjustedLoanRatePercent: number;
};

/**
 * Compare prepaying a loan against investing the same money, run to a common
 * finishing line.
 *
 * `monthsSaved` is rounded to whole months because a loan closes on a payment
 * date, not partway through one, and the freed-EMI investment can only start
 * once it has actually closed.
 *
 * `breakEvenReturnPercent` is found by bisection. Both branches grow with the
 * assumed return — the prepay branch invests the freed EMI at the same rate —
 * but the invest branch has the longer runway, so it overtakes as returns
 * rise. That single crossing is what bisection finds.
 */
export function prepayVsInvest(input: PrepayInput): PrepayComparison | null {
  if (!input || typeof input !== "object") return null;
  const { outstandingPrincipal, annualRatePercent, remainingMonths, surplus } = input;
  const { expectedReturnPercent } = input;

  if (!isFinitePositive(outstandingPrincipal)) return null;
  if (!isFinitePositive(annualRatePercent)) return null;
  if (!isFinitePositive(remainingMonths) || remainingMonths > MAX_MONTHS) return null;
  if (!isFinitePositive(surplus)) return null;
  if (!Number.isFinite(expectedReturnPercent) || expectedReturnPercent <= -100) return null;
  // Prepaying more than is owed is a full closure, not a comparison.
  if (surplus >= outstandingPrincipal) return null;

  const taxPercent =
    isFiniteNonNegative(input.taxPercent) && input.taxPercent < 100 ? input.taxPercent : 12.5;

  const months = Math.round(remainingMonths);
  const loanRate = loanMonthlyRate(annualRatePercent);

  const emi = emiFor(outstandingPrincipal, annualRatePercent, months);
  if (emi === null) return null;

  const reducedPrincipal = outstandingPrincipal - surplus;
  const monthsAfter = monthsToRepay(reducedPrincipal, emi, loanRate);
  if (monthsAfter === null) return null;

  const originalInterest = emi * months - outstandingPrincipal;
  // The loan closes on a payment date, so the freed EMI starts the month after.
  const wholeMonthsAfter = Math.ceil(monthsAfter);
  const interestAfterPrepay = emi * monthsAfter - reducedPrincipal;
  const monthsSaved = Math.max(0, months - wholeMonthsAfter);

  /** Terminal wealth under both branches, at a given pre-tax return. */
  const wealthAt = (returnPercent: number): { prepaid: number; invested: number } | null => {
    const rate = investMonthlyRate(returnPercent);
    if (!Number.isFinite(rate)) return null;

    // Prepay: nothing invested until the loan closes, then the EMI every
    // month until the original end date.
    const grossPrepaid = sipFutureValue(emi, monthsSaved, rate);
    const contributedPrepaid = emi * monthsSaved;
    const prepaid =
      grossPrepaid - Math.max(0, grossPrepaid - contributedPrepaid) * (taxPercent / 100);

    // Invest: the surplus works for the whole original tenure.
    const grossInvested = surplus * Math.pow(1 + rate, months);
    const invested =
      grossInvested - Math.max(0, grossInvested - surplus) * (taxPercent / 100);

    if (!Number.isFinite(prepaid) || !Number.isFinite(invested)) return null;
    return { prepaid, invested };
  };

  const atExpected = wealthAt(expectedReturnPercent);
  if (atExpected === null) return null;

  const wealthIfPrepaid = round2(atExpected.prepaid);
  const wealthIfInvested = round2(atExpected.invested);

  // Bisect for the crossing. The invest branch has the longer runway, so it
  // starts behind at low returns and overtakes as they rise.
  let breakEvenReturnPercent: number | null = null;
  const lowEnd = wealthAt(0);
  const highEnd = wealthAt(50);
  if (
    lowEnd !== null &&
    highEnd !== null &&
    lowEnd.invested < lowEnd.prepaid &&
    highEnd.invested > highEnd.prepaid
  ) {
    let lo = 0;
    let hi = 50;
    for (let step = 0; step < 200; step += 1) {
      const mid = (lo + hi) / 2;
      const point = wealthAt(mid);
      if (point === null) break;
      if (point.invested < point.prepaid) lo = mid;
      else hi = mid;
    }
    breakEvenReturnPercent = round2((lo + hi) / 2);
  }

  return {
    emi: round2(emi),
    originalInterest: round2(originalInterest),
    interestAfterPrepay: round2(interestAfterPrepay),
    interestSaved: round2(originalInterest - interestAfterPrepay),
    monthsSaved,
    wealthIfPrepaid,
    wealthIfInvested,
    // Derived from the rounded figures so the on-screen subtraction agrees.
    advantageOfInvesting: round2(wealthIfInvested - wealthIfPrepaid),
    investingWins: wealthIfInvested > wealthIfPrepaid,
    breakEvenReturnPercent,
    // A tax-free saving of r% needs r/(1-t) before tax to be matched.
    taxAdjustedLoanRatePercent: round2(annualRatePercent / (1 - taxPercent / 100)),
  };
}
