import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/server/infrastructure/db";
import {
  MAX_COMPANY_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TRANSACTIONS_PER_USER,
  cleanClientId,
  cleanSymbol,
  cleanText,
  decimalToNumber,
  parseIsoDate,
  parseNonNegativeNumber,
  parsePositiveNumber,
  parseSide,
} from "@/server/application/account-sync";
import type { Transaction, TransactionSide } from "@/shared/portfolio-returns";

/**
 * The portfolio transaction ledger.
 *
 * `portfolios` answers "what do I hold"; this answers "what did I do". Keeping
 * them separate is deliberate: a sale removes a holding, so without an
 * append-only record of trades a closed position vanishes entirely and
 * realised profit, money-weighted return and any tax view become
 * unrecoverable.
 *
 * Same sync contract as the other account stores — localStorage is the
 * synchronous source of truth, this is the durable copy.
 */

export const dynamic = "force-dynamic";

type TransactionRow = {
  id: number;
  client_id: string | null;
  symbol: string;
  company_name: string | null;
  side: string;
  quantity: string | number;
  price: string | number;
  fees: string | number;
  traded_on: string;
  notes: string | null;
};

type TransactionInput = {
  clientId: string;
  symbol: string;
  companyName: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fees: number;
  tradedOn: string;
  notes: string | null;
};

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.client_id || `db-${row.id}`,
    symbol: row.symbol,
    companyName: row.company_name || row.symbol,
    side: row.side === "sell" ? "sell" : "buy",
    quantity: decimalToNumber(row.quantity) ?? 0,
    price: decimalToNumber(row.price) ?? 0,
    fees: decimalToNumber(row.fees) ?? 0,
    tradedOn: row.traded_on,
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

async function loadTransactions(userId: number): Promise<Transaction[]> {
  const rows = await query<TransactionRow[]>(
    `SELECT id, client_id, symbol, company_name, side, quantity, price, fees, traded_on, notes
     FROM portfolio_transactions WHERE user_id = ?
     ORDER BY traded_on ASC, id ASC`,
    [userId]
  );
  return rows.map(rowToTransaction);
}

/**
 * Coerce one incoming trade. Every field that could silently corrupt a
 * realised figure is rejected rather than defaulted — most importantly `side`,
 * where guessing would turn a sale into a purchase, and `tradedOn`, which
 * determines both FIFO ordering and the short/long-term split.
 */
function parseTransaction(raw: unknown): TransactionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const clientId = cleanClientId(value.id);
  const symbol = cleanSymbol(value.symbol);
  const side = parseSide(value.side);
  const quantity = parsePositiveNumber(value.quantity);
  const price = parsePositiveNumber(value.price);
  const fees = parseNonNegativeNumber(value.fees);
  const tradedOn = parseIsoDate(value.tradedOn);

  if (!clientId || !symbol || !side || quantity === null || price === null || fees === null || !tradedOn) {
    return null;
  }

  return {
    clientId,
    symbol,
    companyName: cleanText(value.companyName, MAX_COMPANY_NAME_LENGTH) || symbol,
    side,
    quantity,
    price,
    fees,
    tradedOn,
    notes: cleanText(value.notes, MAX_NOTE_LENGTH),
  };
}

async function countTransactions(userId: number): Promise<number> {
  const rows = await query<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM portfolio_transactions WHERE user_id = ?",
    [userId]
  );
  return rows[0]?.c ?? 0;
}

async function insertTransaction(
  userId: number,
  transaction: TransactionInput,
  /** Merge replays a browser's local ledger and must not overwrite a row that
   *  already exists server-side; `id = id` is the no-op form of upsert. */
  mode: "upsert" | "ifAbsent"
): Promise<void> {
  const onDuplicate =
    mode === "ifAbsent"
      ? "id = id"
      : `symbol = VALUES(symbol),
         company_name = VALUES(company_name),
         side = VALUES(side),
         quantity = VALUES(quantity),
         price = VALUES(price),
         fees = VALUES(fees),
         traded_on = VALUES(traded_on),
         notes = VALUES(notes)`;

  await query(
    `INSERT INTO portfolio_transactions
       (user_id, client_id, symbol, company_name, side, quantity, price, fees, traded_on, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE ${onDuplicate}`,
    [
      userId,
      transaction.clientId,
      transaction.symbol,
      transaction.companyName,
      transaction.side,
      transaction.quantity,
      transaction.price,
      transaction.fees,
      transaction.tradedOn,
      transaction.notes,
    ]
  );
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);

  try {
    const transactions = user ? await loadTransactions(user.id) : [];
    return NextResponse.json({ transactions }, { status: 200 });
  } catch {
    return NextResponse.json({ transactions: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    switch (action) {
      case "upsert": {
        const transaction = parseTransaction(body?.transaction);
        if (!transaction) {
          return NextResponse.json({ detail: "Invalid transaction" }, { status: 400 });
        }
        const existing = await query<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM portfolio_transactions WHERE user_id = ? AND (client_id IS NULL OR client_id != ?)",
          [user.id, transaction.clientId]
        );
        if ((existing[0]?.c ?? 0) >= MAX_TRANSACTIONS_PER_USER) {
          return NextResponse.json({ detail: "Transaction limit reached" }, { status: 400 });
        }
        await insertTransaction(user.id, transaction, "upsert");
        break;
      }

      case "remove": {
        const clientId = cleanClientId(body?.id);
        if (!clientId) return NextResponse.json({ detail: "Transaction id required" }, { status: 400 });
        const legacyId = clientId.startsWith("db-") ? Number(clientId.slice(3)) : NaN;
        if (Number.isInteger(legacyId)) {
          await query("DELETE FROM portfolio_transactions WHERE user_id = ? AND id = ?", [user.id, legacyId]);
        } else {
          await query("DELETE FROM portfolio_transactions WHERE user_id = ? AND client_id = ?", [
            user.id,
            clientId,
          ]);
        }
        break;
      }

      case "merge": {
        const incoming = Array.isArray(body?.transactions) ? body.transactions : [];
        let remaining = MAX_TRANSACTIONS_PER_USER - (await countTransactions(user.id));
        for (const raw of incoming) {
          if (remaining <= 0) break;
          const transaction = parseTransaction(raw);
          if (!transaction) continue;
          await insertTransaction(user.id, transaction, "ifAbsent");
          remaining -= 1;
        }
        break;
      }

      default:
        return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ transactions: await loadTransactions(user.id) });
  } catch (error) {
    console.error("Transaction mutation error:", error);
    return NextResponse.json({ detail: "Failed to update transactions" }, { status: 500 });
  }
}
