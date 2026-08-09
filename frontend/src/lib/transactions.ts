import type { Transaction, TransactionSide } from "@/shared/portfolio-returns";

/**
 * Client-side transaction ledger.
 *
 * Same offline-first contract as lib/portfolio.ts and lib/alerts.ts:
 * localStorage answers reads synchronously so the UI never waits, and writes
 * additionally sync to the server in the background when signed in.
 */

const STORAGE_KEY = "ff-portfolio-transactions";

/** Fired after a server hydration/merge overwrites localStorage. */
export const TRANSACTIONS_SYNCED_EVENT = "ff-transactions-synced";

export type { Transaction, TransactionSide };

function read(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Transaction[]) : [];
  } catch {
    return [];
  }
}

function write(transactions: Transaction[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // storage full or unavailable (e.g. Safari private mode)
  }
}

let authenticated = false;
let hydrated = false;

export function setTransactionsAuthState(isAuthenticated: boolean) {
  authenticated = isAuthenticated;
}

export function resetTransactionsHydration() {
  hydrated = false;
}

function notifySynced() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TRANSACTIONS_SYNCED_EVENT));
  }
}

function syncOp(action: string, extra: Record<string, unknown> = {}) {
  if (!authenticated || typeof window === "undefined") return;
  fetch("/api/v1/portfolio/transactions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  }).catch(() => {
    // Offline or transient failure — localStorage already has the change and
    // the next hydrate/merge reconciles it.
  });
}

export async function hydrateTransactionsFromServer(): Promise<void> {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const local = read();

    const res = local.length
      ? await fetch("/api/v1/portfolio/transactions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "merge", transactions: local }),
        })
      : await fetch("/api/v1/portfolio/transactions", { credentials: "include" });

    if (res.ok) {
      const payload = (await res.json()) as { transactions?: Transaction[] };
      if (Array.isArray(payload.transactions)) {
        write(payload.transactions);
        notifySynced();
      }
    }
  } catch {
    // Keep whatever's already local.
  }
}

export function getTransactions(): Transaction[] {
  return read();
}

export function getTransactionsForSymbol(symbol: string): Transaction[] {
  const upper = symbol.toUpperCase();
  return read().filter((transaction) => transaction.symbol.toUpperCase() === upper);
}

export function recordTransaction(input: {
  symbol: string;
  companyName?: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fees?: number;
  tradedOn: string;
  notes?: string;
  /**
   * Caller-supplied id, used to tie a ledger row to the thing that created it.
   * A holding derives a deterministic id for its opening purchase so that
   * editing the holding corrects that same row instead of appending a second,
   * contradictory purchase. Omit it for a genuinely new trade.
   */
  id?: string;
}): Transaction {
  const transaction: Transaction = {
    // Random suffix, not a bare timestamp: this id is the server's unique key,
    // and a bulk import can create several trades inside one millisecond.
    id: input.id || `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    symbol: input.symbol.toUpperCase(),
    companyName: input.companyName || input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees ?? 0,
    tradedOn: input.tradedOn,
    ...(input.notes ? { notes: input.notes } : {}),
  };

  // Replace-or-append, so a caller-supplied id corrects the existing row
  // rather than adding a duplicate. Matches the server's upsert semantics.
  const transactions = read().filter((existing) => existing.id !== transaction.id);
  transactions.push(transaction);
  write(transactions);
  syncOp("upsert", { transaction });
  return transaction;
}

/**
 * Delete a ledger entry.
 *
 * Offered because a mistyped trade would otherwise permanently skew every
 * realised figure, but it is the only way history changes — nothing in the app
 * rewrites or reorders entries on the user's behalf.
 */
export function removeTransaction(id: string): void {
  write(read().filter((transaction) => transaction.id !== id));
  syncOp("remove", { id });
}

/** Units currently held for a symbol according to the ledger alone. */
export function ledgerQuantity(symbol: string): number {
  return getTransactionsForSymbol(symbol).reduce(
    (total, transaction) =>
      transaction.side === "buy" ? total + transaction.quantity : total - transaction.quantity,
    0
  );
}
