"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme !== "light" : true;

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="group relative inline-flex h-9 w-16 items-center rounded-full border border-border/50 bg-bg/80 p-0.5 transition-colors hover:border-accent/40"
    >
      <span
        className={`absolute flex h-7 w-7 items-center justify-center rounded-full bg-panel shadow-sm transition-all duration-300 ${
          mounted && !isDark ? "translate-x-0" : "translate-x-[1.85rem]"
        }`}
      >
        {!mounted ? (
          <Moon className="h-3.5 w-3.5 text-muted" />
        ) : isDark ? (
          <Sun className="h-3.5 w-3.5 text-amber-400" />
        ) : (
          <Moon className="h-3.5 w-3.5 text-blue-500" />
        )}
      </span>
      <span className="sr-only">{isDark ? "Switch to light" : "Switch to dark"}</span>
    </button>
  );
}
