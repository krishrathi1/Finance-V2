"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const ROUTE_SETTLE_MS = 460;
const ROUTE_FALLBACK_MS = 1800;

export function SmoothExperience() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const firstRender = useRef(true);
  const timeoutRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  const scheduleInactive = useCallback((delay: number) => {
    const root = document.documentElement;

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setActive(false);
      delete root.dataset.routeTransition;
      timeoutRef.current = null;
    }, delay);
  }, []);

  const startTransition = useCallback((delay = ROUTE_FALLBACK_MS) => {
    const root = document.documentElement;
    setActive(true);
    root.dataset.routeTransition = "active";
    scheduleInactive(delay);
  }, [scheduleInactive]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;

      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }

      window.setTimeout(() => startTransition(), 0);
    };

    window.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("click", handleClick, { capture: true });
    };
  }, [startTransition]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    startTransition(ROUTE_SETTLE_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      delete document.documentElement.dataset.routeTransition;
    };
  }, [pathname, search, startTransition]);

  return (
    <div className="route-progress" data-active={active} aria-hidden="true">
      <div className="route-progress__bar" />
      <div className="route-progress__glow" />
    </div>
  );
}
