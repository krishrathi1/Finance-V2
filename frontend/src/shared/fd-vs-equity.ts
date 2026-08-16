/**
 * Fixed deposit against equity, after tax.
 *
 * The comparison is almost always published before tax, which flatters the
 * deposit badly: FD interest is taxed every year at the saver's slab rate,
 * while listed equity is taxed once on sale, at a lower rate, after an annual
 * exemption. A headline "8% FD vs 12% equity" is not the gap it looks like at
 * a 30% slab, and it is not the gap it looks like over one year either.
 *
 * Two modelling choices, both the honest ones rather than the flattering ones:
 *
 *  - **FD interest is taxed on accrual, not at maturity.** Indian FD interest
 *    is assessable in the year it accrues, so the deposit genuinely compounds
 *    at the post-tax rate. Taxing the whole thing once at the end — which is
 *    what most online calculators do — lets untaxed interest compound on
 *    itself for the entire term and overstates the deposit.
 *
 *  - **Equity uses the s.112A long-term treatment**, since the comparison only
 *    makes sense over a horizon a deposit would be used for. Under a year the
 *    short-term rate applies and the calculator says so rather than quietly
 *    using the wrong one.
 *
 * Rates come from `capital-gains.ts` rather than being repeated here, so a
 * Budget change lands in one place.
 *
 * Pure and dependency-free.
 */

import { CESS_PERCENT, TAX_REGIMES } from "@/shared/capital-gains";

/** The newest published schedule — this calculator is forward-looking. */
const CURRENT_REGIME = TAX_REGIMES[0];

const MAX_YEARS = 100;

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export type FdVsEquityInput = {
  amount: number;
  years: number;
  fdRatePercent: number;
  equityReturnPercent: number;
  /** The saver's income-tax slab, applied to FD interest. */
  slabPercent: number;
};

export type InvestmentOutcome = {
  maturityValue: number;
  /** Interest or capital gain before tax. */
  grossGain: number;
  taxPaid: number;
  postTaxValue: number;
  /** The rate this actually compounded at after tax, as a percentage. */
  effectiveAnnualPercent: number;
};

export type FdVsEquity = {
  fd: InvestmentOutcome;
  equity: InvestmentOutcome;
  /** Equity's post-tax value minus the deposit's. Negative when FD wins. */
  difference: number;
  equityWins: boolean;
  /**
   * False when the horizon is under a year, meaning equity is taxed at the
   * short-term rate and the long-term exemption does not apply.
   */
  longTerm: boolean;
  /** The rates actually used, so the UI can state its own assumptions. */
  appliedEquityRatePercent: number;
  appliedExemption: number;
};

/**
 * Compare a lump sum left in a deposit against the same sum in equity.
 *
 * Returns null for inputs that cannot describe a comparison. A zero or
 * negative return is allowed — a deposit can trail inflation and equity can
 * lose money, and refusing to model that would only ever flatter equity.
 */
export function fdVsEquity(input: FdVsEquityInput): FdVsEquity | null {
  if (!input || typeof input !== "object") return null;
  const { amount, years, fdRatePercent, equityReturnPercent, slabPercent } = input;

  if (!isFinitePositive(amount)) return null;
  if (!isFinitePositive(years) || years > MAX_YEARS) return null;
  if (!Number.isFinite(fdRatePercent) || fdRatePercent < 0) return null;
  if (!Number.isFinite(equityReturnPercent)) return null;
  if (!Number.isFinite(slabPercent) || slabPercent < 0 || slabPercent >= 100) return null;

  // ── Fixed deposit ────────────────────────────────────────────────────────
  // Taxed each year as it accrues, so what compounds is the post-tax rate.
  const fdPostTaxRate = (fdRatePercent / 100) * (1 - slabPercent / 100);
  const fdPostTaxValue = amount * Math.pow(1 + fdPostTaxRate, years);
  const fdGrossValue = amount * Math.pow(1 + fdRatePercent / 100, years);
  if (!Number.isFinite(fdPostTaxValue) || !Number.isFinite(fdGrossValue)) return null;

  const fdGrossGain = fdGrossValue - amount;
  const fdTax = fdGrossValue - fdPostTaxValue;

  // ── Equity ───────────────────────────────────────────────────────────────
  const equityValue = amount * Math.pow(1 + equityReturnPercent / 100, years);
  if (!Number.isFinite(equityValue)) return null;
  const equityGain = equityValue - amount;

  // A horizon under a year is short-term: the flat s.111A rate, no exemption.
  const longTerm = years > 1;
  const equityRate = longTerm ? CURRENT_REGIME.longTermPercent : CURRENT_REGIME.shortTermPercent;
  const exemption = longTerm ? CURRENT_REGIME.longTermExemption : 0;

  // A loss is not taxed. Set-off against other gains is a portfolio-level
  // question this single-investment comparison has no basis to answer.
  const taxableGain = Math.max(0, equityGain - exemption);
  const equityBaseTax = (taxableGain * equityRate) / 100;
  const equityTax = equityBaseTax * (1 + CESS_PERCENT / 100);
  const equityPostTaxValue = equityValue - equityTax;

  const effectiveRate = (finalValue: number): number => {
    if (finalValue <= 0) return -100;
    const rate = (Math.pow(finalValue / amount, 1 / years) - 1) * 100;
    return Number.isFinite(rate) ? rate : 0;
  };

  // Both post-tax figures are rounded first, and the difference is taken from
  // those rounded values rather than from the raw ones. Rounding each side
  // separately and then subtracting can disagree with subtracting and then
  // rounding by a paise, and the number that has to be right is the one a
  // reader gets by subtracting the two figures printed beside it.
  const fdPostTaxRounded = round2(fdPostTaxValue);
  const equityPostTaxRounded = round2(equityPostTaxValue);

  return {
    fd: {
      maturityValue: round2(fdGrossValue),
      grossGain: round2(fdGrossGain),
      taxPaid: round2(fdTax),
      postTaxValue: fdPostTaxRounded,
      effectiveAnnualPercent: round2(effectiveRate(fdPostTaxValue)),
    },
    equity: {
      maturityValue: round2(equityValue),
      grossGain: round2(equityGain),
      taxPaid: round2(equityTax),
      postTaxValue: equityPostTaxRounded,
      effectiveAnnualPercent: round2(effectiveRate(equityPostTaxValue)),
    },
    difference: round2(equityPostTaxRounded - fdPostTaxRounded),
    equityWins: equityPostTaxRounded > fdPostTaxRounded,
    longTerm,
    appliedEquityRatePercent: equityRate,
    appliedExemption: exemption,
  };
}
