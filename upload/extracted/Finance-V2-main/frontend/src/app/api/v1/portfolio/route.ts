import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/server/infrastructure/db";
import {
  MAX_COMPANY_NAME_LENGTH,
  MAX_HOLDINGS_PER_USER,
  MAX_NOTE_LENGTH,
  cleanClientId,
  cleanSymbol,
  cleanText,
  decimalToNumber,
  parseIsoDate,
  parseOptionalPositiveNumber,
  parsePositiveNumber,
} from "@/server/application/account-sync";

/**
 * Server-side portfolio store.
 *
 * Mirrors the shape `lib/portfolio.ts` keeps in localStorage so a GET response
 * is a drop-in replacement for the local store, exactly like the watchlist
 * route. Holdings are keyed by the client-generated id, which is what lets the
 * same holding be recognised across devices without a server round-trip on
 * every local read.
 *
 * Before this existed, `portfolios` was written by nothing: the whole feature
 * lived in localStorage, so a cache clear destroyed a user's portfolio and the
 * DPDP data export (which reads this table) always returned an empty list.
 */

export const dynamic = "force-dynamic";

type HoldingRow = {
  id: number;
  client_id: string | null;
  symbol: string;
  company_name: string | null;
  quantity: string | number;
  buy_price: string | number;
  buy_date: string | null;
  notes: string | null;
  target_price: string | number | null;
};

type Holding = {
  id: string;
  symbol: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  notes?: string;
  targetPrice?: number;
};

/** Parsed, validated form of an incoming holding — ready to write. */
type HoldingInput = {
  clientId: string;
  symbol: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string | null;
  notes: string | null;
  targetPrice: number | null;
};

function rowToHolding(row: HoldingRow): Holding {
  const targetPrice = decimalToNumber(row.target_price);
  return {
    // Rows created before client ids existed still need a stable React key and
    // a handle the client can send back for update/remove, so they borrow the
    // primary key under a prefix that can't collide with a minted client id
    // (`SYMBOL_timestamp`).
    id: row.client_id || `db-${row.id}`,
    symbol: row.symbol,
    companyName: row.company_name || row.symbol,
    quantity: decimalToNumber(row.quantity) ?? 0,
    buyPrice: decimalToNumber(row.buy_price) ?? 0,
    buyDate: row.buy_date || "",
    ...(row.notes ? { notes: row.notes } : {}),
    ...(targetPrice !== null ? { targetPrice } : {}),
  };
}

async function loadHoldings(userId: number): Promise<Holding[]> {
  const rows = await query<HoldingRow[]>(
    `SELECT id, client_id, symbol, company_name, quantity, buy_price, buy_date, notes, target_price
     FROM portfolios WHERE user_id = ? ORDER BY added_at ASC, id ASC`,
    [userId]
  );
  return rows.map(rowToHolding);
}

/**
 * Coerce one incoming holding. Returns null when the row can't be trusted —
 * a bulk merge skips those rather than storing a position with a fabricated
 * quantity or price, which would quietly corrupt P&L for every other holding
 * by shifting the portfolio total.
 */
function parseHolding(raw: unknown): HoldingInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const clientId = cleanClientId(value.id);
  const symbol = cleanSymbol(value.symbol);
  const quantity = parsePositiveNumber(value.quantity);
  const buyPrice = parsePositiveNumber(value.buyPrice);
  if (!clientId || !symbol || quantity === null || buyPrice === null) return null;

  return {
    clientId,
    symbol,
    companyName: cleanText(value.companyName, MAX_COMPANY_NAME_LENGTH) || symbol,
    quantity,
    buyPrice,
    buyDate: parseIsoDate(value.buyDate),
    notes: cleanText(value.notes, MAX_NOTE_LENGTH),
    targetPrice: parseOptionalPositiveNumber(value.targetPrice),
  };
}

/**
 * Insert-if-absent, used by `merge`.
 *
 * Merge replays a browser's local holdings at login, and those can be stale —
 * a quantity corrected on another device would otherwise be overwritten by
 * whatever this browser last saw. A row that already exists server-side wins;
 * `id = id` is the no-op form of ON DUPLICATE KEY UPDATE, which keeps the
 * insert idempotent without touching the existing row.
 */
