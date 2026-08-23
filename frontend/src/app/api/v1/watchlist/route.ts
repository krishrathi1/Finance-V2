import { NextRequest, NextResponse } from "next/server";

import { query } from "@/server/infrastructure/db";
import { getCurrentUser } from "@/lib/current-user";

/**
 * Server-side watchlist store, keyed by (user, list name, symbol). Mirrors
 * the shape `lib/watchlist.ts` already keeps in localStorage so the client
 * can treat a GET response as a drop-in replacement for its local store.
 */

const DEFAULT_LIST = "My Watchlist";
const MAX_LIST_NAME_LENGTH = 60;
const MAX_SYMBOL_LENGTH = 20;
const MAX_NOTE_LENGTH = 500;
const MAX_LISTS_PER_USER = 25;
const MAX_ITEMS_PER_LIST = 200;

type WatchlistStore = {
  lists: Record<string, string[]>;
  notes: Record<string, Record<string, string>>;
};

type ListRow = { name: string };
type ItemRow = { list_name: string; symbol: string; note: string | null };

function cleanListName(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_LIST_NAME_LENGTH);
}

function cleanSymbol(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().slice(0, MAX_SYMBOL_LENGTH);
}

async function loadStore(userId: number): Promise<WatchlistStore> {
  const [listRows, itemRows] = await Promise.all([
    query<ListRow[]>("SELECT name FROM watchlist_lists WHERE user_id = ? ORDER BY id ASC", [userId]),
    query<ItemRow[]>(
      "SELECT list_name, symbol, note FROM watchlists WHERE user_id = ? ORDER BY added_at ASC",
      [userId]
    ),
  ]);

  const lists: Record<string, string[]> = { [DEFAULT_LIST]: [] };
  const notes: Record<string, Record<string, string>> = { [DEFAULT_LIST]: {} };

  for (const row of listRows) {
    if (!lists[row.name]) lists[row.name] = [];
    if (!notes[row.name]) notes[row.name] = {};
  }
  for (const row of itemRows) {
    if (!lists[row.list_name]) lists[row.list_name] = [];
    if (!notes[row.list_name]) notes[row.list_name] = {};
    lists[row.list_name].push(row.symbol);
    if (row.note) notes[row.list_name][row.symbol] = row.note;
  }

  return { lists, notes };
}

async function ensureListExists(userId: number, listName: string): Promise<boolean> {
  const countRows = await query<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM watchlist_lists WHERE user_id = ?",
    [userId]
  );
  const existing = await query<ListRow[]>(
    "SELECT name FROM watchlist_lists WHERE user_id = ? AND name = ?",
    [userId, listName]
  );
  if (existing.length > 0) return true;
  if ((countRows[0]?.c ?? 0) >= MAX_LISTS_PER_USER) return false;
  await query("INSERT IGNORE INTO watchlist_lists (user_id, name) VALUES (?, ?)", [userId, listName]);
  return true;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);

  try {
    const store = user ? await loadStore(user.id) : { lists: { [DEFAULT_LIST]: [] }, notes: { [DEFAULT_LIST]: {} } };
    return NextResponse.json(store, { status: 200 });
  } catch {
    return NextResponse.json({ lists: { [DEFAULT_LIST]: [] }, notes: { [DEFAULT_LIST]: {} } }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const listName = cleanListName(body?.listName) || DEFAULT_LIST;
  const symbol = cleanSymbol(body?.symbol);
  const exchange = String(body?.exchange || "NSE").trim().toUpperCase().slice(0, 20) || "NSE";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : "";

  try {
    switch (action) {
      case "createList": {
        if (!listName) return NextResponse.json({ detail: "List name required" }, { status: 400 });
        const created = await ensureListExists(user.id, listName);
        if (!created) {
          return NextResponse.json({ detail: "Watchlist limit reached" }, { status: 400 });
        }
        break;
      }

      case "deleteList": {
        if (listName === DEFAULT_LIST) break; // default list can't be deleted, same as the client fallback
        await query("DELETE FROM watchlists WHERE user_id = ? AND list_name = ?", [user.id, listName]);
        await query("DELETE FROM watchlist_lists WHERE user_id = ? AND name = ?", [user.id, listName]);
        break;
      }

      case "addSymbol": {
        if (!symbol) return NextResponse.json({ detail: "Symbol required" }, { status: 400 });
        const existingItems = await query<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM watchlists WHERE user_id = ? AND list_name = ? AND symbol != ?",
          [user.id, listName, symbol]
        );
        if ((existingItems[0]?.c ?? 0) >= MAX_ITEMS_PER_LIST) {
          return NextResponse.json({ detail: "Watchlist item limit reached" }, { status: 400 });
        }
        const listOk = await ensureListExists(user.id, listName);
        if (!listOk) {
          return NextResponse.json({ detail: "Watchlist limit reached" }, { status: 400 });
        }
        await query(
          "INSERT INTO watchlists (user_id, list_name, symbol, exchange) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE exchange = VALUES(exchange)",
          [user.id, listName, symbol, exchange]
        );
        break;
      }

      case "removeSymbol": {
        if (!symbol) return NextResponse.json({ detail: "Symbol required" }, { status: 400 });
        await query("DELETE FROM watchlists WHERE user_id = ? AND list_name = ? AND symbol = ?", [
          user.id,
          listName,
          symbol,
        ]);
        break;
      }

      case "setNote": {
        if (!symbol) return NextResponse.json({ detail: "Symbol required" }, { status: 400 });
        await query("UPDATE watchlists SET note = ? WHERE user_id = ? AND list_name = ? AND symbol = ?", [
          note || null,
          user.id,
          listName,
          symbol,
        ]);
        break;
      }

      case "merge": {
        // Bulk-imports a client's localStorage store (called once right after
        // login) so switching a long-time anonymous user over to server sync
        // doesn't silently drop what they'd already saved.
        const incoming = body?.store as
          | { lists?: Record<string, string[]>; notes?: Record<string, Record<string, string>> }
          | undefined;
        if (incoming?.lists && typeof incoming.lists === "object") {
          const listNames = Object.keys(incoming.lists).slice(0, MAX_LISTS_PER_USER);
          for (const rawName of listNames) {
            const name = cleanListName(rawName);
            if (!name) continue;
            const listOk = await ensureListExists(user.id, name);
            if (!listOk) continue;
            const symbols = Array.isArray(incoming.lists[rawName])
              ? incoming.lists[rawName].slice(0, MAX_ITEMS_PER_LIST)
              : [];
            for (const rawSymbol of symbols) {
              const cleanedSymbol = cleanSymbol(rawSymbol);
              if (!cleanedSymbol) continue;
              const rawNote = incoming.notes?.[rawName]?.[cleanedSymbol];
              const cleanedNote =
                typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, MAX_NOTE_LENGTH) : null;
              await query(
                "INSERT INTO watchlists (user_id, list_name, symbol, exchange, note) VALUES (?, ?, ?, 'NSE', ?) ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)",
                [user.id, name, cleanedSymbol, cleanedNote]
              );
            }
          }
        }
        break;
      }

      default:
        return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(await loadStore(user.id));
  } catch (error) {
    console.error("Watchlist mutation error:", error);
    return NextResponse.json({ detail: "Failed to update watchlist" }, { status: 500 });
  }
}
