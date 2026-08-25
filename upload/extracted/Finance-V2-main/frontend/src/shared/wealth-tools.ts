/**
 * Long-horizon planning calculators — the decade-scale arithmetic.
 *
 * `planning-tools` answers "what does this plan grow into" over a single set of
 * assumptions. This module handles the questions that only appear once the
 * horizon is long enough for second-order effects to dominate: an instalment
 * that rises with income, inflation eating the answer from both ends, a loan
 * repaid out of the same cash flow, and the corpus a retirement actually needs.
 *
 * Same discipline as the rest of `src/shared` — pure functions, one input
 * object, no clock, no throwing, null for input the arithmetic cannot honestly
 * price. Every monetary figure is rounded to paise on the way out, because
 * these numbers are shown side by side in a UI and must reconcile on screen
 * rather than only in double precision.
 */

/**
 * Paise rounding — money is quoted in paise, so 2dp is exact, not lossy.
 *
 * The scale-round-unscale trick overflows for magnitudes past ~1.8e306, which
 * would turn a perfectly finite answer into Infinity on its way out the door.
 * Values that large are already integral (a double above 2^53 has an ULP of at
 * least 1, so there is no fractional part left to round), so returning them
 * untouched is exact rather than a fallback.
 */
const round2 = (value: number): number => {
  const scaled = Math.round(value * 100);
  return Number.isFinite(scaled) ? scaled / 100 : value;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Instalments and repayments happen in whole months — no mandate debits half a
 * month — so a horizon is rounded to the nearest month rather than truncated.
 * Truncating would let a float artifact (10 years arriving as 119.99999 months)
 * silently drop an entire instalment from the plan.
 */
const monthsFromYears = (years: number): number => Math.round(years * 12);

/**
 * The longest horizon this module will project, applied to every year input it
 * takes. Beyond a century nothing here is a plan — no SIP, loan or retirement
 * runs longer than a life — and unbounded horizons are where the arithmetic
 * starts producing finite but absurd answers (a nine-quadrillion-month loan
 * quotes an EMI of eight paise) that are harder to spot than an overflow.
 *
 * Over-long horizons are rejected rather than clamped: silently shortening
 * someone's question and answering the shorter one is the kind of help that
 * reads as a bug.
 */
const MAX_YEARS = 100;

export type StepUpSipInput = {
  monthly: number;
  years: number;
  annualReturnPercent: number;
  /** Percent the instalment rises by on each anniversary. 0 is a plain SIP. */
  annualStepUpPercent: number;
};

export type StepUpSipPlan = {
  futureValue: number;
  totalInvested: number;
  wealthGained: number;
  /** The instalment being paid in the final month, after every step-up. */
  finalMonthlyAmount: number;
};

/**
 * A SIP whose instalment rises a fixed percent each year — the default plan
 * most Indian advisers now recommend, because contributions that stay flat for
 * a decade are a real-terms cut as salaries and prices both climb.
 *
 * The balance is rolled forward month by month instead of via a closed form.
 * A step-up SIP with annual increments has a closed form only as a sum of
 * twelve-month annuities, and that expression is far easier to get subtly wrong
 * than a loop that does literally what the mandate does: debit, then grow.
 * Twelve hundred iterations at most (see `MAX_YEARS`) is free.
 *
 * The instalment steps up on the anniversary, so a ten-year plan sees NINE
 * increases, not ten — the first year is invested at the starting amount. This
 * is what a real step-up mandate does, and it is the difference between our
 * projection and the user's bank statement if we got it wrong.
 *
 * Conventions are inherited from `sipFutureValue` so the two agree to the
 * rupee when the step-up is zero: the monthly rate is the annual rate divided
 * straight by twelve (what every AMC calculator uses), and the contribution is
 * credited at the start of the month, when the mandate actually debits.
 *
 * A step-up below −100% would turn the instalment negative — a redemption, not
 * a contribution — so it is rejected. Exactly −100% (contribute in year one,
 * then stop) is degenerate but coherent, and is allowed.
 */
export function stepUpSip(input: StepUpSipInput): StepUpSipPlan | null {
  if (!input || typeof input !== "object") return null;
  const { monthly, years, annualReturnPercent, annualStepUpPercent } = input;

  if (![monthly, years, annualReturnPercent, annualStepUpPercent].every(isFiniteNumber)) {
    return null;
  }
  if (monthly <= 0 || years <= 0) return null;
  if (years > MAX_YEARS) return null;
  if (annualStepUpPercent < -100) return null;

  const monthlyRate = annualReturnPercent / 12 / 100;
  if (monthlyRate <= -1) return null;

  const months = monthsFromYears(years);
  if (months < 1) return null;

  const stepFactor = 1 + annualStepUpPercent / 100;
  const growthFactor = 1 + monthlyRate;

  let instalment = monthly;
  let balance = 0;
  let invested = 0;

  for (let month = 0; month < months; month += 1) {
    // Month 0 is the first debit at the opening amount; every twelfth month
    // after that is an anniversary, and the instalment rises before it is paid.
    if (month > 0 && month % 12 === 0) instalment *= stepFactor;
    balance = (balance + instalment) * growthFactor;
    invested += instalment;
  }

  if (!Number.isFinite(balance) || !Number.isFinite(invested) || !Number.isFinite(instalment)) {
    return null;
  }

  const futureValue = round2(balance);
  const totalInvested = round2(invested);

  return {
    futureValue,
    totalInvested,
    // Derived from the rounded pair, not the raw one, so the three figures the
    // UI prints together add up exactly as printed.
    wealthGained: round2(futureValue - totalInvested),
    finalMonthlyAmount: round2(instalment),
  };
}

export type RealReturnInput = {
  nominalReturnPercent: number;
  inflationPercent: number;
};

/**
 * The return that survives inflation, via the Fisher relation:
 * ((1 + n) / (1 + i) − 1) × 100.
 *
 * NOT the naive n − i. Subtraction treats inflation as a flat toll, but
 * inflation is applied to the grown amount, so the erosion compounds with the
 * return. At 12% nominal and 6% inflation the naive answer is 6.00%; the true
 * real return is 5.66% — a 34 bps overstatement that, compounded over a
 * 25-year retirement plan, is worth several lakh of corpus. The gap widens with
 * the level of both rates, which is exactly the regime Indian planning sits in,
 * so the shortcut is at its worst here.
 *
 * It is evaluated as (n − i) / (1 + i/100), which is algebraically the same
 * expression rearranged, but numerically better behaved in the two places that
 * matter. It never subtracts two nearly-equal ratios, so a return that barely
 * beats inflation — the case where the sign of the answer is the whole point —
 * keeps its precision instead of losing it to cancellation. And it makes the
 * zero-inflation identity exact: the ratio form returns 12.345677999999992 for
 * a nominal 12.345678, which is a rounding artifact presented as a rate.
 *
 * Deflation of 100% or worse would divide by zero or flip the sign of money
 * itself, so it returns null. The result is deliberately NOT rounded — callers
 * chain it into corpus projections, where a rate truncated to 2dp compounds
 * into a visible error over a 25-year retirement.
 */
export function realReturn(input: RealReturnInput): number | null {
  if (!input || typeof input !== "object") return null;
  const { nominalReturnPercent, inflationPercent } = input;

  if (![nominalReturnPercent, inflationPercent].every(isFiniteNumber)) return null;
  if (inflationPercent <= -100) return null;

  const real = (nominalReturnPercent - inflationPercent) / (1 + inflationPercent / 100);
  return Number.isFinite(real) ? real : null;
}

export type InflationAdjustedInput = {
  amount: number;
  years: number;
  inflationPercent: number;
};

export type InflationAdjustedValue = {
  /** Rupees needed in `years` to buy what `amount` buys today. */
  futureNominalValue: number;
  /** What `amount` received in `years` is worth in today's money. */
  todaysPurchasingPower: number;
};

/**
 * Both directions of the inflation question at once, because users conflate
 * them: what today's ₹X will cost later, and what a promised future ₹X is
 * actually worth now. The first is the number that makes a goal look
 * frighteningly large; the second is the number that makes a maturity value
 * look disappointingly small. Showing only one of them is how a plan ends up
 * targeting a corpus that was already obsolete when it was set.
 *
 * Unlike the plans in this module, a horizon of zero is allowed here: "what is
 * ₹X worth today" has an exact answer — ₹X — and a caller sweeping a slider
 * from 0 should get that rather than a null it has to special-case.
 *
 * Deflation of 100% or worse means prices reach zero, at which point today's
 * money has infinite purchasing power; that is not an answer, so it is null.
 */
export function inflationAdjustedValue(
  input: InflationAdjustedInput
): InflationAdjustedValue | null {
  if (!input || typeof input !== "object") return null;
  const { amount, years, inflationPercent } = input;

  if (![amount, years, inflationPercent].every(isFiniteNumber)) return null;
  if (amount <= 0 || years < 0 || years > MAX_YEARS) return null;
  if (inflationPercent <= -100) return null;

  const factor = Math.pow(1 + inflationPercent / 100, years);
  if (!Number.isFinite(factor) || factor <= 0) return null;

  const futureNominalValue = amount * factor;
  const todaysPurchasingPower = amount / factor;
  if (!Number.isFinite(futureNominalValue) || !Number.isFinite(todaysPurchasingPower)) return null;

  return {
    futureNominalValue: round2(futureNominalValue),
    todaysPurchasingPower: round2(todaysPurchasingPower),
  };
}

export type EmiInput = {
  principal: number;
  annualRatePercent: number;
  years: number;
};

export type EmiBreakdown = {
  emi: number;
  totalPayment: number;
  totalInterest: number;
};

/**
 * The standard reducing-balance EMI: P × r × (1+r)^n / ((1+r)^n − 1), with
 * r = annual/12/100 and n = years × 12 — the formula every Indian lender's
 * sanction letter is built on, so the figure here can be checked against theirs.
 *
 * A zero rate is the formula's 0/0 and is handled exactly as P/n rather than
 * approximated with a nearby epsilon. The same branch catches a rate so small
 * that (1+r)^n is indistinguishable from 1 in double precision: the limit of
 * the formula as r → 0 is P/n, so returning it is the correct answer, not a
 * fudge to avoid a division by zero.
 *
 * A negative rate is rejected rather than computed. No lender in this market
 * pays you to borrow, and the formula's output there is a plausible-looking
 * number that would be quietly wrong on screen.
 *
 * `totalPayment` is built from the UNROUNDED EMI, not from the rounded figure
 * quoted alongside it. No constant paise-denominated instalment sums to the
 * principal exactly — ₹10L over 12 months at 0% needs ₹83,333.3333 a month, and
 * twelve debits of the rounded ₹83,333.33 land four paise short — so the two
 * cannot both be exact. Anchoring the total to the exact schedule keeps
 * `totalInterest` non-negative, which matters because "total interest: −₹0.04"
 * on an interest-free loan reads as a broken calculator, whereas the few paise
 * of residue is precisely what a real lender settles in the final instalment.
 */
export function emiCalculator(input: EmiInput): EmiBreakdown | null {
  if (!input || typeof input !== "object") return null;
  const { principal, annualRatePercent, years } = input;

  if (![principal, annualRatePercent, years].every(isFiniteNumber)) return null;
  if (principal <= 0 || years <= 0 || years > MAX_YEARS) return null;
  if (annualRatePercent < 0) return null;

  const months = monthsFromYears(years);
  if (months < 1) return null;

  const monthlyRate = annualRatePercent / 12 / 100;
  const growth = Math.pow(1 + monthlyRate, months);
  if (!Number.isFinite(growth)) return null;

  const denominator = growth - 1;
  const rawEmi =
    monthlyRate === 0 || denominator === 0
      ? principal / months
      : (principal * monthlyRate * growth) / denominator;
  if (!Number.isFinite(rawEmi) || rawEmi <= 0) return null;

  const totalPayment = round2(rawEmi * months);
  if (!Number.isFinite(totalPayment)) return null;

  return {
    emi: round2(rawEmi),
    totalPayment,
    totalInterest: round2(totalPayment - principal),
  };
}

export type RetirementCorpusInput = {
  monthlyExpenseToday: number;
  yearsToRetirement: number;
  inflationPercent: number;
  postRetirementYears: number;
  postRetirementReturnPercent: number;
};

export type RetirementCorpusPlan = {
  corpusRequired: number;
  monthlyExpenseAtRetirement: number;
};

/**
 * The corpus a retirement needs, in two steps: inflate today's spending to the
 * retirement date, then price the annuity that funds that spending for the
 * whole of retirement.
 *
 * Skipping the first step is the single most common planning error — a corpus
 * sized against today's ₹50,000 a month is roughly half of what is needed
 * twenty years out at 6% inflation, and the error is invisible until it is far
 * too late to fix.
 *
 * Withdrawals are priced as an annuity-DUE: the first month's expenses are
 * drawn on day one of retirement, so that instalment never earns a month's
 * return. Pricing it as an ordinary annuity understates the corpus by exactly
 * one month of growth — small in percent, lakhs in rupees.
 *
 * The withdrawal stream is level, so `postRetirementReturnPercent` should be
 * entered as a REAL (post-inflation) return if spending is expected to keep
 * pace with prices during retirement — pair it with `realReturn`. A nominal
 * figure here prices a retiree whose spending never rises again, which for a
 * 25-year retirement is not a plan. A zero rate is handled exactly as expense ×
 * months, which is precisely the "my real return is nil" case that convention
 * makes common.
 *
 * `yearsToRetirement` of 0 is allowed — retiring today is a real question, and
 * the answer is simply today's expense uninflated.
 */
export function retirementCorpus(input: RetirementCorpusInput): RetirementCorpusPlan | null {
  if (!input || typeof input !== "object") return null;
  const {
    monthlyExpenseToday,
    yearsToRetirement,
    inflationPercent,
    postRetirementYears,
    postRetirementReturnPercent,
  } = input;

  const values = [
    monthlyExpenseToday,
    yearsToRetirement,
    inflationPercent,
    postRetirementYears,
    postRetirementReturnPercent,
  ];
  if (!values.every(isFiniteNumber)) return null;
  if (monthlyExpenseToday <= 0) return null;
  if (yearsToRetirement < 0 || postRetirementYears <= 0) return null;
  if (yearsToRetirement > MAX_YEARS || postRetirementYears > MAX_YEARS) return null;
  if (inflationPercent <= -100) return null;

  const monthlyRate = postRetirementReturnPercent / 12 / 100;
  if (monthlyRate <= -1) return null;

  const retirementMonths = monthsFromYears(postRetirementYears);
  if (retirementMonths < 1) return null;

  const inflationFactor = Math.pow(1 + inflationPercent / 100, yearsToRetirement);
  if (!Number.isFinite(inflationFactor) || inflationFactor < 0) return null;

  const expenseAtRetirement = monthlyExpenseToday * inflationFactor;
  if (!Number.isFinite(expenseAtRetirement)) return null;

  const decay = Math.pow(1 + monthlyRate, -retirementMonths);
  if (!Number.isFinite(decay)) return null;

  const remaining = 1 - decay;
  // As the rate approaches zero the annuity factor approaches the plain month
  // count; taking that limit is exact, not an approximation of a divide-by-zero.
  const annuityFactor =
    monthlyRate === 0 || remaining === 0
      ? retirementMonths
      : (remaining / monthlyRate) * (1 + monthlyRate);
  if (!Number.isFinite(annuityFactor) || annuityFactor <= 0) return null;

  const corpus = expenseAtRetirement * annuityFactor;
  if (!Number.isFinite(corpus)) return null;

  return {
    corpusRequired: round2(corpus),
    monthlyExpenseAtRetirement: round2(expenseAtRetirement),
  };
}

export type RuleOf72Input = {
  annualReturnPercent: number;
};

/**
 * Years for money to double, by the rule of 72.
 *
 * It is an approximation — the exact answer is ln2 / ln(1+r), which at 12%
 * gives 6.12 years against the rule's 6.00 — but 72 is the number every
 * investor already carries in their head, and it is chosen because it divides
 * cleanly by 2, 3, 4, 6, 8, 9 and 12 while being most accurate right around the
 * 8% band where long-run equity conversations happen. Quoting the exact
 * logarithm here would be more precise and less useful: the point of this
 * function is the mental shortcut, not the decimal.
 *
 * Rounded to 2dp because "6.000000000000001 years" is false precision on a rule
 * of thumb. A non-positive rate never doubles anything, so it is null rather
 * than a negative or infinite doubling time.
 */
export function ruleOf72(input: RuleOf72Input): number | null {
  if (!input || typeof input !== "object") return null;
  const { annualReturnPercent } = input;

  if (!isFiniteNumber(annualReturnPercent)) return null;
  if (annualReturnPercent <= 0) return null;

  const years = 72 / annualReturnPercent;
  return Number.isFinite(years) ? round2(years) : null;
}

export type SipVsLumpsumInput = {
  totalAmount: number;
  years: number;
  annualReturnPercent: number;
};

export type SipVsLumpsumComparison = {
  lumpsumValue: number;
  sipValue: number;
  /** Lumpsum minus SIP — positive when deploying at once ends ahead. */
  difference: number;
  lumpsumWins: boolean;
};

/**
 * The same rupees deployed all at once versus spread evenly across the period.
 *
 * Whenever returns are positive, the lumpsum wins — always, and by construction.
 * Every rupee of it is invested for the full horizon, while the average SIP
 * rupee is invested for roughly half of it. There is no assumption to tune that
 * changes this; it is arithmetic, not a market view. Publishing the honest gap
 * matters because "SIP beats lumpsum" is repeated as though it were a return
 * claim. SIP's real advantages are behavioural and volatility-related — it
 * converts an income stream into an investment, removes the timing decision,
 * and buys more units when prices fall — none of which show up in a smooth
 * constant-return model like this one. On a single fixed rate, this comparison
 * measures time in the market and nothing else.
 *
 * Both legs are compounded on the SAME monthly convention (i = r/12, credited
 * at the start of each month). The whole purpose is to isolate the timing
 * difference, so compounding the lumpsum annually while the SIP compounds
 * monthly would bake a convention gap into the answer and misattribute it to
 * timing.
 *
 * At a zero rate the two are identical — the same money, no growth — and a tie
 * is reported as `lumpsumWins: false`, because a tie is not a win. At negative
 * returns the flag flips honestly: staying uninvested longer loses less.
 */
export function sipVsLumpsum(input: SipVsLumpsumInput): SipVsLumpsumComparison | null {
  if (!input || typeof input !== "object") return null;
  const { totalAmount, years, annualReturnPercent } = input;

  if (![totalAmount, years, annualReturnPercent].every(isFiniteNumber)) return null;
  if (totalAmount <= 0 || years <= 0 || years > MAX_YEARS) return null;

  const monthlyRate = annualReturnPercent / 12 / 100;
  if (monthlyRate <= -1) return null;

  const months = monthsFromYears(years);
  if (months < 1) return null;

  const growth = Math.pow(1 + monthlyRate, months);
  if (!Number.isFinite(growth)) return null;

  const gain = growth - 1;
  // Same zero-rate limit as elsewhere: the annuity factor tends to the month
  // count, so take it exactly rather than dividing by a rate of zero.
  const annuityFactor =
    monthlyRate === 0 || gain === 0 ? months : (gain / monthlyRate) * (1 + monthlyRate);
  if (!Number.isFinite(annuityFactor)) return null;

  const rawLumpsum = totalAmount * growth;
  const rawSip = (totalAmount / months) * annuityFactor;
  if (!Number.isFinite(rawLumpsum) || !Number.isFinite(rawSip)) return null;

  const lumpsumValue = round2(rawLumpsum);
  const sipValue = round2(rawSip);

  return {
    lumpsumValue,
    sipValue,
    difference: round2(lumpsumValue - sipValue),
    lumpsumWins: lumpsumValue > sipValue,
  };
}
