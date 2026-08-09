import { NextRequest, NextResponse } from "next/server";

import { getLiveTickerRows } from "@/lib/market/indian-market";
import { getCurrentUser } from "@/lib/current-user";
import { query, ResultSetHeader } from "@/server/infrastructure/db";
import { sendPriceAlertEmail, type TriggeredAlertEmailItem } from "@/server/infrastructure/email";
import { rateLimit } from "@/server/infrastructure/rate-limit";
import { evaluateAlerts, type AlertCondition, type EvaluableAlert } from "@/server/domain/alerts";

/**
 * Price-alert evaluation and delivery sweep.
 *
 * Two ways in:
 *
 * 1. **Signed-in user** — evaluates only that user's alerts. The alerts page
 *    calls this as it polls, so an open tab keeps its own alerts current.
 * 2. **Cron** — `x-cron-secret: $ALERTS_CRON_SECRET` sweeps every user. This is
 *    the one that matters: alerts exist to tell you about a move you *weren't*
 *    watching, which no amount of client-side polling can do.
 *
 * Both paths share the same logic, so an alert behaves identically whether the
 * user happened to have the page open or not.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** getLiveTickerRows caps each call at 50 symbols. */
const SYMBOLS_PER_BATCH = 50;

/**
 * Ceiling on alerts examined per sweep, so one run can't hold a DB connection
 * and hammer providers unboundedly as the user base grows. Anything past the
 * limit is picked up by the next sweep — ordering by id keeps that fair rather
 * than starving the same tail every time.
 */
const MAX_ALERTS_PER_SWEEP = 2000;

type PendingAlertRow = {
  id: number;
  user_id: number;
  symbol: string;
  target_price: string | number;
  alert_condition: string;
  armed: number | boolean;
};

type DeliveryRow = {
  id: number;
  user_id: number;
  email: string;
  name: string;
  symbol: string;
  target_price: string | number;
  alert_condition: string;
  triggered_price: string | number | null;
  note: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/** Build a `?, ?, ?` placeholder list — ids are numeric and never interpolated. */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * `refresh` is chosen by caller, not hardcoded: the cron sweep runs every few
 * minutes and wants a genuinely fresh quote, while a signed-in user's page
 * polls every 20 seconds — forcing a provider round-trip on each of those
 * would multiply upstream load for data that moves far slower than the poll.
 * The shared quote cache is well within tolerance for a price threshold.
 */
async function fetchPrices(symbols: string[], refresh: boolean): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (const batch of chunk(symbols, SYMBOLS_PER_BATCH)) {
    try {
      const rows = await getLiveTickerRows(batch, { refresh });
      for (const row of rows) {
        if (row?.symbol && Number.isFinite(row.cmp) && row.cmp > 0) {
          prices[row.symbol.toUpperCase()] = row.cmp;
        }
      }
    } catch (error) {
      // A provider failure for one batch must not abandon the others, and a
      // missing price is already handled downstream as "no decision" rather
      // than as a crossing — so the alert simply waits for the next sweep.
      console.error("Alert price fetch failed for batch:", error);
    }
  }
  return prices;
}

/**
 * Mark newly crossed alerts. The `triggered_at IS NULL` guard makes this
 * idempotent: if two sweeps race (a cron run and a user's own poll), the
 * second one's UPDATE matches no rows instead of overwriting the trigger price
 * and time recorded by the first.
 */
async function markTriggered(triggered: Array<{ id: number; price: number }>): Promise<void> {
  for (const { id, price } of triggered) {
    await query(
      "UPDATE price_alerts SET triggered_at = NOW(), triggered_price = ? WHERE id = ? AND triggered_at IS NULL",
      [price, id]
    );
  }
}

async function markArmed(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  for (const batch of chunk(ids, 200)) {
    await query(
      `UPDATE price_alerts SET armed = TRUE WHERE id IN (${placeholders(batch.length)})`,
      batch
    );
  }
}

/**
 * Email everyone whose alerts fired since the last sweep, one digest per user.
 *
 * Delivery is claimed before sending: `notified_at` is stamped first, and only
 * cleared again if the send fails. Sending first would let a slow SMTP call
 * overlap the next sweep and mail the same trigger twice — for a notification,
 * a duplicate is worse than a retry one minute later.
 *
 * Only verified, unbanned accounts are mailed. Someone can sign up with an
 * address they don't control, and alerts must not become a way to send mail to
 * a stranger. Unverified users still see triggers in the app.
 */
