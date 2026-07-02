"use client";

import { useEffect, useRef } from "react";

/**
 * Poll `fn` on an interval, but only while the tab is visible.
 *
 * - Runs `fn(true)` once on mount (initial load).
 * - Runs `fn(false)` every `intervalMs` while the document is visible.
 * - Pauses entirely while the tab is hidden; on return, refreshes immediately
 *   if a full interval has elapsed since the last run.
 *
 * Replaces per-component bare `setInterval` loops so background tabs stop
 * hammering the API (the root cause of the recurring dashboard "lag").
 */
export function useVisibilityPolling(
  fn: (initial: boolean) => void | Promise<void>,
  intervalMs: number
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRun = 0;
    let disposed = false;

    const run = (initial: boolean) => {
      lastRun = Date.now();
      try {
        void fnRef.current(initial);
      } catch {
        // Polling must never take the component down.
      }
    };

    const start = () => {
      if (timer || disposed) return;
      timer = setInterval(() => run(false), intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        if (Date.now() - lastRun >= intervalMs) run(false);
        start();
      }
    };

    run(true);
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
