"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart2,
  Bell,
  CalendarRange,
  GitCompareArrows,
  Heart,
  Home,
  Menu,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/screener", label: "Screener", icon: SlidersHorizontal },
  { href: "/watchlist", label: "Watchlist", icon: Heart },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/ipo", label: "IPO", icon: CalendarRange },
  { href: "/alerts", label: "Alerts", icon: Bell },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden items-center gap-0.5 sm:flex">
        {LINKS.map((link) => {
          const active = isActive(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all active:scale-[0.97] ${
                active
                  ? "nav-active"
                  : "text-muted hover:bg-panel/70 hover:text-text"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-accent" : ""}`} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile hamburger */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-panel/60 text-muted backdrop-blur-sm transition hover:border-accent/40 hover:text-text active:scale-[0.97]"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-border/40 bg-bg/96 backdrop-blur-xl">
            <nav className="mx-auto flex max-w-[1640px] flex-col gap-0.5 px-3 py-3">
              {LINKS.map((link) => {
                const active = isActive(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                      active
                        ? "nav-active"
                        : "text-muted hover:bg-panel/60 hover:text-text"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </>
  );
}
