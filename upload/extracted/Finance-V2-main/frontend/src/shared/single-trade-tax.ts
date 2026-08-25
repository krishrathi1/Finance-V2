/**
 * Capital-gains tax on ONE hypothetical trade, without needing it in a
 * portfolio.
 *
 * `capital-gains.ts` already computes tax correctly for a whole ledger of
 * realised lots — the right rate regime by sell date, the ₹1.25L exemption,
 * the one-way loss set-off, cess. What it does not offer is the question
 * asked before a trade exists at all: "if I sell this holding today, what
 * would I owe?" Answering that by importing a hypothetical trade into the
 * portfolio is a detour nobody wants for a what-if calculation.
 *
 * This is a thin adapter, not a second tax model: it builds exactly the
 * `RealisedLot` shape `matchFifo` would produce for a single matched buy/sell
 * pair, then hands it to the same `taxForLots` the portfolio statement uses.
 * One source of truth for the tax rules; this module only assembles the input.
 *
 * Pure and dependency-free.
 */

import { daysBetween, LONG_TERM_HOLDING_DAYS, type RealisedLot } from "@/shared/portfolio-returns";
import { indianFinancialYear, taxForLots, type CapitalGainsBreakdown } from "@/shared/capital-gains";

export type SingleTradeTaxInput = {
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  /** ISO "YYYY-MM-DD". */
  buyDate: string;
  /** ISO "YYYY-MM-DD" — the actual or hypothetical sell date. */
  sellDate: string;
  /** Brokerage/STT/etc. on the purchase leg. */
  buyFees?: number;
  /** Brokerage/STT/etc. on the sale leg. */
  sellFees?: number;
};

export type SingleTradeTax = CapitalGainsBreakdown & {
  holdingDays: number;
  term: "short" | "long";
  costBasis: number;
  proceeds: number;
  realisedPnl: number;
  /**
   * Days from the buy date until the holding crosses into long-term
   * treatment, independent of the sell date entered — this is the number
   * that answers "how much longer until this is long-term", which is the one
   * part of the estimate a trader can actually act on before selling. Zero
   * once the holding already qualifies.
   */
  daysToLongTerm: number;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Estimate the tax on one buy/sell pair.
 *
 * Returns null when the trade cannot be dated (an unparseable or reversed
 * date pair — a sell before its own buy is not a trade this can price) or
 * when quantity/prices are not usable. Fees default to zero, matching the
 * rest of the app's transaction-entry convention.
 */
export function estimateTradeTax(input: SingleTradeTaxInput): SingleTradeTax | null {
  if (!input || typeof input !== "object") return null;
  const { quantity, buyPrice, sellPrice, buyDate, sellDate } = input;

  if (!isPositiveFinite(quantity) || !isPositiveFinite(buyPrice) || !isPositiveFinite(sellPrice)) {
    return null;
  }
  const buyFees = isNonNegativeFinite(input.buyFees) ? input.buyFees : 0;
  const sellFees = isNonNegativeFinite(input.sellFees) ? input.sellFees : 0;

  const holdingDays = daysBetween(buyDate, sellDate);
  // daysBetween returns 0 for a date it cannot parse, which is indistinguishable
  // from a genuine same-day trade — so dates are validated directly rather than
  // inferred from the result.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(buyDate) || !/^\d{4}-\d{2}-\d{2}$/.test(sellDate)) return null;
  if (holdingDays < 0) return null;

  const term: "short" | "long" = holdingDays > LONG_TERM_HOLDING_DAYS ? "long" : "short";
  const daysToLongTerm = term === "long" ? 0 : LONG_TERM_HOLDING_DAYS + 1 - holdingDays;

  // Mirrors matchFifo's own per-lot arithmetic exactly, so a trade entered
  // here and the same trade later recorded in the portfolio ledger price
  // identically.
  const buyFeePerUnit = buyFees / quantity;
  const sellFeePerUnit = sellFees / quantity;
  const costBasis = round2(quantity * (buyPrice + buyFeePerUnit));
  const proceeds = round2(quantity * (sellPrice - sellFeePerUnit));
  const realisedPnl = round2(proceeds - costBasis);

  const financialYear = indianFinancialYear(sellDate);
  if (!financialYear) return null;

  const lot: RealisedLot = {
    symbol: "TRADE",
    quantity,
    buyPrice,
    sellPrice,
    buyDate,
    sellDate,
    costBasis,
    proceeds,
    realisedPnl,
    realisedPnlPercent: costBasis > 0 ? round2((realisedPnl / costBasis) * 100) : 0,
    holdingDays,
    term,
  };

  const breakdown = taxForLots(financialYear, [lot]);
  if (!breakdown) return null;

  return { ...breakdown, holdingDays, term, costBasis, proceeds, realisedPnl, daysToLongTerm };
}
