import Link from "next/link";
import type { ReactNode } from "react";

import { ViewportMotionSection } from "@/components/viewport-motion-section";
import { cn } from "@/shared/utils";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type HeroStat = {
  label: string;
  value: string;
  toneClassName?: string;
};

type PageHeroProps = {
  breadcrumbs?: BreadcrumbItem[];
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  stats?: HeroStat[];
  aside?: ReactNode;
  className?: string;
};

export function PageHero({
  breadcrumbs = [],
  eyebrow,
  title,
  description,
  actions,
  stats = [],
  aside,
  className,
}: PageHeroProps) {
  return (
    <ViewportMotionSection
      className={cn(
        "page-hero-shell gradient-border relative overflow-visible rounded-[24px] px-4 py-4 sm:px-6 sm:py-6 lg:px-6",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="absolute inset-x-[16%] top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      </div>

      <div className={cn("relative z-10 grid gap-6", aside && "lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,380px)] lg:items-end")}>
        <div className="min-w-0">
          {breadcrumbs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted sm:text-sm">
              {breadcrumbs.map((item, index) => (
                <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
                  {item.href ? (
                    <Link href={item.href} className="transition hover:text-text">
                      {item.label}
                    </Link>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {index < breadcrumbs.length - 1 ? <span className="text-border">/</span> : null}
                </span>
              ))}
            </div>
          ) : null}

          {eyebrow ? (
            <div className="mt-3 inline-flex items-center rounded-full border border-border/55 bg-bg/62 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-accent backdrop-blur sm:text-[11px]">
              {eyebrow}
            </div>
          ) : null}

          <div className="mt-4 max-w-4xl">
            <h1 className="font-[var(--font-space)] text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              {description}
            </p>
          </div>

          {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}

          {stats.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="page-hero-stat rounded-2xl border border-border/50 bg-panel/58 px-4 py-3 backdrop-blur-sm"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{stat.label}</p>
                  <p className={cn("mt-2 font-[var(--font-space)] text-xl font-bold text-text", stat.toneClassName)}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {aside ? <div className="page-hero-aside rounded-[24px] border border-border/55 bg-panel/58 p-4 backdrop-blur-xl">{aside}</div> : null}
      </div>
    </ViewportMotionSection>
  );
}
