import { getTransactions, recordTransaction, removeTransaction } from "@/lib/transactions";

const STORAGE_KEY = "portfolio_holdings";

/**
 * Ledger id for the purchase that opened a holding.
 *
 * Deterministic so the two stay tied together: editing a holding corrects that
 * same ledger row instead of appending a second, contradictory purchase, and
 * deleting a holding can remove exactly the row it created.
 */
function openingTradeId(holdingId: string): string {
  return `buy_${holdingId}`;
}

/** Fired after a server hydration/merge overwrites localStorage, so any
 * already-rendered portfolio UI knows to re-read from storage. */
export const PORTFOLIO_SYNCED_EVENT = "ff-portfolio-synced";

export type Holding = {
  id: string;
  symbol: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string; // ISO date "YYYY-MM-DD"
  notes?: string;
  targetPrice?: number;
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

// ---------------------------------------------------------------------------
// Server sync (best-effort), mirroring lib/watchlist.ts.
//
// localStorage stays the source of truth for the current tab — every read and
// write above is synchronous and still works fully offline or signed out. When
// the user is signed in, mutations are additionally fired at the server in the
// background so the same account sees its portfolio on another device, and so
// the account's data export is actually populated. A failed sync just leaves
// the next login's hydration to reconcile things rather than blocking or
// erroring the UI mid-edit.
// ---------------------------------------------------------------------------

let authenticated = false;
let hydrated = false;

/** Set by the auth layer (see components/account-sync.tsx) whenever sign-in
 * state changes, so mutations know whether it's worth calling the server. */
export function setPortfolioAuthState(isAuthenticated: boolean) {
  authenticated = isAuthenticated;
}

/** Call on sign-out so the next sign-in (possibly a different account) hydrates fresh. */
export function resetPortfolioHydration() {
  hydrated = false;
}

function notifySynced() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PORTFOLIO_SYNCED_EVENT));
  }
}

function syncOp(action: string, extra: Record<string, unknown> = {}) {
  if (!authenticated || typeof window === "undefined") return;
  fetch("/api/v1/portfolio", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  }).catch(() => {
    // Offline or a transient server error — localStorage already has the
    // change; it'll reconcile on the next successful hydrate/merge.
  });
}

/**
 * Pulls the server's portfolio into localStorage. If there's local data that
 * predates sign-in (an anonymous user's holdings), it's merged into the server
 * store first so signing in never silently discards it.
 * Safe to call multiple times — only does work once per sign-in.
 */
export async function hydratePortfolioFromServer(): Promise<void> {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const local = getHoldings();

    const res = local.length
      ? await fetch("/api/v1/portfolio", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "merge", holdings: local }),
        })
      : await fetch("/api/v1/portfolio", { credentials: "include" });

    if (res.ok) {
      const payload = (await res.json()) as { holdings?: Holding[] };
      if (Array.isArray(payload.holdings)) {
        save(payload.holdings);
        notifySynced();
      }
    }
  } catch {
    // Offline or logged out mid-flight — keep whatever's already local.
  }
}

