// Market overview: indices, breadth, mood, movers, heatmap — one payload
// for the home surface.

import { UNIVERSE } from "./universe";
import { getTicker, getAllIndexQuotes, INDEX_CONSTITUENTS, getIndexQuote } from "./engine";
import { getMarketNews } from "./news";
import { isMarketOpen, istNow, clamp } from "./rng";

export interface MarketOverview {
  indices: ReturnType<typeof getAllIndexQuotes>;
  stats: {
    advancing: number;
    declining: number;
    unchanged: number;
    averageChange: number;
    universeCount: number;
  };
  mood: {
    value: number;
    level: "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";
    breadthScore: number;
    momentumScore: number;
    advancing: number;
    declining: number;
  };
  movers: {
    gainers: { symbol: string; name: string; price: number; changePercent: number }[];
    losers: { symbol: string; name: string; price: number; changePercent: number }[];
  };
  heatmap: {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    marketCapCr: number;
  }[];
  marketOpen: boolean;
  updatedAt: string;
}

export function getMarketOverview(): MarketOverview {
  const ticker = getTicker();
  const gainers = [...ticker]
    .filter((t) => t.price > 5)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 6);
  const losers = [...ticker]
    .filter((t) => t.price > 5)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 6);

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let totalChange = 0;
  for (const t of ticker) {
    if (t.changePercent > 0.05) advancing++;
    else if (t.changePercent < -0.05) declining++;
    else unchanged++;
    totalChange += t.changePercent;
  }
  const total = ticker.length || 1;
  const averageChange = Math.round((totalChange / total) * 100) / 100;

  const breadthScore = ((advancing + 0.5 * unchanged) / total) * 100;
  const momentumScore = clamp(50 + averageChange * 15, 0, 100);
  const moodValue = Math.round(0.65 * breadthScore + 0.35 * momentumScore);
  const moodLevel =
    moodValue >= 75 ? "Extreme Greed" : moodValue >= 56 ? "Greed" : moodValue >= 45 ? "Neutral" : moodValue >= 25 ? "Fear" : "Extreme Fear";

  // Heatmap: NIFTY 50 members by market cap
  const heatmap = INDEX_CONSTITUENTS.NIFTY50.map((seed) => {
    const t = ticker.find((r) => r.symbol === seed.s)!;
    return {
      symbol: seed.s,
      name: seed.n,
      price: t.price,
      changePercent: t.changePercent,
      marketCapCr: seed.mc,
    };
  }).sort((a, b) => b.marketCapCr - a.marketCapCr);

  return {
    indices: getAllIndexQuotes(),
    stats: {
      advancing,
      declining,
      unchanged,
      averageChange,
      universeCount: total,
    },
    mood: {
      value: moodValue,
      level: moodLevel,
      breadthScore: Math.round(breadthScore),
      momentumScore: Math.round(momentumScore),
      advancing,
      declining,
    },
    movers: {
      gainers: gainers.map((t) => ({ symbol: t.symbol, name: t.name, price: t.price, changePercent: t.changePercent })),
      losers: losers.map((t) => ({ symbol: t.symbol, name: t.name, price: t.price, changePercent: t.changePercent })),
    },
    heatmap,
    marketOpen: isMarketOpen(istNow()),
    updatedAt: new Date().toISOString(),
  };
}

export function getHeatmapForIndex(indexKey: string) {
  const constituents = INDEX_CONSTITUENTS[indexKey] ?? INDEX_CONSTITUENTS.NIFTY50;
  const index = getIndexQuote(indexKey, constituents);
  const ticker = getTicker(constituents.map((c) => c.s));
  const rows = constituents
    .map((seed) => {
      const t = ticker.find((r) => r.symbol === seed.s)!;
      return {
        symbol: seed.s,
        name: seed.n,
        price: t.price,
        changePercent: t.changePercent,
        marketCapCr: seed.mc,
      };
    })
    .sort((a, b) => b.marketCapCr - a.marketCapCr);
  return { index, rows };
}

export { getMarketNews };
