export const ADMIN_NAME = "Admin";
export const ADMIN_EMAIL = "admin@gmail.com";
export const ADMIN_PASSWORD = "11";
export const AUTH_STORAGE_KEY = "msv_admin_session_v1";

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
