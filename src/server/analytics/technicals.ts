// Technical indicators computed from the deterministic price series.

import { getSeries, getLiveQuote } from "../market/engine";

export interface Technicals {
  rsi14: number;
  macd: number;
  macdSignal: number;
  ema20: number;
  ema50: number;
  sma200: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  volatility3M: number; // annualised stdev of daily returns
  drawdown1Y: number; // % below 1Y peak
  return1M: number;
  return3M: number;
  return6M: number;
  return1Y: number;
  pivot: number;
  r1: number;
  s1: number;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, values.length);
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function computeTechnicals(symbol: string): Technicals {
  const series = getSeries(symbol);
  const quote = getLiveQuote(symbol);
  const closes = series.map((p) => p.close);
  const price = quote?.price ?? closes[closes.length - 1] ?? 0;

  // RSI 14
  let rsi = 50;
  if (closes.length > 15) {
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  // MACD (12, 26, 9)
  const ema12 = ema(closes.slice(-80), 12);
  const ema26 = ema(closes.slice(-80), 26);
  const macdRaw = ema12 - ema26;
  const macdSeries: number[] = [];
  for (let end = 40; end <= closes.length; end++) {
    const slice = closes.slice(Math.max(0, end - 80), end);
    macdSeries.push(ema(slice, 12) - ema(slice, 26));
  }
  const macdSignal = ema(macdSeries.slice(-30), 9);

  const ema20 = ema(closes.slice(-60), 20);
  const ema50 = ema(closes.slice(-120), 50);
  const sma200 = closes.length >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : closes.slice(-60).reduce((a, b) => a + b, 0) / Math.max(1, closes.slice(-60).length);

  // 3M volatility (annualised)
  const rets: number[] = [];
  for (let i = Math.max(1, closes.length - 65); i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const m = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((acc, r) => acc + (r - m) ** 2, 0) / Math.max(1, rets.length - 1);
  const volatility3M = Math.sqrt(variance) * Math.sqrt(252) * 100;

  // 1Y drawdown
  const yearSlice = closes.slice(-250);
  const peak = Math.max(...yearSlice);
  const drawdown1Y = peak > 0 ? ((price - peak) / peak) * 100 : 0;

  const pct = (n: number) => (closes.length > n && closes[closes.length - 1 - n] > 0
    ? ((price - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100
    : 0);

  const trend: Technicals["trend"] =
    ema20 > ema50 * 1.01 && price > sma200 ? "Bullish" : ema20 < ema50 * 0.99 && price < sma200 ? "Bearish" : "Neutral";

  const prevClose = quote?.prevClose ?? price;
  const pivot = (prevClose + (quote?.dayHigh ?? price) + (quote?.dayLow ?? price)) / 3;

  return {
    rsi14: Math.round(rsi * 10) / 10,
    macd: Math.round(macdRaw * 100) / 100,
    macdSignal: Math.round(macdSignal * 100) / 100,
    ema20: Math.round(ema20 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    trend,
    volatility3M: Math.round(volatility3M * 10) / 10,
    drawdown1Y: Math.round(drawdown1Y * 10) / 10,
    return1M: Math.round(pct(21) * 10) / 10,
    return3M: Math.round(pct(63) * 10) / 10,
    return6M: Math.round(pct(126) * 10) / 10,
    return1Y: Math.round(pct(250) * 10) / 10,
    pivot: Math.round(pivot * 100) / 100,
    r1: Math.round((2 * pivot - (quote?.dayLow ?? price)) * 100) / 100,
    s1: Math.round((2 * pivot - (quote?.dayHigh ?? price)) * 100) / 100,
  };
}
