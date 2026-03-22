"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/screener", label: "Screener" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/compare", label: "Compare" },
  { href: "/ipo", label: "IPO" },
  { href: "/alerts", label: "Alerts" },
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
      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              isActive(link.href)
                ? "font-semibold text-accent"
                : "text-muted hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted transition hover:text-text"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-border/40 bg-bg/95 backdrop-blur-xl">
            <nav className="mx-auto flex max-w-[1640px] flex-col px-3 py-2">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive(link.href)
                      ? "font-semibold text-accent"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
    </>
  );
}