async function insertHoldingIfAbsent(userId: number, holding: HoldingInput): Promise<void> {
  await query(
    `INSERT INTO portfolios
       (user_id, client_id, symbol, company_name, quantity, buy_price, buy_date, notes, target_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      userId,
      holding.clientId,
      holding.symbol,
      holding.companyName,
      holding.quantity,
      holding.buyPrice,
      holding.buyDate,
      holding.notes,
      holding.targetPrice,
    ]
  );
}

async function countHoldings(userId: number): Promise<number> {
  const rows = await query<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM portfolios WHERE user_id = ?",
    [userId]
  );
  return rows[0]?.c ?? 0;
}

/**
 * Upsert keyed on (user_id, client_id). ON DUPLICATE KEY means a retried sync
 * — the client fires these in the background and retries are normal — updates
 * the existing row instead of creating a duplicate position.
 */
async function upsertHolding(userId: number, holding: HoldingInput): Promise<void> {
  await query(
    `INSERT INTO portfolios
       (user_id, client_id, symbol, company_name, quantity, buy_price, buy_date, notes, target_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       symbol = VALUES(symbol),
       company_name = VALUES(company_name),
       quantity = VALUES(quantity),
       buy_price = VALUES(buy_price),
       buy_date = VALUES(buy_date),
       notes = VALUES(notes),
       target_price = VALUES(target_price)`,
    [
      userId,
      holding.clientId,
      holding.symbol,
      holding.companyName,
      holding.quantity,
      holding.buyPrice,
      holding.buyDate,
      holding.notes,
      holding.targetPrice,
    ]
  );
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);

  try {
    const holdings = user ? await loadHoldings(user.id) : [];
    return NextResponse.json({ holdings }, { status: 200 });
  } catch {
    return NextResponse.json({ holdings: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ holdings: [] }, { status: 200 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    switch (action) {
      case "upsert": {
        const holding = parseHolding(body?.holding);
        if (!holding) {
          return NextResponse.json({ detail: "Invalid holding" }, { status: 400 });
        }
        // Counted excluding this client id so editing an existing holding at
        // the cap isn't rejected as if it were a new one.
        const existing = await query<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM portfolios WHERE user_id = ? AND (client_id IS NULL OR client_id != ?)",
          [user.id, holding.clientId]
        );
        if ((existing[0]?.c ?? 0) >= MAX_HOLDINGS_PER_USER) {
          return NextResponse.json({ detail: "Portfolio holding limit reached" }, { status: 400 });
        }
        await upsertHolding(user.id, holding);
        break;
      }

      case "remove": {
        const clientId = cleanClientId(body?.id);
        if (!clientId) return NextResponse.json({ detail: "Holding id required" }, { status: 400 });
        // Legacy rows are surfaced to the client as `db-<primary key>`; accept
        // that form back so a pre-sync holding is still deletable.
        const legacyId = clientId.startsWith("db-") ? Number(clientId.slice(3)) : NaN;
        if (Number.isInteger(legacyId)) {
          await query("DELETE FROM portfolios WHERE user_id = ? AND id = ?", [user.id, legacyId]);
        } else {
          await query("DELETE FROM portfolios WHERE user_id = ? AND client_id = ?", [user.id, clientId]);
        }
        break;
      }

      case "merge": {
        // One-shot bulk import of a signed-out user's local portfolio, called
        // right after login so signing in never discards what they had.
        const incoming = Array.isArray(body?.holdings) ? body.holdings : [];
        let remaining = MAX_HOLDINGS_PER_USER - (await countHoldings(user.id));
        for (const raw of incoming) {
          if (remaining <= 0) break;
          const holding = parseHolding(raw);
          if (!holding) continue;
          await insertHoldingIfAbsent(user.id, holding);
          remaining -= 1;
        }
        break;
      }

      default:
        return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ holdings: await loadHoldings(user.id) });
  } catch (error) {
    console.error("Portfolio mutation error:", error);
    return NextResponse.json({ detail: "Failed to update portfolio" }, { status: 500 });
  }
}
