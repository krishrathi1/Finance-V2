/**
 * SIP backtest — what a fixed monthly investment in this stock would have done.
 *
 * The systematic monthly investment is how most Indian retail money actually
 * enters the market, and it produces a materially different outcome from the
 * lump sum every "5-year return" figure implicitly assumes. Buying monthly
 * through a drawdown accumulates more units at lower prices; buying monthly
 * into a straight-line rally does worse than having bought once at the start.
 * Neither is universally better, and only running both says which this stock
 * was.
 *
 * Everything is computed from the daily history already in the payload, and
 * XIRR is reused from `portfolio-returns.ts` rather than reimplemented — a
 * second money-weighted-return implementation is how the portfolio page and
 * this simulator end up disagreeing about the same maths.
 *
 * Pure and dependency-free.
 */

import type { PricePoint } from "@/shared/price-stats";
import { xirr, type CashFlow } from "@/shared/portfolio-returns";

type Point = { date: string; close: number; time: number };

function clean(history: PricePoint[] | null | undefined): Point[] {
  if (!Array.isArray(history)) return [];
  const points: Point[] = [];
  for (const point of history) {
    const close = Number(point?.close);
    const time = Date.parse(`${point?.date}T00:00:00Z`);
    if (!Number.isFinite(close) || close <= 0 || Number.isNaN(time)) continue;
    points.push({ date: point.date, close, time });
  }
  points.sort((a, b) => a.time - b.time);
  return points;
}

export type SipInstallment = {
  date: string;
  price: number;
  amount: number;
  units: number;
};

export type SipResult = {
  monthlyAmount: number;
  installments: number;
  totalInvested: number;
  unitsAccumulated: number;
  currentValue: number;
  /** Simple profit over money put in — what the user sees in their account. */
  absoluteReturnPercent: number;
  /**
   * Money-weighted annualised return. The honest headline for a SIP: a simple
   * percentage treats the final month's instalment as though it had been
   * invested for the whole period.
   */
  xirrPercent: number | null;
  averageCostPerUnit: number;
  latestPrice: number;
  firstInvestmentDate: string;
  lastInvestmentDate: string;
  /** The same total money committed once, on the first instalment date. */
  lumpSumValue: number;
  lumpSumReturnPercent: number;
  /** True when staggering beat committing everything up front. */
  sipBeatLumpSum: boolean;
};

/**
 * Advance to the first tradable day on or after a target date.
 *
 * A SIP date routinely lands on a weekend, a holiday, or a day the provider
 * simply has no row for. Skipping those instalments would understate the
 * amount invested; taking the previous close would buy at a price that was not
 * available. Buying at the next available close is what actually happens.
 *
 * Returns null once the target passes the end of the series, which ends the
 * schedule rather than repeating the final price.
 */
function firstPointOnOrAfter(points: Point[], fromIndex: number, targetTime: number): number | null {
  for (let index = fromIndex; index < points.length; index += 1) {
    if (points[index].time >= targetTime) return index;
  }
  return null;
}

export type SipOptions = {
  /** Amount invested each month. */
  monthlyAmount: number;
  /** How many years back to start. Capped by the history available. */
  years: number;
  /** Day of month to invest on, clamped to 1-28 so every month has one. */
  dayOfMonth?: number;
};

/**
 * Run a monthly SIP over the history and report the outcome.
 *
 * Returns null when fewer than two instalments would have been made — a
 * "return" on one purchase is just that day's price move, and annualising it
 * would produce the same nonsense XIRR guards against elsewhere.
 */
export function sipBacktest(
  history: PricePoint[] | null | undefined,
  options: SipOptions
): SipResult | null {
  const points = clean(history);
  if (points.length < 2) return null;

  const monthlyAmount = Number(options?.monthlyAmount);
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return null;

  const years = Number(options?.years);
  if (!Number.isFinite(years) || years <= 0) return null;

  // 28 is the last day every month is guaranteed to have. Beyond it the
  // schedule would silently shift into the next month for February.
  const dayOfMonth = Math.min(28, Math.max(1, Math.trunc(Number(options?.dayOfMonth ?? 1)) || 1));

  const last = points[points.length - 1];
  const earliest = points[0];

  // Start `years` back from the last close, but never before the data begins —
  // otherwise the first instalments would all pile onto the earliest available
  // row, inventing a lump sum the schedule never had.
  const requestedStart = new Date(last.time);
  requestedStart.setUTCFullYear(requestedStart.getUTCFullYear() - Math.trunc(years));
  const startTime = Math.max(requestedStart.getTime(), earliest.time);

  const startDate = new Date(startTime);
  let cursorYear = startDate.getUTCFullYear();
  let cursorMonth = startDate.getUTCMonth();
  // If this month's SIP date has already passed, begin next month.
  if (startDate.getUTCDate() > dayOfMonth) cursorMonth += 1;

  const installments: SipInstallment[] = [];
  let searchFrom = 0;
  let unitsAccumulated = 0;
  let totalInvested = 0;

  // Bounded by construction (one iteration per month of history), with a hard
  // ceiling so a malformed series can never spin here.
  for (let guard = 0; guard < 1200; guard += 1) {
    const targetTime = Date.UTC(cursorYear, cursorMonth, dayOfMonth);
    if (targetTime > last.time) break;

    const index = firstPointOnOrAfter(points, searchFrom, targetTime);
    if (index === null) break;

    const point = points[index];
    const units = monthlyAmount / point.close;
    installments.push({ date: point.date, price: point.close, amount: monthlyAmount, units });
    unitsAccumulated += units;
    totalInvested += monthlyAmount;
    searchFrom = index + 1;

    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }

  if (installments.length < 2) return null;

  const latestPrice = last.close;
  const currentValue = unitsAccumulated * latestPrice;
  const absoluteReturnPercent = ((currentValue - totalInvested) / totalInvested) * 100;

  const flows: CashFlow[] = installments.map((installment) => ({
    date: installment.date,
    amount: -installment.amount,
  }));
  flows.push({ date: last.date, amount: currentValue });
  const rate = xirr(flows);

  // The counterfactual: the same total money committed on the first SIP date.
  const firstPrice = installments[0].price;
  const lumpSumValue = (totalInvested / firstPrice) * latestPrice;
  const lumpSumReturnPercent = ((lumpSumValue - totalInvested) / totalInvested) * 100;

  return {
    monthlyAmount,
    installments: installments.length,
    totalInvested,
    unitsAccumulated,
    currentValue,
    absoluteReturnPercent,
    xirrPercent: rate === null ? null : rate * 100,
    averageCostPerUnit: totalInvested / unitsAccumulated,
    latestPrice,
    firstInvestmentDate: installments[0].date,
    lastInvestmentDate: installments[installments.length - 1].date,
    lumpSumValue,
    lumpSumReturnPercent,
    sipBeatLumpSum: currentValue > lumpSumValue,
  };
}
