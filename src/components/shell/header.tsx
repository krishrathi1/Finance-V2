"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarRange,
  GitCompareArrows,
  Heart,
  Home,
  Menu,
  Moon,
  SlidersHorizontal,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { ViewKey } from "@/lib/types";
import { MarketStatusBadge } from "@/components/shared/market-status";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { view: ViewKey; label: string; icon: React.ElementType }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "screener", label: "Screener", icon: SlidersHorizontal },
  { view: "watchlist", label: "Watchlist", icon: Heart },
  { view: "portfolio", label: "Portfolio", icon: Wallet },
  { view: "compare", label: "Compare", icon: GitCompareArrows },
  { view: "ipo", label: "IPO", icon: CalendarRange },
  { view: "alerts", label: "Alerts", icon: Bell },
];

/** Logo tile + wordmark — shared with the footer. */
export function BrandMark({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-amber-400 shadow-lg shadow-brand/30">
        <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" aria-hidden="true">
          <polyline
            points="1,12 5,7 9,10 15,3"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="15" cy="3" r="1.4" fill="white" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-bold tracking-tight">
          <span className="bg-gradient-to-r from-brand via-amber-400 to-orange-400 bg-clip-text text-transparent">
            MyStockVision
          </span>
          <span className="text-text/70"> AI</span>
        </span>
        {subtitle && (
          <span className="mt-1 hidden text-[10px] text-muted-foreground sm:block">
            NSE &amp; BSE research platform
          </span>
        )}
      </span>
    </span>
  );
}

const emptySubscribe = () => () => {};

/** Hydration-safe "is mounted" guard without setState-in-effect. */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle color theme"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-panel/60 text-muted-foreground transition hover:border-brand/40 hover:text-text"
    >
      {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Header() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (next: ViewKey) => {
    setMenuOpen(false);
    setView(next);
  };

  return (
    <header className="header-enter sticky top-0 z-40 border-b border-border/40 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1640px] items-center justify-between gap-3 px-3 sm:px-4">
        {/* Logo */}
        <button
          type="button"
          onClick={() => go("home")}
          aria-label="MyStockVision — go to home"
          className="min-h-9 shrink-0 rounded-xl px-1 transition hover:opacity-85"
        >
          <BrandMark />
        </button>

        {/* Desktop nav */}
        <nav className="hidden gap-1 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.view;
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => setView(item.view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-text",
                  active && "nav-active"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex">
            <MarketStatusBadge compact />
          </span>
          <ThemeToggle />

          {/* Mobile hamburger */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-panel/60 text-muted-foreground transition hover:border-brand/40 hover:text-text"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute inset-x-2 top-full mt-2 grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-panel/95 p-2 shadow-2xl backdrop-blur-xl"
                  role="menu"
                  aria-label="Primary navigation"
                >
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = view === item.view;
                    return (
                      <button
                        key={item.view}
                        type="button"
                        role="menuitem"
                        onClick={() => go(item.view)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-brand/8 hover:text-text",
                          active && "bg-brand/12 text-brand"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
