/**
 * Gold and property against equity, after tax.
 *
 * These are the two assets Indian households actually weigh equity against,
 * and both are taxed differently from it — differences a side-by-side
 * "12% vs 8%" comparison silently drops:
 *
 *  - **Gold and property lost indexation in July 2024.** Long-term gains on
 *    both are now a flat 12.5% with no inflation adjustment, where previously
 *    the cost base was indexed and the effective rate was far lower on a long
 *    hold. A calculator still applying indexation overstates them badly.
 *  - **Neither gets equity's ₹1.25 lakh exemption.** That allowance is
 *    specific to listed equity under s.112A; gold and property are taxed from
 *    the first rupee of gain.
 *  - **Property has costs equity does not.** Stamp duty and registration on
 *    the way in, and maintenance every year, are what turn a headline
 *    appreciation rate into an actual return. Ignoring them is the single
 *    biggest reason property comparisons flatter property.
 *
 * Rental yield is modelled net and taxed at slab, because rent is ordinary
 * income rather than a capital gain.
 *
 * Pure and dependency-free.
 */

import { CESS_PERCENT, TAX_REGIMES } from "@/shared/capital-gains";

const CURRENT_REGIME = TAX_REGIMES[0];

/**
 * Long-term gains on gold and property are taxed at the same headline rate as
 * equity, but without the exemption — and, since July 2024, without
 * indexation either.
 */
export const NON_EQUITY_LTCG_PERCENT = 12.5;
/** Long-term treatment needs a longer hold for these than for listed equity. */
export const GOLD_LONG_TERM_YEARS = 2;
export const PROPERTY_LONG_TERM_YEARS = 2;

const MAX_YEARS = 100;

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export type GoldVsEquityInput = {
  amount: number;
  years: number;
  goldReturnPercent: number;
  equityReturnPercent: number;
};

export type AssetOutcome = {
  grossValue: number;
  grossGain: number;
  taxPaid: number;
  postTaxValue: number;
  effectiveAnnualPercent: number;
};

export type GoldVsEquity = {
  gold: AssetOutcome;
  equity: AssetOutcome;
  difference: number;
  equityWins: boolean;
  goldLongTerm: boolean;
  equityLongTerm: boolean;
};

const effectiveRate = (finalValue: number, amount: number, years: number): number => {
  if (finalValue <= 0 || amount <= 0) return -100;
  const rate = (Math.pow(finalValue / amount, 1 / years) - 1) * 100;
  return Number.isFinite(rate) ? rate : 0;
};

/**
 * Physical gold or a gold ETF against equity, after tax.
 *
 * The asymmetry that decides most of these comparisons is the exemption:
 * equity shelters the first ₹1.25 lakh of long-term gain each year and gold
 * shelters nothing, so on modest amounts equity can win on tax alone even
 * where gold matches it on return.
 */
export function goldVsEquity(input: GoldVsEquityInput): GoldVsEquity | null {
  if (!input || typeof input !== "object") return null;
  const { amount, years, goldReturnPercent, equityReturnPercent } = input;

  if (!isFinitePositive(amount)) return null;
  if (!isFinitePositive(years) || years > MAX_YEARS) return null;
  if (!Number.isFinite(goldReturnPercent) || !Number.isFinite(equityReturnPercent)) return null;

  const goldValue = amount * Math.pow(1 + goldReturnPercent / 100, years);
  const equityValue = amount * Math.pow(1 + equityReturnPercent / 100, years);
  if (!Number.isFinite(goldValue) || !Number.isFinite(equityValue)) return null;

  const goldGain = goldValue - amount;
  const equityGain = equityValue - amount;

  const goldLongTerm = years >= GOLD_LONG_TERM_YEARS;
  const equityLongTerm = years > 1;

  // Gold: no exemption, and no indexation since July 2024.
  const goldRate = goldLongTerm ? NON_EQUITY_LTCG_PERCENT : CURRENT_REGIME.shortTermPercent;
  const goldTax = Math.max(0, goldGain) * (goldRate / 100) * (1 + CESS_PERCENT / 100);

  const equityRate = equityLongTerm
    ? CURRENT_REGIME.longTermPercent
    : CURRENT_REGIME.shortTermPercent;
  const equityExemption = equityLongTerm ? CURRENT_REGIME.longTermExemption : 0;
  const equityTax =
    Math.max(0, equityGain - equityExemption) * (equityRate / 100) * (1 + CESS_PERCENT / 100);

  const goldPostTax = round2(goldValue - goldTax);
  const equityPostTax = round2(equityValue - equityTax);

  return {
    gold: {
      grossValue: round2(goldValue),
      grossGain: round2(goldGain),
      taxPaid: round2(goldTax),
      postTaxValue: goldPostTax,
      effectiveAnnualPercent: round2(effectiveRate(goldValue - goldTax, amount, years)),
    },
    equity: {
      grossValue: round2(equityValue),
      grossGain: round2(equityGain),
      taxPaid: round2(equityTax),
      postTaxValue: equityPostTax,
      effectiveAnnualPercent: round2(effectiveRate(equityValue - equityTax, amount, years)),
    },
    difference: round2(equityPostTax - goldPostTax),
    equityWins: equityPostTax > goldPostTax,
    goldLongTerm,
    equityLongTerm,
  };
}