export function addHolding(
  symbol: string,
  companyName: string,
  quantity: number,
  buyPrice: number,
  buyDate: string,
  notes?: string,
  targetPrice?: number
): Holding {
  const holding: Holding = {
    // The random suffix matters now that this id is also the server's unique
    // key: a bare timestamp collides when two holdings of the same symbol are
    // added inside one millisecond (a bulk import does exactly that), and on
    // the server a collision is an overwrite, not a duplicate row.
    id: `${symbol.toUpperCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    symbol: symbol.toUpperCase(),
    companyName,
    quantity,
    buyPrice,
    buyDate,
    notes,
    targetPrice,
  };
  const holdings = getHoldings();
  holdings.push(holding);
  save(holdings);
  syncOp("upsert", { holding });
  writeOpeningTrade(holding);
  return holding;
}

/** Mirror a holding into the ledger as its opening purchase. */
function writeOpeningTrade(holding: Holding): void {
  recordTransaction({
    id: openingTradeId(holding.id),
    symbol: holding.symbol,
    companyName: holding.companyName,
    side: "buy",
    quantity: holding.quantity,
    price: holding.buyPrice,
    tradedOn: holding.buyDate,
    notes: holding.notes,
  });
}

/**
 * Delete a holding outright.
 *
 * This is "I never owned this" — a mistaken entry — so the opening purchase
 * goes with it. Exiting a position you really held is a sale: use
 * `closeHoldingUnits` alongside a recorded sell, which keeps the history.
 */
export function removeHolding(id: string): void {
  save(getHoldings().filter((h) => h.id !== id));
  syncOp("remove", { id });
  removeTransaction(openingTradeId(id));
}

export function updateHolding(id: string, updates: Partial<Omit<Holding, "id">>): void {
  const updated = getHoldings().map((h) => (h.id === id ? { ...h, ...updates } : h));
  save(updated);
  const holding = updated.find((h) => h.id === id);
  if (!holding) return;
  syncOp("upsert", { holding });
  // An edit is a correction to what was bought, so the opening trade is
  // rewritten to match rather than left contradicting the holding.
  writeOpeningTrade(holding);
}

/**
 * Reduce a holding because units were sold.
 *
 * Deliberately separate from `updateHolding` and `removeHolding`: both of
 * those rewrite the opening purchase, which would be wrong here. Selling half
 * a position must not restate the purchase as having been half the size — that
 * would erase the cost basis the realised gain is computed against. The sale
 * itself is recorded by the caller as its own ledger entry.
 *
 * @returns true if the position was fully closed.
 */
export function closeHoldingUnits(id: string, quantity: number): boolean {
  const holdings = getHoldings();
  const holding = holdings.find((h) => h.id === id);
  if (!holding) return false;

  const remaining = holding.quantity - quantity;
  // Floating-point tolerance: 0.3 + 0.6 - 0.9 is not exactly 0, and a residue
  // of 1e-16 units would leave a phantom position on screen forever.
  if (remaining <= 1e-9) {
    save(holdings.filter((h) => h.id !== id));
    syncOp("remove", { id });
    return true;
  }

  const updated = holdings.map((h) => (h.id === id ? { ...h, quantity: remaining } : h));
  save(updated);
  syncOp("upsert", { holding: { ...holding, quantity: remaining } });
  return false;
}

/**
 * Give holdings that predate the ledger an opening purchase.
 *
 * Without this, an existing user's realised P&L and XIRR would start from
 * empty and stay wrong until they happened to re-enter everything — the
 * feature would look broken precisely for the people with the most history.
 * Idempotent: only holdings with no ledger row are touched.
 */
export function backfillLedgerFromHoldings(): number {
  const existingIds = new Set(getTransactions().map((transaction) => transaction.id));
  let created = 0;
  for (const holding of getHoldings()) {
    if (existingIds.has(openingTradeId(holding.id))) continue;
    writeOpeningTrade(holding);
    created += 1;
  }
  return created;
}

export function hasHolding(symbol: string): boolean {
  return getHoldings().some((h) => h.symbol === symbol.toUpperCase());
}

/**
 * A quote we are willing to value a position at, or null.
 *
 * Zero is the dangerous one and the reason this exists. `prices[symbol] ?? null`
 * only rejects null and undefined, so a provider returning `cmp: 0` — a
 * suspended scrip, a pre-open row, a bad parse — sailed through as a real
 * price and valued the holding at nothing, reporting a clean −100% on a
 * position whose shares still exist. NaN was worse: one poisoned holding
 * turned every total on the page into NaN, because addition propagates it.
 *
 * Treating all of these as "no price yet" routes them into the path the UI
 * already handles well — the row shows a dash and drops out of the totals,
 * which is honest, rather than asserting a loss that did not happen.
 */
function usablePrice(value: unknown): number | null {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Finite or zero — keeps one corrupt row from poisoning a whole total. */
const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

export function enrichHoldings(
  holdings: Holding[],
  prices: Record<string, number>
): HoldingWithValue[] {
  // Indexed case-insensitively rather than read by exact key. Holdings are
  // stored upper-cased, but a row that predates that rule (or one a user
  // hand-edited in localStorage) would otherwise never match its own price
  // and sit permanently unvalued while the quote was sitting right there.
  const bySymbol = new Map<string, number>();
  for (const [symbol, value] of Object.entries(prices ?? {})) {
    const price = usablePrice(value);
    if (price !== null) bySymbol.set(String(symbol).trim().toUpperCase(), price);
  }

  return holdings.map((h) => {
    const currentPrice = bySymbol.get(String(h.symbol).trim().toUpperCase()) ?? null;
    const investedValue = finiteOrZero(h.quantity * h.buyPrice);
    const currentValue = currentPrice !== null ? finiteOrZero(h.quantity * currentPrice) : null;
    const pnl = currentValue !== null ? currentValue - investedValue : null;
    const pnlPercent = pnl !== null && investedValue > 0 ? (pnl / investedValue) * 100 : null;
    return { ...h, currentPrice, currentValue, investedValue, pnl, pnlPercent };
  });
}

export function portfolioSummary(enriched: HoldingWithValue[]) {
  const totalInvested = enriched.reduce((s, h) => s + finiteOrZero(h.investedValue), 0);
  const knownValue = enriched.filter((h) => h.currentValue !== null);
  const totalCurrentValue = knownValue.reduce((s, h) => s + finiteOrZero(h.currentValue ?? 0), 0);
  const partialInvested = knownValue.reduce((s, h) => s + finiteOrZero(h.investedValue), 0);
  const totalPnl = totalCurrentValue - partialInvested;
  const totalPnlPercent = partialInvested > 0 ? (totalPnl / partialInvested) * 100 : 0;
  return { totalInvested, totalCurrentValue, totalPnl, totalPnlPercent, knownCount: knownValue.length };
}
