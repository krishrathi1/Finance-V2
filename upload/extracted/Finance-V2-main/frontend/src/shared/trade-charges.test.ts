import { describe, expect, it } from "vitest";

import { roundTrip, tradeCharges } from "@/shared/trade-charges";
import type { TradeChargesInput } from "@/shared/trade-charges";

describe("tradeCharges — delivery contract-note reconciliation", () => {
  // The realistic anchor case: 100 shares bought at 100 and sold at 110,
  // delivery on NSE, zero brokerage. Every line below is hand-computed from
  // the FY 2025-26 rates so a regression in any single rate fails loudly.
  const buy = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "delivery" })!;
  const sell = tradeCharges({ side: "sell", quantity: 100, price: 110, segment: "delivery" })!;

  it("prices the buy leg line by line", () => {
    expect(buy).not.toBeNull();
    expect(buy.turnover).toBe(10_000);
    expect(buy.brokerage).toBe(0); // delivery default
    expect(buy.stt).toBe(10); // 0.1% of 10,000
    expect(buy.exchangeTxn).toBe(0.3); // 0.00297% of 10,000 = 0.297 → 0.30
    expect(buy.sebiFee).toBe(0.01); // ₹10/crore on 10,000
    expect(buy.stampDuty).toBe(1.5); // 0.015% of 10,000, buy side only
    expect(buy.gst).toBe(0.06); // 18% of (0 + 0.30 + 0.01) = 0.0558 → 0.06
    expect(buy.dpCharge).toBe(0); // never on a buy
    expect(buy.totalCharges).toBe(11.87);
    expect(buy.netAmount).toBe(10_011.87); // turnover + charges: what you pay
  });

  it("prices the sell leg line by line", () => {
    expect(sell).not.toBeNull();
    expect(sell.turnover).toBe(11_000);
    expect(sell.brokerage).toBe(0);
    expect(sell.stt).toBe(11); // delivery STT hits the sell leg too
    expect(sell.exchangeTxn).toBe(0.33); // 0.3267 → 0.33
    expect(sell.sebiFee).toBe(0.01); // 0.011 → 0.01
    expect(sell.stampDuty).toBe(0); // buyer's tax, absent from a sell note
    expect(sell.gst).toBe(0.06); // 18% of (0.33 + 0.01) — STT and stamp excluded
    expect(sell.dpCharge).toBe(15.93); // depository fee for the demat debit
    expect(sell.totalCharges).toBe(27.33);
    expect(sell.netAmount).toBe(10_972.67); // turnover − charges: what you receive
  });

  it("keeps the printed total equal to the sum of the printed lines", () => {
    for (const leg of [buy, sell]) {
      const byHand =
        leg.brokerage + leg.stt + leg.exchangeTxn + leg.sebiFee + leg.stampDuty + leg.gst + leg.dpCharge;
      expect(leg.totalCharges).toBeCloseTo(byHand, 9);
    }
  });
});

