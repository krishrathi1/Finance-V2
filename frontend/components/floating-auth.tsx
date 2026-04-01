"use client";

import { useEffect, useRef, useState } from "react";

import {
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_PASSWORD,
  AUTH_STORAGE_KEY,
  OPEN_AUTH_PANEL_EVENT,
  type AuthPanelMode,
  notifyAuthSessionChanged,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

export function FloatingAuth() {
  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"signin" | "signup" | null>(null);
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState(ADMIN_PASSWORD);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setActivePanel(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    const onOpenAuthPanel = (event: Event) => {
      const custom = event as CustomEvent<{ mode?: AuthPanelMode }>;
      setActivePanel(custom.detail?.mode === "signin" ? "signin" : "signup");
      setOpen(false);
      setError(null);
    };

    window.addEventListener(OPEN_AUTH_PANEL_EVENT, onOpenAuthPanel as EventListener);
    return () => {
      window.removeEventListener(OPEN_AUTH_PANEL_EVENT, onOpenAuthPanel as EventListener);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { name?: string };
      if (parsed?.name) setSignedInAs(parsed.name);
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  const handleAuth = () => {
    setError(null);

    if (email.trim().toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      setError("Use admin@gmail.com and password 11.");
      return;
    }

    const resolvedName = ADMIN_NAME;
    setSignedInAs(resolvedName);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ name: resolvedName, email: ADMIN_EMAIL }));
    notifyAuthSessionChanged();
    setActivePanel(null);
    setOpen(false);
  };

  const signOut = () => {
    setSignedInAs(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    notifyAuthSessionChanged();
    setOpen(false);
  };

  return (
    <>
      {activePanel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-panel/85 p-6 shadow-2xl backdrop-blur-md sm:p-7">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent/90">
                  {activePanel === "signup" ? "Start now" : "Welcome back"}
                </p>
                <h2 className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text">
                  {activePanel === "signup" ? "Create account" : "Sign in"}
                </h2>
              </div>
              <button
                aria-label="Close auth panel"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted transition hover:text-text"
                onClick={() => setActivePanel(null)}
                type="button"
              >
                x
              </button>
            </div>

            <form
              className="space-y-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                handleAuth();
              }}
            >
              {activePanel === "signup" && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="auth-name">
                    Full name
                  </label>
                  <input
                    className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                    id="auth-name"
                    name="name"
                    readOnly
                    value={ADMIN_NAME}
                    placeholder="Admin"
                    type="text"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="auth-email">
                  Email
                </label>
                <input
                  className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                  id="auth-email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="auth-password">
                  Password
                </label>
                <input
                  className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                  id="auth-password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={activePanel === "signup" ? "Create password" : "Enter password"}
                  type="password"
                  value={password}
                />
              </div>
              {error && <p className="text-xs font-medium text-danger">{error}</p>}
              <button
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90"
                type="submit"
              >
                {activePanel === "signup" ? "Create account" : "Continue"}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-muted">
              {activePanel === "signup" ? "Already have an account?" : "New here?"}{" "}
              <button
                className="font-semibold text-accent transition hover:opacity-80"
                onClick={() => {
                  setActivePanel((prev) => (prev === "signup" ? "signin" : "signup"));
                  setError(null);
                }}
                type="button"
              >
                {activePanel === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6" ref={wrapperRef}>
        <div className="relative">
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Open account menu"
            className={cn(
              "group flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-panel/95 text-text shadow-xl shadow-black/20 backdrop-blur-md transition",
              "hover:-translate-y-0.5 hover:border-accent/60 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              open && "border-accent/70 text-accent"
            )}
            onClick={() => setOpen((prev) => !prev)}
            type="button"
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5.5 19.5c.85-3.2 3.4-4.8 6.5-4.8s5.65 1.6 6.5 4.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>
          </button>

          <div
            className={cn(
              "absolute bottom-14 right-0 w-44 origin-bottom-right rounded-2xl border border-border/60 bg-panel/95 p-2 shadow-2xl backdrop-blur-md transition",
              open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
            )}
            role="menu"
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Account</p>
            {signedInAs ? (
              <>
                <p className="mt-1 rounded-lg px-3 py-2 text-sm font-semibold text-text">{signedInAs}</p>
                <button
                  className="mt-1 block w-full rounded-lg border border-border/60 px-3 py-2 text-left text-sm font-medium text-text transition hover:bg-bg/70 hover:text-accent"
                  onClick={signOut}
                  role="menuitem"
                  type="button"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-text transition hover:bg-bg/70 hover:text-accent"
                  onClick={() => {
                    setActivePanel("signin");
                    setOpen(false);
                    setError(null);
                  }}
                  role="menuitem"
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className="mt-1 block w-full rounded-lg bg-accent/90 px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-accent"
                  onClick={() => {
                    setActivePanel("signup");
                    setOpen(false);
                    setError(null);
                  }}
                  role="menuitem"
                  type="button"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
