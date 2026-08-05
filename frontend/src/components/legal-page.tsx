import type { ReactNode } from "react";

import { LEGAL_LAST_UPDATED } from "@/shared/legal";

/**
 * Shared chrome for the three legal pages so they read as one document set.
 * Server component by design — this is static prose, and shipping it as client
 * JS would cost bundle size for markup that never changes.
 */

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-4">
      {items.map((item, i) => (
        <li key={i} className="relative pl-3 before:absolute before:left-0 before:top-[0.55rem] before:h-1 before:w-1 before:rounded-full before:bg-accent/70">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="border-b border-border/40 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{intro}</p>
        <p className="mt-4 text-[11px] uppercase tracking-widest text-muted/60">
          Last updated: {LEGAL_LAST_UPDATED}
        </p>
      </header>
      {children}
    </div>
  );
}