describe("tradeCharges — rule asymmetries", () => {
  it("charges intraday STT on the sell only, at the lower rate", () => {
    const buy = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "intraday" })!;
    const sell = tradeCharges({ side: "sell", quantity: 100, price: 101, segment: "intraday" })!;
    expect(buy.stt).toBe(0);
    expect(sell.stt).toBe(2.53); // 0.025% of 10,100 = 2.525 → 2.53
  });

  it("charges stamp duty on the buy only, at the segment's rate", () => {
    const deliveryBuy = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "delivery" })!;
    const intradayBuy = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "intraday" })!;
    const deliverySell = tradeCharges({ side: "sell", quantity: 100, price: 100, segment: "delivery" })!;
    expect(deliveryBuy.stampDuty).toBe(1.5); // 0.015%
    expect(intradayBuy.stampDuty).toBe(0.3); // 0.003%
    expect(deliverySell.stampDuty).toBe(0);
  });

  it("levies GST on services only, never on STT or stamp duty", () => {
    // Zero brokerage delivery buy: if GST touched STT (10) or stamp (1.50),
    // it would be ~2.13 instead of 0.06.
    const buy = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "delivery" })!;
    expect(buy.gst).toBe(0.06);
    // With brokerage in the base it scales: 18% of (20 + 0.30 + 0.01) = 3.66.
    const intraday = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "intraday" })!;
    expect(intraday.gst).toBe(3.66);
  });

  it("applies the DP charge only where shares actually leave the demat", () => {
    const deliverySell = tradeCharges({ side: "sell", quantity: 10, price: 100, segment: "delivery" })!;
    const deliveryBuy = tradeCharges({ side: "buy", quantity: 10, price: 100, segment: "delivery" })!;
    const intradaySell = tradeCharges({ side: "sell", quantity: 10, price: 100, segment: "intraday" })!;
    expect(deliverySell.dpCharge).toBe(15.93);
    expect(deliveryBuy.dpCharge).toBe(0);
    expect(intradaySell.dpCharge).toBe(0);
  });

  it("uses the BSE transaction rate when asked", () => {
    const nse = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "delivery" })!;
    const bse = tradeCharges({ side: "buy", quantity: 100, price: 100, segment: "delivery", exchange: "BSE" })!;
    expect(nse.exchangeTxn).toBe(0.3); // 0.00297%
    expect(bse.exchangeTxn).toBe(0.38); // 0.00375% of 10,000 = 0.375 → 0.38
  });

  it("defaults brokerage by segment and honours overrides", () => {
    expect(tradeCharges({ side: "buy", quantity: 1, price: 1000, segment: "delivery" })!.brokerage).toBe(0);
    expect(tradeCharges({ side: "buy", quantity: 1, price: 1000, segment: "intraday" })!.brokerage).toBe(20);
    expect(
      tradeCharges({ side: "buy", quantity: 1, price: 1000, segment: "intraday", brokeragePerOrder: 5 })!.brokerage
    ).toBe(5);
    expect(
      tradeCharges({ side: "sell", quantity: 1, price: 1000, segment: "delivery", dpChargePerSell: 20 })!.dpCharge
    ).toBe(20);
    expect(
      tradeCharges({ side: "sell", quantity: 1, price: 1000, segment: "delivery", dpChargePerSell: 0 })!.dpCharge
    ).toBe(0);
  });
});

