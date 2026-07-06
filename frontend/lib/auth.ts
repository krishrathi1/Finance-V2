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