async function deliverNotifications(userId: number | null): Promise<number> {
  const rows = await query<DeliveryRow[]>(
    `SELECT a.id, a.user_id, u.email, u.name, a.symbol, a.target_price,
            a.alert_condition, a.triggered_price, a.note
     FROM price_alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.triggered_at IS NOT NULL
       AND a.notified_at IS NULL
       AND u.verified_email = TRUE
       AND u.is_banned = FALSE
       ${userId === null ? "" : "AND a.user_id = ?"}
     ORDER BY a.user_id ASC, a.id ASC
     LIMIT ?`,
    userId === null ? [MAX_ALERTS_PER_SWEEP] : [userId, MAX_ALERTS_PER_SWEEP]
  );
  if (rows.length === 0) return 0;

  const byUser = new Map<number, DeliveryRow[]>();
  for (const row of rows) {
    const existing = byUser.get(row.user_id);
    if (existing) existing.push(row);
    else byUser.set(row.user_id, [row]);
  }

  let delivered = 0;

  for (const [, userRows] of byUser) {
    const ids = userRows.map((row) => row.id);

    const claim = await query<ResultSetHeader>(
      `UPDATE price_alerts SET notified_at = NOW()
       WHERE notified_at IS NULL AND id IN (${placeholders(ids.length)})`,
      ids
    );
    // Another sweep claimed these first — it owns the send.
    if (!claim || claim.affectedRows === 0) continue;

    const items: TriggeredAlertEmailItem[] = userRows.map((row) => ({
      symbol: row.symbol,
      condition: row.alert_condition === "below" ? "below" : "above",
      targetPrice: Number(row.target_price),
      triggeredPrice: Number(row.triggered_price ?? row.target_price),
      note: row.note,
    }));

    const sent = await sendPriceAlertEmail(userRows[0].email, userRows[0].name, items);
    if (sent) {
      delivered += items.length;
    } else {
      // Release the claim so the next sweep retries. The trigger itself stays
      // recorded, so the user still sees it in the app either way.
      await query(
        `UPDATE price_alerts SET notified_at = NULL WHERE id IN (${placeholders(ids.length)})`,
        ids
      );
    }
  }

  return delivered;
}

async function runSweep(userId: number | null, refreshQuotes: boolean) {
  const rows = await query<PendingAlertRow[]>(
    `SELECT id, user_id, symbol, target_price, alert_condition, armed
     FROM price_alerts
     WHERE triggered_at IS NULL ${userId === null ? "" : "AND user_id = ?"}
     ORDER BY id ASC
     LIMIT ?`,
    userId === null ? [MAX_ALERTS_PER_SWEEP] : [userId, MAX_ALERTS_PER_SWEEP]
  );

  let triggeredCount = 0;

  if (rows.length > 0) {
    const alerts: EvaluableAlert[] = rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      targetPrice: Number(row.target_price),
      condition: (row.alert_condition === "below" ? "below" : "above") as AlertCondition,
      armed: Boolean(row.armed),
    }));

    const symbols = [...new Set(alerts.map((alert) => alert.symbol.toUpperCase()))];
    const prices = await fetchPrices(symbols, refreshQuotes);
    const { triggered, armed } = evaluateAlerts(alerts, prices);

    await markTriggered(triggered);
    await markArmed(armed);
    triggeredCount = triggered.length;
  }

  // Runs even when nothing new triggered, so a trigger whose email failed on a
  // previous sweep gets retried rather than waiting for the next crossing.
  const notified = await deliverNotifications(userId);

  return { evaluated: rows.length, triggered: triggeredCount, notified };
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.ALERTS_CRON_SECRET?.trim();
  const providedSecret = request.headers.get("x-cron-secret")?.trim();
  // Both must be non-empty: an unset env var must not turn every request
  // (including one with no header at all) into an authenticated global sweep.
  const isCron = Boolean(configuredSecret && providedSecret && providedSecret === configuredSecret);

  let scopedUserId: number | null = null;

  if (!isCron) {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
    }
    // This endpoint fans out to market-data providers, so it's more expensive
    // than a normal read. The alerts page polls every 20s (~15/5min); this
    // leaves room for that plus manual refreshes without allowing a loop.
    const limit = await rateLimit(`alerts-evaluate:${user.id}`, 40, 5 * 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { detail: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    scopedUserId = user.id;
  }

  try {
    const result = await runSweep(scopedUserId, isCron);
    return NextResponse.json({ scope: isCron ? "all" : "user", ...result });
  } catch (error) {
    console.error("Alert evaluation error:", error);
    return NextResponse.json({ detail: "Failed to evaluate alerts" }, { status: 500 });
  }
}