describe("tradeCharges — direction and extremes", () => {
  it("adds charges on a buy and subtracts them on a sell", () => {
    const buy = tradeCharges({ side: "buy", quantity: 50, price: 200, segment: "delivery" })!;
    const sell = tradeCharges({ side: "sell", quantity: 50, price: 200, segment: "delivery" })!;
    expect(buy.netAmount).toBeGreaterThan(buy.turnover);
    expect(sell.netAmount).toBeLessThan(sell.turnover);
  });

  it("lets a flat DP charge push a tiny sale's net negative", () => {
    // Selling one ₹5 share costs more in DP than it fetches — a real outcome
    // the calculator must report rather than clamp away.
    const sell = tradeCharges({ side: "sell", quantity: 1, price: 5, segment: "delivery" })!;
    expect(sell.dpCharge).toBe(15.93);
    expect(sell.netAmount).toBeLessThan(0);
  });

  it("stays finite on institutional-sized turnover", () => {
    const big = tradeCharges({ side: "sell", quantity: 1_000_000, price: 100_000, segment: "delivery" })!;
    expect(big.turnover).toBe(1e11);
    expect(big.stt).toBe(1e8); // 0.1% — STT dwarfs everything at size
    for (const value of Object.values(big)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("sums messy paise amounts to the printed total", () => {
    const leg = tradeCharges({ side: "sell", quantity: 7, price: 123.45, segment: "delivery", brokeragePerOrder: 11.11 })!;
    const byHand =
      leg.brokerage + leg.stt + leg.exchangeTxn + leg.sebiFee + leg.stampDuty + leg.gst + leg.dpCharge;
    expect(leg.totalCharges).toBeCloseTo(byHand, 9);
    expect(leg.netAmount).toBeCloseTo(leg.turnover - leg.totalCharges, 9);
  });
});

describe("tradeCharges — unusable input returns null", () => {
  const base: TradeChargesInput = { side: "buy", quantity: 100, price: 100, segment: "delivery" };

  it("rejects non-positive or non-finite quantity", () => {
    expect(tradeCharges({ ...base, quantity: 0 })).toBeNull();
    expect(tradeCharges({ ...base, quantity: -5 })).toBeNull();
    expect(tradeCharges({ ...base, quantity: NaN })).toBeNull();
    expect(tradeCharges({ ...base, quantity: Infinity })).toBeNull();
  });

  it("rejects non-positive or non-finite price", () => {
    expect(tradeCharges({ ...base, price: 0 })).toBeNull();
    expect(tradeCharges({ ...base, price: -1 })).toBeNull();
    expect(tradeCharges({ ...base, price: NaN })).toBeNull();
    expect(tradeCharges({ ...base, price: -Infinity })).toBeNull();
  });

  it("rejects negative or non-finite overrides", () => {
    expect(tradeCharges({ ...base, brokeragePerOrder: -1 })).toBeNull();
    expect(tradeCharges({ ...base, brokeragePerOrder: NaN })).toBeNull();
    expect(tradeCharges({ ...base, dpChargePerSell: -1 })).toBeNull();
    expect(tradeCharges({ ...base, dpChargePerSell: Infinity })).toBeNull();
  });

  it("rejects runtime junk the types would normally block", () => {
    expect(tradeCharges({ ...base, side: "short" as never })).toBeNull();
    expect(tradeCharges({ ...base, segment: "options" as never })).toBeNull();
    expect(tradeCharges({ ...base, exchange: "MCX" as never })).toBeNull();
    expect(tradeCharges(null as never)).toBeNull();
  });

  it("rejects a trade whose turnover rounds below a paisa", () => {
    expect(tradeCharges({ ...base, quantity: 0.01, price: 0.01 })).toBeNull();
  });

  it("overflow to Infinity in turnover is unusable, not a huge number", () => {
    expect(tradeCharges({ ...base, quantity: 1e308, price: 1e308 })).toBeNull();
  });
});

describe("roundTrip", () => {
  it("reconciles the anchor delivery trade end to end", () => {
    const rt = roundTrip({ quantity: 100, buyPrice: 100, sellPrice: 110, segment: "delivery" })!;
    expect(rt).not.toBeNull();
    expect(rt.totalCharges).toBe(39.2); // 11.87 + 27.33
    expect(rt.grossPnl).toBe(1000);
    expect(rt.netPnl).toBe(960.8); // 10,972.67 − 10,011.87
    expect(rt.chargesPercentOfTurnover).toBe(0.1867); // 39.20 / 21,000
    expect(rt.netPnl).toBeCloseTo(rt.grossPnl - rt.totalCharges, 9);
  });

  it("reconciles an intraday trade with default ₹20 brokerage", () => {
    const rt = roundTrip({ quantity: 100, buyPrice: 100, sellPrice: 101, segment: "intraday" })!;
    // Buy: 20 + 0 STT + 0.30 + 0.01 + 0.30 stamp + 3.66 GST = 24.27.
    expect(rt.buy.totalCharges).toBe(24.27);
    // Sell: 20 + 2.53 STT + 0.30 + 0.01 + 0 + 3.66 + 0 DP = 26.50.
    expect(rt.sell.totalCharges).toBe(26.5);
    expect(rt.totalCharges).toBe(50.77);
    expect(rt.grossPnl).toBe(100);
    expect(rt.netPnl).toBe(49.23); // over half the gross eaten by flat charges
  });

  it("reports a loss made worse by charges", () => {
    const rt = roundTrip({ quantity: 100, buyPrice: 100, sellPrice: 95, segment: "delivery" })!;
    expect(rt.grossPnl).toBe(-500);
    expect(rt.netPnl).toBeLessThan(-500);
  });

  it("shows a flat-charge exit at the same price as a net loss", () => {
    const rt = roundTrip({ quantity: 100, buyPrice: 100, sellPrice: 100, segment: "delivery" })!;
    expect(rt.grossPnl).toBe(0);
    expect(rt.netPnl).toBeCloseTo(-rt.totalCharges, 9);
  });

  it("propagates null from either leg", () => {
    expect(roundTrip({ quantity: 0, buyPrice: 100, sellPrice: 110, segment: "delivery" })).toBeNull();
    expect(roundTrip({ quantity: 100, buyPrice: NaN, sellPrice: 110, segment: "delivery" })).toBeNull();
    expect(roundTrip({ quantity: 100, buyPrice: 100, sellPrice: -1, segment: "delivery" })).toBeNull();
    expect(roundTrip(undefined as never)).toBeNull();
  });
});

describe("roundTrip — breakeven sell price", () => {
  it("nets to zero at the returned breakeven on the anchor delivery trade", () => {
    const rt = roundTrip({ quantity: 100, buyPrice: 100, sellPrice: 110, segment: "delivery" })!;
    // Algebra: (10,011.87 + 15.93) / (100 × (1 − 0.00103623)) ≈ 100.3821.
    expect(rt.breakevenSellPrice).toBeCloseTo(100.3821, 3);
    expect(rt.breakevenSellPrice).toBeGreaterThan(100); // charges are never free
    const at = roundTrip({
      quantity: 100,
      buyPrice: 100,
      sellPrice: rt.breakevenSellPrice,
      segment: "delivery",
    })!;
    expect(Math.abs(at.netPnl)).toBeLessThan(0.01);
  });

  it("nets to zero at breakeven for intraday, where flat brokerage dominates", () => {
    const rt = roundTrip({ quantity: 100, buyPrice: 100, sellPrice: 101, segment: "intraday" })!;
    // ₹40 of brokerage (+GST) across 100 shares needs roughly ₹0.50 of move.
    expect(rt.breakevenSellPrice).toBeGreaterThan(100.4);
    expect(rt.breakevenSellPrice).toBeLessThan(100.6);
    const at = roundTrip({
      quantity: 100,
      buyPrice: 100,
      sellPrice: rt.breakevenSellPrice,
      segment: "intraday",
    })!;
    expect(Math.abs(at.netPnl)).toBeLessThan(0.01);
  });

  it("nets to zero at breakeven under custom brokerage, DP, and BSE rates", () => {
    const config = {
      quantity: 37,
      buyPrice: 512.35,
      segment: "delivery" as const,
      brokeragePerOrder: 10,
      exchange: "BSE" as const,
      dpChargePerSell: 21.24,
    };
    const rt = roundTrip({ ...config, sellPrice: 600 })!;
    const at = roundTrip({ ...config, sellPrice: rt.breakevenSellPrice })!;
    expect(Math.abs(at.netPnl)).toBeLessThan(0.01);
  });

  it("puts breakeven far above the buy price for a tiny delivery sale", () => {
    // One ₹100 share must appreciate past the flat ₹15.93 DP charge alone.
    const rt = roundTrip({ quantity: 1, buyPrice: 100, sellPrice: 100, segment: "delivery" })!;
    expect(rt.breakevenSellPrice).toBeGreaterThan(116);
    const at = roundTrip({ quantity: 1, buyPrice: 100, sellPrice: rt.breakevenSellPrice, segment: "delivery" })!;
    expect(Math.abs(at.netPnl)).toBeLessThan(0.01);
  });
});
