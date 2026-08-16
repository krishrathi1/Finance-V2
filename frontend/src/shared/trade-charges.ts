/**
 * What an Indian equity trade actually costs, line by line.
 *
 * The gap between gross and net P&L is a contract note's stack of small
 * deductions — brokerage, STT, exchange charges, SEBI fee, stamp duty, GST,
 * DP charge — and each line follows a different rule about which side of the
 * trade it applies to. Summing them as "roughly 0.1%" gets intraday breakeven
 * badly wrong (charges there are mostly flat, so they dominate small trades)
 * and delivery breakeven subtly wrong (STT hits both legs). This module
 * reproduces every line so a user can reconcile it against their broker's
 * contract note, and stays pure so the arithmetic is directly testable.
 *
 * The asymmetries that make this more than "turnover × rate":
 *
 * 1. **STT depends on the product, not just the trade.** Delivery pays
 *    0.1% on BOTH legs; intraday pays 0.025% on the sell leg only. Treating
 *    them alike misprices delivery round trips by a factor of eight.
 *
 * 2. **Stamp duty is buy-side only.** Since the July 2020 centralisation it
 *    taxes the acquisition, collected from the buyer at a uniform national
 *    rate — so it never appears on a sell note.
 *
 * 3. **GST is a tax on services, not a tax on taxes.** It applies to
 *    brokerage, exchange transaction charges, and the SEBI fee — the service
 *    components — and never to STT or stamp duty. Applying 18% to the whole
 *    charge column overstates costs noticeably on delivery trades where STT
 *    is the largest line.
 *
 * 4. **The DP charge is a depository fee, not a broker fee.** It is levied
 *    per scrip per day when shares leave the demat account, which only a
 *    delivery sell does — intraday positions net to zero and never touch the
 *    depository. It is flat, so it is brutal on small sells.
 *
 * Every charge is rounded to the paisa at the point it is computed, because
 * that is how it appears on the contract note, and the totals are sums of
 * the rounded lines — a user adding the printed column by hand must land on
 * the printed total, not a paisa away from it.
 */

export type TradeSegment = "delivery" | "intraday";

type TradeSide = "buy" | "sell";
type Exchange = "NSE" | "BSE";

/**
 * FY 2025-26 rates, kept in one table so a Budget change is a one-line edit.
 *
 * All `...Percent` values are percentages of turnover (charge = turnover ×
 * percent / 100). Sources: Finance Act STT schedule, NSE/BSE circulars on
 * transaction charges, SEBI turnover fee (₹10 per crore = 0.0001%), Indian
 * Stamp Act uniform rates, and the GST Act's 18% on financial services.
 * The brokerage and DP defaults are the discount-broker norm (₹0 delivery /
 * ₹20 intraday; DP ₹13.50 + 18% GST = ₹15.93), not statute — both are
 * configurable per call.
 */
const RATES = {
  sttPercent: {
    delivery: { buy: 0.1, sell: 0.1 },
    intraday: { buy: 0, sell: 0.025 },
  },
  exchangeTxnPercent: { NSE: 0.00297, BSE: 0.00375 },
  sebiTurnoverPercent: 0.0001,
  stampDutyBuyPercent: { delivery: 0.015, intraday: 0.003 },
  gstPercent: 18,
  defaultBrokeragePerOrder: { delivery: 0, intraday: 20 },
  defaultDpChargePerSell: 15.93,
} as const;

/** One order's cost sheet, every field in rupees rounded to the paisa. */
export type ChargeBreakdown = {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebiFee: number;
  stampDuty: number;
  gst: number;
  dpCharge: number;
  /** Sum of the seven lines above, computed from the rounded lines. */
  totalCharges: number;
  turnover: number;
  /** Buy: turnover + charges (what leaves the account). Sell: turnover − charges (what arrives). */
  netAmount: number;
};

export type TradeChargesInput = {
  side: TradeSide;
  quantity: number;
  price: number;
  segment: TradeSegment;
  brokeragePerOrder?: number;
  exchange?: Exchange;
  dpChargePerSell?: number;
};

export type RoundTripInput = {
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  segment: TradeSegment;
  brokeragePerOrder?: number;
  exchange?: Exchange;
  dpChargePerSell?: number;
};

export type RoundTripBreakdown = {
  buy: ChargeBreakdown;
  sell: ChargeBreakdown;
  totalCharges: number;
  grossPnl: number;
  netPnl: number;
  /** The sell price at which the round trip nets exactly zero. Not tick-rounded. */
  breakevenSellPrice: number;
  /** Friction as a share of money moved — comparable across trade sizes. */
  chargesPercentOfTurnover: number;
};

/** Paise rounding — statutory amounts are paid in paise, so 2dp is exact, not lossy. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** For percentages, where a basis point of precision still means something. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;
const isNonNegativeFinite = (value: number): boolean => Number.isFinite(value) && value >= 0;

/**
 * Every charge on one order, itemised the way a contract note prints them.
 *
 * Returns null rather than throwing for anything the arithmetic cannot
 * honestly price: non-positive or non-finite quantity/price, negative or
 * non-finite overrides, an unknown segment/side/exchange smuggled past the
 * types, or a trade so small its turnover rounds below one paisa.
 */
