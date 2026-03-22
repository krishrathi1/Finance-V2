const STORAGE_KEY = "portfolio_holdings";

export type Holding = {
  id: string;
  symbol: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string; // ISO date "YYYY-MM-DD"
  notes?: string;
};

export type HoldingWithValue = Holding & {
  currentPrice: number | null;
  currentValue: number | null;
  investedValue: number;
  pnl: number | null;
  pnlPercent: number | null;
};

function save(holdings: Holding[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    // storage full or unavailable
  }
}

export function getHoldings(): Holding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Holding[]) : [];
  } catch {
    return [];
  }
}

export function addHolding(
  symbol: string,
  companyName: string,
  quantity: number,
  buyPrice: number,
  buyDate: string,
  notes?: string
): Holding {
  const holding: Holding = {
    id: `${symbol.toUpperCase()}_${Date.now()}`,
    symbol: symbol.toUpperCase(),
    companyName,
    quantity,
    buyPrice,
    buyDate,
    notes,
  };
  const holdings = getHoldings();
  holdings.push(holding);
  save(holdings);
  return holding;
}

export function removeHolding(id: string): void {
  save(getHoldings().filter((h) => h.id !== id));
}

export function updateHolding(id: string, updates: Partial<Omit<Holding, "id">>): void {
  save(getHoldings().map((h) => (h.id === id ? { ...h, ...updates } : h)));
}

export function hasHolding(symbol: string): boolean {
  return getHoldings().some((h) => h.symbol === symbol.toUpperCase());
}

export function enrichHoldings(
  holdings: Holding[],
  prices: Record<string, number>
): HoldingWithValue[] {
  return holdings.map((h) => {
    const currentPrice = prices[h.symbol] ?? null;
    const investedValue = h.quantity * h.buyPrice;
    const currentValue = currentPrice !== null ? h.quantity * currentPrice : null;
    const pnl = currentValue !== null ? currentValue - investedValue : null;
    const pnlPercent = pnl !== null && investedValue > 0 ? (pnl / investedValue) * 100 : null;
    return { ...h, currentPrice, currentValue, investedValue, pnl, pnlPercent };
  });
}

export function portfolioSummary(enriched: HoldingWithValue[]) {
  const totalInvested = enriched.reduce((s, h) => s + h.investedValue, 0);
  const knownValue = enriched.filter((h) => h.currentValue !== null);
  const totalCurrentValue = knownValue.reduce((s, h) => s + (h.currentValue ?? 0), 0);
  const partialInvested = knownValue.reduce((s, h) => s + h.investedValue, 0);
  const totalPnl = totalCurrentValue - partialInvested;
  const totalPnlPercent = partialInvested > 0 ? (totalPnl / partialInvested) * 100 : 0;
  return { totalInvested, totalCurrentValue, totalPnl, totalPnlPercent, knownCount: knownValue.length };
}
