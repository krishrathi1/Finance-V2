"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Ends the page entrance animation once it has actually played.
 *
 * `.stagger-fade > *` (globals.css) applies `opacity: 0` plus a delayed
 * fade-in to *every* direct child, permanently — it is written as a one-shot
 * flourish but behaves as a standing rule. On pages where sections render
 * `null` until their data arrives, which is most of them, that has two
 * consequences every time one resolves:
 *
 *   - the new section fades in from invisible, and
 *   - every later sibling's `:nth-child()` match shifts by one, changing its
 *     `animation-delay`, which restarts its animation from `opacity: 0`.
 *
 * The result is the whole page below the change flashing, repeatedly, as
 * polling and refetches resolve sections in and out.
 *
 * Stamping `data-entered` after the entrance window lets the flourish play
 * once on load and then get out of the way. Keyed on the pathname so a real
 * navigation gets its entrance back.
 */
export function StaggerSettle() {
  const pathname = usePathname();

  useEffect(() => {
    const containers = () => document.querySelectorAll<HTMLElement>(".stagger-fade");

    // A fresh route should animate, so clear any previous page's marker.
    containers().forEach((node) => node.removeAttribute("data-entered"));

    // Longest delay (295ms) + the animation itself (220ms), with headroom for
    // a slow first paint. Queried again on fire because client sections mount
    // after this effect runs.
    const timer = setTimeout(() => {
      containers().forEach((node) => node.setAttribute("data-entered", "true"));
    }, 700);

    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
