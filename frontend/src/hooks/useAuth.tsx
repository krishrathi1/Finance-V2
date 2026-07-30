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
  notifyAuthSessionChanged,
} from "@/lib/auth";

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
        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (!cancelled && res.ok) {
          persistSession(await res.json(), false);
        } else if (!cancelled) {
          persistSession(null, false);
        }
      } catch {
        // Not signed in or backend unreachable — stay logged out.
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
        const errorData = await res.json();
        const errorMsg = errorData.detail || errorData.error || "Login failed";
        console.error('Login error response:', errorData);
        throw new Error(errorMsg);
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
        const errorData = await res.json();
        throw new Error(errorData.detail || "Registration failed");
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
