"use client";

import { useEffect, useState } from "react";

import { AUTH_SESSION_CHANGED_EVENT, AUTH_STORAGE_KEY, requestAuthPanel } from "@/lib/auth";

type FeatureAuthWallProps = {
  children: React.ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  points?: string[];
};

export function FeatureAuthWall({
  children,
  title,
  description,
  ctaLabel = "Sign up to unlock",
  points = [],
}: FeatureAuthWallProps) {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
          setIsSignedIn(false);
          return;
        }
        const parsed = JSON.parse(raw) as { name?: string };
        setIsSignedIn(Boolean(parsed?.name));
      } catch {
        setIsSignedIn(false);
      }
    };

    sync();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (isSignedIn) return <>{children}</>;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/55 bg-panel/45 p-5 backdrop-blur-md sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/35 to-bg/65" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent/90">Access Locked</p>
        <h3 className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
        <button
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          onClick={() => requestAuthPanel("signup")}
          type="button"
        >
          {ctaLabel}
        </button>

        {points.length > 0 && (
          <ul className="mt-5 grid gap-2 text-sm text-text sm:grid-cols-2">
            {points.map((item) => (
              <li key={item} className="flex items-center gap-2 rounded-lg border border-border/45 bg-bg/45 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
