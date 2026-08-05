// Auth events
export const OPEN_AUTH_PANEL_EVENT = "open-auth-panel";
export const AUTH_SESSION_CHANGED_EVENT = "auth-session-changed";

export type AuthPanelMode = "signin" | "signup";

export function requestAuthPanel(mode: AuthPanelMode) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ mode: AuthPanelMode }>(OPEN_AUTH_PANEL_EVENT, { detail: { mode } }));
}

export function notifyAuthSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export const AUTH_STORAGE_KEY = "finance_auth_session";

// The access_token cookie lives 30 minutes (see lib/auth-utils.ts). Rotate
// comfortably inside that so a session never lapses between ticks.
export const ACCESS_TOKEN_TTL_MS = 30 * 60_000;
export const SESSION_REFRESH_INTERVAL_MS = 25 * 60_000;

const REFRESH_ENDPOINT = "/api/v1/auth/refresh";

let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Exchange the refresh_token cookie for a fresh access_token.
 *
 * Deduplicated on purpose: the endpoint atomically claims (deletes) the token
 * row it rotates, so exactly one of N concurrent rotations can succeed and the
 * losers get 401. Without sharing a single in-flight request, a burst of
 * parallel 401s would fire N rotations from the same cookie and the losing
 * ones would look like an invalid session and force a spurious sign-out.
 *
 * Returns false rather than throwing — callers treat it as "still signed out".
 */
export async function refreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const res = await fetch(REFRESH_ENDPOINT, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/**
 * fetch() that survives an expired access token: on a 401 it rotates the
 * session once and replays the request. Only retries once — a 401 that
 * persists past a successful refresh is a real authorization failure, not an
 * expiry, and retrying it again would just loop.
 *
 * `init.body` must be a replayable value (string/FormData/etc., which is all
 * this app sends) — a one-shot stream body would be consumed by the first
 * attempt and arrive empty on the replay.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const send = () => fetch(input, { ...init, credentials: "include" });

  const res = await send();
  if (res.status !== 401) return res;

  const refreshed = await refreshSession();
  if (!refreshed) return res;

  return send();
}