export function tradeCharges(input: TradeChargesInput): ChargeBreakdown | null {
  if (!input || typeof input !== "object") return null;

  const { side, segment, quantity, price } = input;
  if (side !== "buy" && side !== "sell") return null;
  if (segment !== "delivery" && segment !== "intraday") return null;
  if (!isPositiveFinite(quantity) || !isPositiveFinite(price)) return null;

  const exchange = input.exchange ?? "NSE";
  const txnPercent = RATES.exchangeTxnPercent[exchange];
  if (txnPercent === undefined) return null;

  const brokeragePerOrder = input.brokeragePerOrder ?? RATES.defaultBrokeragePerOrder[segment];
  if (!isNonNegativeFinite(brokeragePerOrder)) return null;

  const dpChargePerSell = input.dpChargePerSell ?? RATES.defaultDpChargePerSell;
  if (!isNonNegativeFinite(dpChargePerSell)) return null;

  // Charges are computed from the rounded turnover — the figure the contract
  // note prints — so every line here reproduces the note, not a shadow of it.
  const turnover = round2(quantity * price);
  if (!Number.isFinite(turnover) || turnover <= 0) return null;

  const brokerage = round2(brokeragePerOrder);
  const stt = round2((turnover * RATES.sttPercent[segment][side]) / 100);
  const exchangeTxn = round2((turnover * txnPercent) / 100);
  const sebiFee = round2((turnover * RATES.sebiTurnoverPercent) / 100);
  const stampDuty =
    side === "buy" ? round2((turnover * RATES.stampDutyBuyPercent[segment]) / 100) : 0;
  // GST on the rounded service lines, not their unrounded values — the note's
  // GST line is computed from the note's printed figures.
  const gst = round2(((brokerage + exchangeTxn + sebiFee) * RATES.gstPercent) / 100);
  const dpCharge = side === "sell" && segment === "delivery" ? round2(dpChargePerSell) : 0;

  const totalCharges = round2(
    brokerage + stt + exchangeTxn + sebiFee + stampDuty + gst + dpCharge
  );
  const netAmount = round2(side === "buy" ? turnover + totalCharges : turnover - totalCharges);

  return {
    brokerage,
    stt,
    exchangeTxn,
    sebiFee,
    stampDuty,
    gst,
    dpCharge,
    totalCharges,
    turnover,
    netAmount,
  };
}

/**
 * A complete buy-then-sell, answering the two questions a position card asks:
 * what do I actually clear if I exit here, and what exit price makes the
 * trade free?
 *
 * `breakevenSellPrice` is solved algebraically, not by trying prices. The
 * sell side splits cleanly into charges that scale with the sell price and
 * charges that do not:
 *
 *   net(S) = q·S − [v·q·S + f] = q·S·(1 − v) − f
 *
 * where v is the ad-valorem fraction of sell turnover
 *
 *   v = (STT_sell% + exchangeTxn% + SEBI% + GST% / 100 × (exchangeTxn% + SEBI%)) / 100
 *
 * (GST applies to brokerage too, but brokerage is flat, so its GST belongs
 * in f) and f is the flat part
 *
 *   f = brokerage × (1 + GST%/100) + dpCharge.
 *
 * Breakeven is net(S) = buy.netAmount, giving
 *
 *   S* = (buy.netAmount + f) / (q · (1 − v)).
 *
 * That is exact for the unrounded model, but each statutory line is then
 * rounded to the paisa, which can shift the realised net a paisa or two off
 * the algebraic zero. One closed-form correction — evaluate the real rounded
 * pipeline at S* and shift by residual / (q·(1 − v)) — re-centres it. This
 * is the same linear model applied once to the observed residual, not an
 * iterative search.
 */
export function roundTrip(input: RoundTripInput): RoundTripBreakdown | null {
  if (!input || typeof input !== "object") return null;

  const { quantity, buyPrice, sellPrice, segment, brokeragePerOrder, exchange, dpChargePerSell } =
    input;
  const shared = { quantity, segment, brokeragePerOrder, exchange, dpChargePerSell };

  const buy = tradeCharges({ ...shared, side: "buy", price: buyPrice });
  const sell = tradeCharges({ ...shared, side: "sell", price: sellPrice });
  if (!buy || !sell) return null;

  const totalCharges = round2(buy.totalCharges + sell.totalCharges);
  const grossPnl = round2(sell.turnover - buy.turnover);
  // Identical to grossPnl − totalCharges: both sides are already in paise.
  const netPnl = round2(sell.netAmount - buy.netAmount);

  // --- Breakeven (algebra documented above) --------------------------------
  const txnPercent = RATES.exchangeTxnPercent[exchange ?? "NSE"];
  const servicePercent = txnPercent + RATES.sebiTurnoverPercent;
  const adValoremFraction =
    (RATES.sttPercent[segment].sell + servicePercent + (RATES.gstPercent / 100) * servicePercent) /
    100;
  const flatBrokerage = brokeragePerOrder ?? RATES.defaultBrokeragePerOrder[segment];
  const flatDp =
    segment === "delivery" ? (dpChargePerSell ?? RATES.defaultDpChargePerSell) : 0;
  const flatSellCharges = flatBrokerage * (1 + RATES.gstPercent / 100) + flatDp;

  const slope = quantity * (1 - adValoremFraction);
  const algebraic = (buy.netAmount + flatSellCharges) / slope;

  let breakevenSellPrice = algebraic;
  const trial = tradeCharges({ ...shared, side: "sell", price: algebraic });
  if (trial) {
    const residual = trial.netAmount - buy.netAmount;
    breakevenSellPrice = algebraic - residual / slope;
  }

  const combinedTurnover = buy.turnover + sell.turnover;
  const chargesPercentOfTurnover = round4((totalCharges / combinedTurnover) * 100);

  return {
    buy,
    sell,
    totalCharges,
    grossPnl,
    netPnl,
    breakevenSellPrice,
    chargesPercentOfTurnover,
  };
}
