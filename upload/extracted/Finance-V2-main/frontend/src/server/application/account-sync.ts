/**
 * Input normalisation shared by the account-scoped sync routes
 * (`/api/v1/portfolio` and `/api/v1/alerts`).
 *
 * Both accept JSON that originated in a browser's localStorage, which means
 * it can be arbitrarily old, hand-edited, or from a build that shipped a
 * different shape. Everything crossing that boundary is coerced here rather
 * than trusted, and every limit is enforced server-side even where the UI
 * already enforces it — the UI is a convenience, not a control.
 *
 * The functions return `null` for "unusable" rather than throwing, so a single
 * malformed row in a bulk merge is skipped instead of failing the whole import
 * and leaving the user with nothing synced.
 */

import type { AlertCondition } from "@/server/domain/alerts";
import type { TransactionSide } from "@/shared/portfolio-returns";

export const MAX_SYMBOL_LENGTH = 20;
export const MAX_CLIENT_ID_LENGTH = 64;
export const MAX_COMPANY_NAME_LENGTH = 255;
export const MAX_NOTE_LENGTH = 500;

/** Per-account ceilings. Generous for real use, finite for abuse. */
export const MAX_HOLDINGS_PER_USER = 500;
export const MAX_ALERTS_PER_USER = 200;
/** Higher than holdings: the ledger accumulates forever, holdings don't. */
export const MAX_TRANSACTIONS_PER_USER = 5000;

/**
 * DECIMAL(18,4) in MySQL — anything at or above 1e14 would overflow the column
 * and error the insert, so it's rejected here as invalid input instead.
 */
export const MAX_DECIMAL_VALUE = 1e14;

export function cleanSymbol(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().slice(0, MAX_SYMBOL_LENGTH);
}

export function cleanClientId(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_CLIENT_ID_LENGTH);
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

/**
 * Parse a user-supplied money/quantity value.
 * Rejects zero, negatives, NaN/Infinity, and anything the DECIMAL column can't
 * hold. Accepts numeric strings because JSON from the client sends form values
 * that way.
 */
export function parsePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed >= MAX_DECIMAL_VALUE) return null;
  // Match the column's scale so the value the client sees back is the value
  // that was stored, rather than one silently rounded by MySQL on write.
  return Math.round(parsed * 1e4) / 1e4;
}

/** Same as parsePositiveNumber, but an absent/blank optional field is valid. */
export function parseOptionalPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return parsePositiveNumber(value);
}

export function parseCondition(value: unknown): AlertCondition {
  return String(value ?? "").trim().toLowerCase() === "below" ? "below" : "above";
}

/**
 * A trade side. Unlike the other parsers this returns null for anything
 * unrecognised rather than defaulting — guessing "buy" would silently invert
 * the meaning of a sale and corrupt every realised figure derived from it.
 */
export function parseSide(value: unknown): TransactionSide | null {
  const side = String(value ?? "").trim().toLowerCase();
  return side === "buy" || side === "sell" ? side : null;
}

/** Fees are optional and legitimately zero, unlike quantity or price. */
export function parseNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed >= MAX_DECIMAL_VALUE) return null;
  return Math.round(parsed * 1e4) / 1e4;
}

/**
 * Validate an ISO calendar date (`YYYY-MM-DD`) for a DATE column.
 *
 * Checks the round-trip rather than just the pattern, so impossible dates
 * ("2026-02-31") are rejected instead of being silently rolled forward by
 * MySQL into a different day than the user picked.
 */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

/**
 * MySQL DECIMAL columns come back from mysql2 as strings (they can hold values
 * JS numbers can't represent exactly). Every consumer here wants a number, and
 * a NULL column must stay null rather than becoming 0 — `Number(null)` is 0,
 * which would turn "no target price" into "target price of zero".
 */
export function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