export type PropertyReturnInput = {
  /** Headline purchase price, before the costs of buying. */
  propertyPrice: number;
  years: number;
  /** Expected annual appreciation on the property itself. */
  appreciationPercent: number;
  /** Annual rent as a percentage of the purchase price. */
  rentalYieldPercent?: number;
  /** Stamp duty and registration, as a percentage of price. */
  stampDutyPercent?: number;
  /** Annual maintenance, tax and repairs, as a percentage of price. */
  maintenancePercent?: number;
  /** Slab applied to rental income, which is ordinary income. */
  slabPercent?: number;
};

export type PropertyReturn = {
  /** Purchase price plus stamp duty and registration. */
  totalInvested: number;
  saleValue: number;
  /** Rent received across the hold, after slab tax and maintenance. */
  netRentalIncome: number;
  capitalGainsTax: number;
  /** Sale proceeds after tax, plus net rent, minus everything paid in. */
  netProfit: number;
  /** The rate the whole thing actually compounded at, all costs counted. */
  effectiveAnnualPercent: number;
  /** The appreciation rate alone, for contrast with the effective rate. */
  headlineAnnualPercent: number;
};

/**
 * What a property investment actually returns once buying costs, maintenance
 * and tax are counted.
 *
 * The headline appreciation rate is reported alongside the effective one
 * precisely so the gap is visible: stamp duty is a large one-off drag that
 * never appears in "property doubled in ten years", and maintenance quietly
 * consumes much of a typical Indian rental yield of 2–3%.
 *
 * Capital gain is measured against the price paid INCLUDING stamp duty and
 * registration, since those form part of the cost of acquisition.
 */
export function propertyReturn(input: PropertyReturnInput): PropertyReturn | null {
  if (!input || typeof input !== "object") return null;
  const { propertyPrice, years, appreciationPercent } = input;

  if (!isFinitePositive(propertyPrice)) return null;
  if (!isFinitePositive(years) || years > MAX_YEARS) return null;
  if (!Number.isFinite(appreciationPercent)) return null;

  const rentalYieldPercent = isFiniteNonNegative(input.rentalYieldPercent)
    ? input.rentalYieldPercent
    : 0;
  const stampDutyPercent = isFiniteNonNegative(input.stampDutyPercent)
    ? input.stampDutyPercent
    : 6;
  const maintenancePercent = isFiniteNonNegative(input.maintenancePercent)
    ? input.maintenancePercent
    : 0.5;
  const slabPercent =
    isFiniteNonNegative(input.slabPercent) && input.slabPercent < 100 ? input.slabPercent : 0;

  const stampDuty = propertyPrice * (stampDutyPercent / 100);
  const totalInvested = propertyPrice + stampDuty;

  const saleValue = propertyPrice * Math.pow(1 + appreciationPercent / 100, years);
  if (!Number.isFinite(saleValue)) return null;

  // Rent is taxed as ordinary income; maintenance is a real cash cost either
  // way, so both are netted off the gross rent received.
  const grossRent = propertyPrice * (rentalYieldPercent / 100) * years;
  const rentAfterTax = grossRent * (1 - slabPercent / 100);
  const maintenance = propertyPrice * (maintenancePercent / 100) * years;
  const netRentalIncome = rentAfterTax - maintenance;

  const longTerm = years >= PROPERTY_LONG_TERM_YEARS;
  const gainRate = longTerm ? NON_EQUITY_LTCG_PERCENT : CURRENT_REGIME.shortTermPercent;
  // Stamp duty is part of the acquisition cost, so it reduces the taxable gain.
  const capitalGain = Math.max(0, saleValue - totalInvested);
  const capitalGainsTax = capitalGain * (gainRate / 100) * (1 + CESS_PERCENT / 100);

  const netProceeds = saleValue - capitalGainsTax;
  const finalValue = netProceeds + netRentalIncome;
  const netProfit = finalValue - totalInvested;

  if (![saleValue, netRentalIncome, capitalGainsTax, finalValue].every(Number.isFinite)) {
    return null;
  }

  return {
    totalInvested: round2(totalInvested),
    saleValue: round2(saleValue),
    netRentalIncome: round2(netRentalIncome),
    capitalGainsTax: round2(capitalGainsTax),
    netProfit: round2(netProfit),
    effectiveAnnualPercent: round2(effectiveRate(finalValue, totalInvested, years)),
    headlineAnnualPercent: round2(appreciationPercent),
  };
}
