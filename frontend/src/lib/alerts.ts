const STORAGE_KEY = "ff-price-alerts";

export type PriceAlert = {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: "above" | "below";
  note: string;
  createdAt: string;
};

function read(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PriceAlert[];
  } catch {
    return [];
  }
}

function write(alerts: PriceAlert[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // storage full or unavailable (e.g. Safari private mode)
  }
}

/** Get all price alerts */
export function getAlerts(): PriceAlert[] {
  return read();
}

/** Get alerts for a specific symbol */
export function getAlertsForSymbol(symbol: string): PriceAlert[] {
  return read().filter((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
}

/** Add a new price alert */
export function addAlert(
  symbol: string,
  targetPrice: number,
  condition: "above" | "below",
  note: string = ""
): PriceAlert {
  const alerts = read();
  const newAlert: PriceAlert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: symbol.toUpperCase(),
    targetPrice,
    condition,
    note,
    createdAt: new Date().toISOString(),
  };
  alerts.push(newAlert);
  write(alerts);
  return newAlert;
}

/** Remove an alert by id */
export function removeAlert(id: string): void {
  const alerts = read().filter((a) => a.id !== id);
  write(alerts);
}

/** Check which alerts have been triggered given current prices */
export function checkAlerts(
  prices: Record<string, number>
): Array<PriceAlert & { currentPrice: number }> {
  const alerts = read();
  const triggered: Array<PriceAlert & { currentPrice: number }> = [];
  for (const alert of alerts) {
    const currentPrice = prices[alert.symbol.toUpperCase()];
    if (currentPrice === undefined) continue;
    const hit =
      alert.condition === "above"
        ? currentPrice >= alert.targetPrice
        : currentPrice <= alert.targetPrice;
    if (hit) {
      triggered.push({ ...alert, currentPrice });
    }
  }
  return triggered;
}
