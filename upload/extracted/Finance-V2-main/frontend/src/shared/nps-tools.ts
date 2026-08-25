/**
 * National Pension System projections.
 *
 * NPS is not a generic retirement pot and a generic calculator gets it
 * materially wrong, because the payout is constrained by statute rather than
 * by choice:
 *
 *  - **At least 40% of the corpus must buy an annuity.** That fraction is not
 *    withdrawable, and the pension it produces depends on annuity rates at
 *    retirement, not on the equity return that built the corpus. Treating the
 *    whole corpus as spendable — which a general retirement calculator does —
 *    overstates what is actually available on day one.
 *  - **The remaining lump sum is tax-free; the annuity income is not.** The
 *    pension is taxed at slab as it arrives, so a pre-tax pension figure
 *    flatters NPS against alternatives that are taxed differently.
 *  - **Contributions stop at 60.** A horizon past that is not a longer NPS
 *    plan, it is a different product.
 *
 * The projection itself is deliberately the same monthly-contribution
 * arithmetic `wealth-tools.ts` uses, so an NPS corpus and a SIP corpus of the
 * same size and rate agree to the rupee.
 *
 * Pure and dependency-free.
 */

/** Statutory minimum share of the corpus that must be annuitised. */
export const NPS_MIN_ANNUITY_SHARE_PERCENT = 40;
/** Contributions cease at the scheme's vesting age. */
export const NPS_RETIREMENT_AGE = 60;

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export type NpsProjectionInput = {
  currentAge: number;
  monthlyContribution: number;
  /** Expected return on the accumulated corpus until 60. */
  expectedReturnPercent: number;
  /** Share of the corpus put into an annuity. Floored at the statutory 40%. */
  annuitySharePercent?: number;
  /** The annuity rate available at retirement. */
  annuityRatePercent?: number;
  /** Slab applied to the pension, which is taxable income. */
  slabPercent?: number;
  /** Anything already accumulated in the account. */
  existingCorpus?: number;
};

export type NpsProjection = {
  yearsToRetirement: number;
  totalContributed: number;
  corpusAtRetirement: number;
  /** Corpus minus everything paid in — what the return contributed. */
  wealthGained: number;
  /** The annuitised portion, which cannot be withdrawn. */
  annuityCorpus: number;
  /** The withdrawable portion, tax-free under current rules. */
  lumpSum: number;
  monthlyPensionGross: number;
  monthlyPensionPostTax: number;
  /** True when the requested annuity share was raised to the statutory floor. */
  annuityShareRaised: boolean;
  appliedAnnuitySharePercent: number;
};

/**
 * Project an NPS account to age 60 and split the outcome the way the scheme
 * actually pays out.
 *
 * Returns null once the subscriber is already at or past the vesting age —
 * there is no accumulation phase left to project, and quoting one would
 * describe a plan that cannot be started.
 */
export function npsProjection(input: NpsProjectionInput): NpsProjection | null {
  if (!input || typeof input !== "object") return null;
  const { currentAge, monthlyContribution, expectedReturnPercent } = input;

  if (!isFinitePositive(currentAge) || currentAge >= NPS_RETIREMENT_AGE) return null;
  if (!isFinitePositive(monthlyContribution)) return null;
  if (!Number.isFinite(expectedReturnPercent) || expectedReturnPercent <= -100) return null;

  const existingCorpus = isFiniteNonNegative(input.existingCorpus) ? input.existingCorpus : 0;
  const slabPercent =
    isFiniteNonNegative(input.slabPercent) && input.slabPercent < 100 ? input.slabPercent : 0;
  const annuityRatePercent = isFinitePositive(input.annuityRatePercent)
    ? input.annuityRatePercent
    : 6;

  // The statutory floor is a floor, not a default: a subscriber may annuitise
  // more, never less, so a lower request is raised rather than refused — and
  // the caller is told, because silently changing someone's input is worse
  // than either honouring or rejecting it.
  const requested = isFiniteNonNegative(input.annuitySharePercent)
    ? Math.min(100, input.annuitySharePercent)
    : NPS_MIN_ANNUITY_SHARE_PERCENT;
  const appliedAnnuitySharePercent = Math.max(NPS_MIN_ANNUITY_SHARE_PERCENT, requested);

  const yearsToRetirement = NPS_RETIREMENT_AGE - currentAge;
  const months = Math.round(yearsToRetirement * 12);
  if (months <= 0) return null;

  // Same convention as wealth-tools' SIP: contributions at the start of each
  // month, monthly rate = annual / 12, so the two agree on identical inputs.
  const monthlyRate = expectedReturnPercent / 12 / 100;
  let balance = existingCorpus;
  for (let month = 0; month < months; month += 1) {
    balance = (balance + monthlyContribution) * (1 + monthlyRate);
    if (!Number.isFinite(balance)) return null;
  }

  const totalContributed = monthlyContribution * months;
  const annuityCorpus = balance * (appliedAnnuitySharePercent / 100);
  const lumpSum = balance - annuityCorpus;
  const monthlyPensionGross = (annuityCorpus * (annuityRatePercent / 100)) / 12;
  // Taken from the ROUNDED gross so the two figures reconcile on screen: a
  // reader applying their own slab to the pension shown beside this must land
  // on the number printed here, not a paise off it.
  const monthlyPensionGrossRounded = round2(monthlyPensionGross);
  const monthlyPensionPostTax = monthlyPensionGrossRounded * (1 - slabPercent / 100);

  if (![balance, annuityCorpus, lumpSum, monthlyPensionGross].every(Number.isFinite)) return null;

  return {
    yearsToRetirement: round2(yearsToRetirement),
    totalContributed: round2(totalContributed),
    corpusAtRetirement: round2(balance),
    wealthGained: round2(balance - totalContributed - existingCorpus),
    annuityCorpus: round2(annuityCorpus),
    lumpSum: round2(lumpSum),
    monthlyPensionGross: monthlyPensionGrossRounded,
    monthlyPensionPostTax: round2(monthlyPensionPostTax),
    annuityShareRaised: appliedAnnuitySharePercent > requested,
    appliedAnnuitySharePercent,
  };
}
