const STORAGE_KEY = "ff-price-alerts";

/** Fired after a server hydration/merge/refresh overwrites localStorage, so any
 * already-rendered alert UI knows to re-read from storage. */
export const ALERTS_SYNCED_EVENT = "ff-alerts-synced";

export type PriceAlert = {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: "above" | "below";
  note: string;
  createdAt: string;
  /**
   * Server-evaluated delivery state. Absent on alerts created offline or
   * before sync existed — treat `undefined` as "not yet triggered".
   *
   * `armed` is what stops an alert whose condition is already true at creation
   * from firing instantly; see server/domain/alerts.ts for the full rationale.
   */
  armed?: boolean;
  triggeredAt?: string | null;
  triggeredPrice?: number | null;
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

// ---------------------------------------------------------------------------
// Server sync (best-effort), mirroring lib/watchlist.ts and lib/portfolio.ts.
//
// localStorage stays the source of truth for synchronous reads, so every call
// site below keeps working offline and signed out. When signed in, mutations
// are also fired at the server — which is what lets an alert outlive this
// browser and, more importantly, lets the server evaluate and email it while
// no tab is open (see /api/v1/alerts/evaluate).
// ---------------------------------------------------------------------------

let authenticated = false;
/** Guards against starting hydration twice. Set before the first await. */
let hydrated = false;
/** True only once hydration has actually finished (or failed). Distinct from
 * `hydrated` so the refresh path can tell "in flight" from "done". */
let hydrationSettled = false;

/** Set by the auth layer (see components/account-sync.tsx) whenever sign-in
 * state changes, so mutations know whether it's worth calling the server. */
export function setAlertsAuthState(isAuthenticated: boolean) {
  authenticated = isAuthenticated;
}

/** Call on sign-out so the next sign-in (possibly a different account) hydrates fresh. */
export function resetAlertsHydration() {
  hydrated = false;
  hydrationSettled = false;
}

export function isAlertSyncEnabled(): boolean {
  return authenticated;
}

function notifySynced() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ALERTS_SYNCED_EVENT));
  }
}

function syncOp(action: string, extra: Record<string, unknown> = {}) {
  if (!authenticated || typeof window === "undefined") return;
  fetch("/api/v1/alerts", {
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
 * Replace the local store with the server's copy.
 *
 * `notify` is opt-in because the synced event exists for one job: telling UI
 * that already rendered from an empty local store to re-read. Firing it from
 * the polling refresh path instead would loop — a listener that reloads by
 * calling refreshAlertsFromServer would re-emit the event on every pass.
 */
function adoptServerAlerts(alerts: unknown, options: { notify?: boolean } = {}): boolean {
  if (!Array.isArray(alerts)) return false;
  write(alerts as PriceAlert[]);
  if (options.notify) notifySynced();
  return true;
}

/**
 * Pulls the server's alerts into localStorage, merging any local alerts that
 * predate sign-in so signing in never silently discards them.
 * Safe to call multiple times — only does work once per sign-in.
 */
export async function hydrateAlertsFromServer(): Promise<void> {
  if (typeof window === "undefined" || hydrated) return;
  hydrated = true;
  try {
    const local = read();

    const res = local.length
      ? await fetch("/api/v1/alerts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "merge", alerts: local }),
        })
      : await fetch("/api/v1/alerts", { credentials: "include" });

    if (res.ok) {
      const payload = (await res.json()) as { alerts?: PriceAlert[] };
      adoptServerAlerts(payload.alerts, { notify: true });
    }
  } catch {
    // Offline or logged out mid-flight — keep whatever's already local.
  } finally {
    hydrationSettled = true;
  }
}

/**
 * Ask the server to re-evaluate this user's alerts against live prices, then
 * adopt the result.
 *
 * The server is authoritative for trigger state because it is the only side
 * that can record a crossing that happened while nothing was watching, and the
 * only side that sends email. Returns false when sync isn't available (signed
 * out, offline), which tells the caller to fall back to local evaluation.
 */
export async function refreshAlertsFromServer(): Promise<boolean> {
  if (!authenticated || typeof window === "undefined") return false;
  // The alerts page and sign-in hydration both start on mount. Adopting the
  // server's list before hydration has uploaded this browser's signed-out
  // alerts would blank them on screen until the merge response landed, so this
  // pass defers to local evaluation and the next poll picks up server state.
  if (!hydrationSettled) return false;
  try {
    const evaluated = await fetch("/api/v1/alerts/evaluate", {
      method: "POST",
      credentials: "include",
    });
    // A 429 is expected under aggressive polling and isn't an error worth
    // surfacing — fall through and read the current stored state instead.
    if (!evaluated.ok && evaluated.status !== 429) return false;

    const res = await fetch("/api/v1/alerts", { credentials: "include" });
    if (!res.ok) return false;
    const payload = (await res.json()) as { alerts?: PriceAlert[] };
    return adoptServerAlerts(payload.alerts);
  } catch {
    return false;
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

/**
 * Add a new price alert.
 *
 * `currentPrice` is optional but worth passing: the server uses it to decide
 * whether the alert starts armed. Without it an alert whose condition is
 * already satisfied — which is exactly what the pre-filled "Set Alert" dialog
 * produces if the user doesn't edit the target — fires on the next sweep and
 * emails the user about a threshold they never crossed.
 */
export function addAlert(
  symbol: string,
  targetPrice: number,
  condition: "above" | "below",
  note: string = "",
  currentPrice?: number
): PriceAlert {
  const alerts = read();
  const newAlert: PriceAlert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: symbol.toUpperCase(),
    targetPrice,
    condition,
    note,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    triggeredPrice: null,
  };
  alerts.push(newAlert);
  write(alerts);
  syncOp("upsert", { alert: { ...newAlert, currentPrice } });
  return newAlert;
}

/** Remove an alert by id */
export function removeAlert(id: string): void {
  const alerts = read().filter((a) => a.id !== id);
  write(alerts);
  syncOp("remove", { id });
}

/**
 * Local fallback evaluation, used when the server can't be reached (signed
 * out or offline).
 *
 * Intentionally simpler than the server's rule: with no persisted state there
 * is nothing to arm against and nothing to make triggering one-shot, so this
 * reports "condition currently true" rather than "crossed since last check".
 * It never sends email, so an over-eager result here is a badge, not a
 * notification.
 */
export function checkAlerts(
  prices: Record<string, number>
): Array<PriceAlert & { currentPrice: number }> {
  const alerts = read();
  const triggered: Array<PriceAlert & { currentPrice: number }> = [];
  for (const alert of alerts) {
    const quoted = Number(prices[alert.symbol.toUpperCase()]);
    // Only `undefined` used to be rejected, which let a zero through as a real
    // quote — and zero satisfies every "below" target there is, so a suspended
    // or badly-parsed scrip lit up every downside alert the user had on it.
    // The server's own evaluation (server/domain/alerts.ts) already demanded a
    // finite positive price; this fallback path did not, so the two disagreed
    // about the same alert depending on whether the user was signed in.
    if (!Number.isFinite(quoted) || quoted <= 0) continue;
    const currentPrice = quoted;
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
