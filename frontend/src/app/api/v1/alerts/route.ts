import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/server/infrastructure/db";
import {
  MAX_ALERTS_PER_USER,
  MAX_NOTE_LENGTH,
  cleanClientId,
  cleanSymbol,
  cleanText,
  decimalToNumber,
  parseCondition,
  parseOptionalPositiveNumber,
  parsePositiveNumber,
} from "@/server/application/account-sync";
import { initialArmedState, type AlertCondition } from "@/server/domain/alerts";

/**
 * Server-side price-alert store.
 *
 * Same sync model as the watchlist and portfolio routes: localStorage stays
 * the synchronous source of truth for the current tab, and these endpoints
 * make an alert outlive the browser it was created in — which is what lets
 * the delivery sweep in ./evaluate mail someone while their tab is closed.
 */

export const dynamic = "force-dynamic";

type AlertRow = {
  id: number;
  client_id: string | null;
  symbol: string;
  target_price: string | number;
  alert_condition: string;
  note: string | null;
  armed: number | boolean;
  triggered_at: string | null;
  triggered_price: string | number | null;
  created_at: string;
};

type StoredAlert = {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: AlertCondition;
  note: string;
  createdAt: string;
  armed: boolean;
  triggeredAt: string | null;
  triggeredPrice: number | null;
};

function rowToAlert(row: AlertRow): StoredAlert {
  return {
    id: row.client_id || `db-${row.id}`,
    symbol: row.symbol,
    targetPrice: decimalToNumber(row.target_price) ?? 0,
    condition: row.alert_condition === "below" ? "below" : "above",
    note: row.note || "",
    createdAt: row.created_at,
    armed: Boolean(row.armed),
    triggeredAt: row.triggered_at,
    triggeredPrice: decimalToNumber(row.triggered_price),
  };
}

async function loadAlerts(userId: number): Promise<StoredAlert[]> {
  const rows = await query<AlertRow[]>(
    `SELECT id, client_id, symbol, target_price, alert_condition, note, armed,
            triggered_at, triggered_price, created_at
     FROM price_alerts WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
    [userId]
  );
  return rows.map(rowToAlert);
}

type AlertInput = {
  clientId: string;
  symbol: string;
  targetPrice: number;
  condition: AlertCondition;
  note: string | null;
  armed: boolean;
};

/**
 * Coerce one incoming alert, deciding its initial armed state from the price
 * the client observed when the user set it.
 *
 * The price is a *hint*, not authority: it only decides whether the alert
 * starts armed, so the worst a bogus value can do is make the sender's own
 * alert fire early or late. Taking it from the request avoids a provider
 * round-trip inside a UI interaction that's expected to feel instant. When no
 * hint is supplied the alert starts armed — see `initialArmedState` for why
 * that direction is the safe default.
 */
function parseAlert(raw: unknown): AlertInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const clientId = cleanClientId(value.id);
  const symbol = cleanSymbol(value.symbol);
  const targetPrice = parsePositiveNumber(value.targetPrice);
  if (!clientId || !symbol || targetPrice === null) return null;

  const condition = parseCondition(value.condition);
  return {
    clientId,
    symbol,
    targetPrice,
    condition,
    note: cleanText(value.note, MAX_NOTE_LENGTH),
    armed: initialArmedState(condition, targetPrice, parseOptionalPositiveNumber(value.currentPrice)),
  };
}

/**
 * Upsert keyed on (user_id, client_id).
 *
 * Editing an alert's threshold resets its delivery state — triggered_at,
 * triggered_price and notified_at all go back to NULL — because the new
 * threshold has not been crossed yet. Without the reset, re-pointing a
 * previously fired alert at a fresh target would leave it permanently
 * "triggered" and it would never notify again.
 */
async function upsertAlert(userId: number, alert: AlertInput): Promise<void> {
  await query(
    `INSERT INTO price_alerts
       (user_id, client_id, symbol, target_price, alert_condition, note, armed)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       symbol = VALUES(symbol),
       target_price = VALUES(target_price),
       alert_condition = VALUES(alert_condition),
       note = VALUES(note),
       armed = VALUES(armed),
       triggered_at = NULL,
       triggered_price = NULL,
       notified_at = NULL`,
    [userId, alert.clientId, alert.symbol, alert.targetPrice, alert.condition, alert.note, alert.armed]
  );
}

/**
 * Insert-if-absent, used by `merge`.
 *
 * Merge replays a browser's local alerts at login, and those can be stale — an
 * alert edited on another device, or one that has already fired and mailed. So
 * a row that exists server-side wins: `id = id` is the no-op form of ON
 * DUPLICATE KEY UPDATE, which keeps the insert idempotent without touching the
 * existing row. Routing merge through `upsertAlert` instead would reset
 * triggered_at/notified_at on every login and re-send old notifications.
 */
async function insertAlertIfAbsent(userId: number, alert: AlertInput): Promise<void> {
  await query(
    `INSERT INTO price_alerts
       (user_id, client_id, symbol, target_price, alert_condition, note, armed)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [userId, alert.clientId, alert.symbol, alert.targetPrice, alert.condition, alert.note, alert.armed]
  );
}

async function countAlerts(userId: number): Promise<number> {
  const rows = await query<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM price_alerts WHERE user_id = ?",
    [userId]
  );
  return rows[0]?.c ?? 0;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);

  try {
    const alerts = user ? await loadAlerts(user.id) : [];
    return NextResponse.json({ alerts }, { status: 200 });
  } catch {
    return NextResponse.json({ alerts: [] }, { status: 200 });
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
        const alert = parseAlert(body?.alert);
        if (!alert) return NextResponse.json({ detail: "Invalid alert" }, { status: 400 });
        const existing = await query<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM price_alerts WHERE user_id = ? AND (client_id IS NULL OR client_id != ?)",
          [user.id, alert.clientId]
        );
        if ((existing[0]?.c ?? 0) >= MAX_ALERTS_PER_USER) {
          return NextResponse.json({ detail: "Alert limit reached" }, { status: 400 });
        }
        await upsertAlert(user.id, alert);
        break;
      }

      case "remove": {
        const clientId = cleanClientId(body?.id);
        if (!clientId) return NextResponse.json({ detail: "Alert id required" }, { status: 400 });
        const legacyId = clientId.startsWith("db-") ? Number(clientId.slice(3)) : NaN;
        if (Number.isInteger(legacyId)) {
          await query("DELETE FROM price_alerts WHERE user_id = ? AND id = ?", [user.id, legacyId]);
        } else {
          await query("DELETE FROM price_alerts WHERE user_id = ? AND client_id = ?", [user.id, clientId]);
        }
        break;
      }

      case "merge": {
        const incoming = Array.isArray(body?.alerts) ? body.alerts : [];
        let remaining = MAX_ALERTS_PER_USER - (await countAlerts(user.id));
        for (const raw of incoming) {
          if (remaining <= 0) break;
          const alert = parseAlert(raw);
          if (!alert) continue;
          await insertAlertIfAbsent(user.id, alert);
          remaining -= 1;
        }
        break;
      }

      default:
        return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ alerts: await loadAlerts(user.id) });
  } catch (error) {
    console.error("Alert mutation error:", error);
    return NextResponse.json({ detail: "Failed to update alerts" }, { status: 500 });
  }
}
