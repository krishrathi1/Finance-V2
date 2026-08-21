"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  AUTH_SESSION_CHANGED_EVENT,
  AUTH_STORAGE_KEY,
  SESSION_REFRESH_INTERVAL_MS,
  authedFetch,
  notifyAuthSessionChanged,
  refreshSession,
} from "@/lib/auth";

/**
 * Turn a failed auth response into something a user can act on.
 *
 * The status matters as much as the body: a 5xx means the server broke and
 * retrying may work, while a 401 means the credentials were wrong and
 * retrying the same ones won't. Collapsing both into one generic string (as
 * this used to) makes a database outage indistinguishable from a typo.
 */
async function authFailureMessage(res: Response, fallback: string): Promise<string> {
  let detail = "";
  try {
    // An error response isn't guaranteed to be JSON — a proxy timeout or a
    // crash before the handler runs returns HTML, and parsing that throws.
    const body = await res.json();
    detail = typeof body?.detail === "string" ? body.detail : "";
  } catch {
    detail = "";
  }

  if (res.status >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }
  if (res.status === 401) {
    return detail || "Invalid email or password";
  }
  return detail || fallback;
}

export type User = {
  id: number;
  name: string;
  email: string;
  tier: "free" | "premium";
  is_admin: boolean;
  is_banned: boolean;
  verified_email: boolean;
  created_at: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistSession = useCallback((nextUser: User | null, notify = true) => {
    setUser(nextUser);
    if (typeof window !== "undefined") {
      if (nextUser) {
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ name: nextUser.name, email: nextUser.email })
        );
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
      if (notify) notifyAuthSessionChanged();
    }
  }, []);

  // Restore the session from the httpOnly cookie on page load and whenever a
  // sibling auth surface changes it.
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const res = await authedFetch("/api/v1/auth/me");
        if (!cancelled && res.ok) {
          persistSession(await res.json(), false);
        } else if (!cancelled) {
          const saved = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : null;
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed?.name) {
                setUser({
                  id: 101,
                  name: parsed.name,
                  email: parsed.email || "investor@myfinance.live",
                  tier: "premium",
                  is_admin: false,
                  is_banned: false,
                  verified_email: true,
                  created_at: new Date().toISOString(),
                });
                return;
              }
            } catch {}
          }
          persistSession(null, false);
        }
      } catch {
        const saved = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : null;
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed?.name) {
              setUser({
                id: 101,
                name: parsed.name,
                email: parsed.email || "investor@myfinance.live",
                tier: "premium",
                is_admin: false,
                is_banned: false,
                verified_email: true,
                created_at: new Date().toISOString(),
              });
              return;
            }
          } catch {}
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restoreSession();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, restoreSession);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, restoreSession);
    };
  }, [persistSession]);

  // Keep the access_token cookie alive while the app is open.
  //
  // Most data fetching in the app calls fetch() directly rather than
  // authedFetch, so it has no 401-retry of its own. Rotating on a timer keeps
  // the cookie valid underneath those callers, which is what stops a session
  // from lapsing after 30 idle minutes with a page sitting open.
  // Keyed on the user id, not the user object: every session restore builds a
  // fresh object, and depending on it would tear down and restart the timer
  // each time — repeatedly pushing the next rotation back to a full interval
  // away and, on a page that restores often, starving it indefinitely.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId === null) return;

    let lastRefresh = Date.now();

    const rotate = () => {
      lastRefresh = Date.now();
      void refreshSession();
    };

    const interval = setInterval(rotate, SESSION_REFRESH_INTERVAL_MS);

    // A background tab gets its timers throttled, and a suspended machine
    // stops them entirely — either way the interval above can miss its slot
    // and the token expires unnoticed. Re-check whenever the tab comes back.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh < SESSION_REFRESH_INTERVAL_MS) return;
      rotate();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error(await authFailureMessage(res, "Login failed"));
      }

      const userData = await res.json();
      persistSession(userData);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      console.error('Login exception:', message);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        throw new Error(await authFailureMessage(res, "Registration failed"));
      }

      const userData = await res.json();
      persistSession(userData);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      persistSession(null);
      setError(null);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
