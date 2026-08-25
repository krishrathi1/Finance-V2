/**
 * NSE Option Chain & Greeks Analytics Engine
 * 
 * Computes:
 * 1. Strike Ladder around underlying Current Market Price (CMP)
 * 2. Real-time Greeks: Delta, Gamma, Theta, Vega, and Implied Volatility (IV)
 * 3. Max Pain Strike (the price at which option buyers lose the most money / option writers payout is minimized)
 * 4. PCR (Put-Call Ratio) with market sentiment interpretation
 * 5. OI Buildup classification: Long Buildup, Short Buildup, Short Covering, Long Unwinding
 */

export interface OptionStrikeData {
  strikePrice: number;
  isAtm: boolean;
  calls: {
    openInterest: number;
    changeInOi: number;
    changeInOiPct: number;
    volume: number;
    impliedVolatility: number;
    lastPrice: number;
    priceChange: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    buildup: "Long Buildup" | "Short Buildup" | "Short Covering" | "Long Unwinding" | "Neutral";
  };
  puts: {
    openInterest: number;
    changeInOi: number;
    changeInOiPct: number;
    volume: number;
    impliedVolatility: number;
    lastPrice: number;
    priceChange: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    buildup: "Long Buildup" | "Short Buildup" | "Short Covering" | "Long Unwinding" | "Neutral";
  };
}

export interface OptionChainAnalysis {
  symbol: string;
  underlyingPrice: number;
  expiryDate: string;
  availableExpiries: string[];
  lotSize: number;
  totalCallOi: number;
  totalPutOi: number;
  pcr: number; // Put Call Ratio
  pcrSentiment: "Extremely Bullish" | "Bullish" | "Neutral" | "Bearish" | "Extremely Bearish";
  maxPainStrike: number;
  atmStrike: number;
  highestCallOiStrike: number;
  highestPutOiStrike: number;
  strikes: OptionStrikeData[];
}

/** Standard Normal CDF approximation */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/** Standard Normal PDF */
function normalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/** Black-Scholes Formula for Option Pricing and Greeks */
function computeGreeks(
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  volatility: number,
  riskFreeRate: number = 0.065
) {
  const t = Math.max(timeToExpiryYears, 1 / 365);
  const sigma = Math.max(volatility, 0.05);
  const r = riskFreeRate;

  const d1 = (Math.log(spot / strike) + (r + (sigma * sigma) / 2) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);

  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nMinusD1 = normalCdf(-d1);
  const nMinusD2 = normalCdf(-d2);
  const pdfD1 = normalPdf(d1);

  // Prices
  const callPrice = spot * nd1 - strike * Math.exp(-r * t) * nd2;
  const putPrice = strike * Math.exp(-r * t) * nMinusD2 - spot * nMinusD1;

  // Greeks
  const callDelta = nd1;
  const putDelta = nd1 - 1;
  const gamma = pdfD1 / (spot * sigma * Math.sqrt(t));
  const vega = (spot * pdfD1 * Math.sqrt(t)) / 100; // per 1% vol change
  const callTheta =
    (-((spot * pdfD1 * sigma) / (2 * Math.sqrt(t))) - r * strike * Math.exp(-r * t) * nd2) / 365;
  const putTheta =
    (-((spot * pdfD1 * sigma) / (2 * Math.sqrt(t))) + r * strike * Math.exp(-r * t) * nMinusD2) / 365;

  return {
    callPrice: Math.max(0.05, callPrice),
    putPrice: Math.max(0.05, putPrice),
    callDelta: Number(callDelta.toFixed(3)),
    putDelta: Number(putDelta.toFixed(3)),
    gamma: Number(gamma.toFixed(4)),
    vega: Number(vega.toFixed(2)),
    callTheta: Number(callTheta.toFixed(2)),
    putTheta: Number(putTheta.toFixed(2)),
  };
}

function getStrikeStep(spot: number): number {
  if (spot > 20000) return 100;
  if (spot > 10000) return 50;
  if (spot > 3000) return 50;
  if (spot > 1000) return 20;
  if (spot > 500) return 10;
  if (spot > 100) return 5;
  return 2.5;
}

export function generateOptionChain(symbol: string, currentPrice: number = 2400): OptionChainAnalysis {
  const cleanSpot = isNaN(currentPrice) || currentPrice <= 0 ? 2400 : currentPrice;
  const spot = Math.max(0.5, cleanSpot);
  const step = getStrikeStep(spot);
  const atmStrike = Math.max(step, Math.round(spot / step) * step);

  const numStrikes = 10; // 10 strikes above and 10 strikes below ATM
  const strikes: OptionStrikeData[] = [];

  let totalCallOi = 0;
  let totalPutOi = 0;
  let maxCallOi = 0;
  let maxPutOi = 0;
  let highestCallOiStrike = atmStrike;
  let highestPutOiStrike = atmStrike;

  const tYears = 14 / 365; // ~2 weeks to expiry

  for (let i = -numStrikes; i <= numStrikes; i++) {
    const strike = atmStrike + i * step;
    const isAtm = strike === atmStrike;

    // IV curve with slight skew
    const iv = Math.max(12, 18 + Math.abs(strike - spot) / spot * 15);
    const greeks = computeGreeks(spot, strike, tYears, iv / 100);

    // Realistic Open Interest bell curves
    const callWeight = Math.max(0.05, Math.exp(-Math.pow((strike - (spot * 1.02)) / (spot * 0.08), 2)));
    const putWeight = Math.max(0.05, Math.exp(-Math.pow((strike - (spot * 0.98)) / (spot * 0.08), 2)));

    const callOi = Math.round(callWeight * 125000 + (strike % 3) * 4500);
    const putOi = Math.round(putWeight * 118000 + (strike % 2) * 3800);

    const callOiChg = Math.round((i > 0 ? 1 : -1) * (callOi * 0.12));
    const putOiChg = Math.round((i < 0 ? 1 : -1) * (putOi * 0.14));

    totalCallOi += callOi;
    totalPutOi += putOi;

    if (callOi > maxCallOi) {
      maxCallOi = callOi;
      highestCallOiStrike = strike;
    }
    if (putOi > maxPutOi) {
      maxPutOi = putOi;
      highestPutOiStrike = strike;
    }

    // Determine OI Buildup
    let callBuildup: OptionStrikeData["calls"]["buildup"] = "Neutral";
    if (callOiChg > 0 && greeks.callPrice > 0) callBuildup = "Long Buildup";
    else if (callOiChg > 0 && greeks.callPrice <= 0) callBuildup = "Short Buildup";
    else if (callOiChg < 0 && greeks.callPrice > 0) callBuildup = "Short Covering";
    else if (callOiChg < 0) callBuildup = "Long Unwinding";

    let putBuildup: OptionStrikeData["puts"]["buildup"] = "Neutral";
    if (putOiChg > 0 && greeks.putPrice > 0) putBuildup = "Long Buildup";
    else if (putOiChg > 0 && greeks.putPrice <= 0) putBuildup = "Short Buildup";
    else if (putOiChg < 0 && greeks.putPrice > 0) putBuildup = "Short Covering";
    else if (putOiChg < 0) putBuildup = "Long Unwinding";

    strikes.push({
      strikePrice: strike,
      isAtm,
      calls: {
        openInterest: callOi,
        changeInOi: callOiChg,
        changeInOiPct: Number(((callOiChg / (callOi || 1)) * 100).toFixed(1)),
        volume: Math.round(callOi * 1.8),
        impliedVolatility: Number(iv.toFixed(1)),
        lastPrice: Number(greeks.callPrice.toFixed(2)),
        priceChange: Number((greeks.callPrice * (spot > strike ? 0.04 : -0.05)).toFixed(2)),
        delta: greeks.callDelta,
        gamma: greeks.gamma,
        theta: greeks.callTheta,
        vega: greeks.vega,
        buildup: callBuildup,
      },
      puts: {
        openInterest: putOi,
        changeInOi: putOiChg,
        changeInOiPct: Number(((putOiChg / (putOi || 1)) * 100).toFixed(1)),
        volume: Math.round(putOi * 1.6),
        impliedVolatility: Number((iv * 1.05).toFixed(1)),
        lastPrice: Number(greeks.putPrice.toFixed(2)),
        priceChange: Number((greeks.putPrice * (spot < strike ? 0.04 : -0.05)).toFixed(2)),
        delta: greeks.putDelta,
        gamma: greeks.gamma,
        theta: greeks.putTheta,
        vega: greeks.vega,
        buildup: putBuildup,
      },
    });
  }

  // Calculate Max Pain: for every potential expiry strike, find the sum of losses for call & put buyers
  let minLoss = Infinity;
  let maxPainStrike = atmStrike;

  for (const candidate of strikes) {
    let totalBuyerLoss = 0;
    for (const row of strikes) {
      if (candidate.strikePrice > row.strikePrice) {
        // Calls ITM
        totalBuyerLoss += (candidate.strikePrice - row.strikePrice) * row.calls.openInterest;
      }
      if (candidate.strikePrice < row.strikePrice) {
        // Puts ITM
        totalBuyerLoss += (row.strikePrice - candidate.strikePrice) * row.puts.openInterest;
      }
    }

    if (totalBuyerLoss < minLoss) {
      minLoss = totalBuyerLoss;
      maxPainStrike = candidate.strikePrice;
    }
  }

  const pcr = Number((totalPutOi / (totalCallOi || 1)).toFixed(2));
  let pcrSentiment: OptionChainAnalysis["pcrSentiment"] = "Neutral";
  if (pcr > 1.4) pcrSentiment = "Extremely Bullish";
  else if (pcr > 1.05) pcrSentiment = "Bullish";
  else if (pcr < 0.65) pcrSentiment = "Extremely Bearish";
  else if (pcr < 0.85) pcrSentiment = "Bearish";

  // Expiry dates
  const nextThursday = new Date();
  nextThursday.setDate(nextThursday.getDate() + ((4 + 7 - nextThursday.getDay()) % 7 || 7));
  const expStr = nextThursday.toISOString().split("T")[0];

  return {
    symbol: symbol.toUpperCase(),
    underlyingPrice: Number(spot.toFixed(2)),
    expiryDate: expStr,
    availableExpiries: [expStr, "Monthly Expiry"],
    lotSize: spot > 10000 ? 25 : spot > 2000 ? 250 : 500,
    totalCallOi,
    totalPutOi,
    pcr,
    pcrSentiment,
    maxPainStrike,
    atmStrike,
    highestCallOiStrike,
    highestPutOiStrike,
    strikes,
  };
}
