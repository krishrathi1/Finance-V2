"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { cn } from "@/shared/utils";

type ViewMode = "simple" | "analyst";

interface ViewModeContextType {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  isAnalyst: boolean;
}

const ViewModeContext = createContext<ViewModeContextType>({
  mode: "simple",
  setMode: () => {},
  isAnalyst: false,
});

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>("simple");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("msv_stock_view_mode") as ViewMode | null;
      if (saved === "analyst" || saved === "simple") {
        setModeState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setMode = (newMode: ViewMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem("msv_stock_view_mode", newMode);
    } catch {
      // ignore
    }
  };

  return (
    <ViewModeContext.Provider value={{ mode, setMode, isAnalyst: mode === "analyst" }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}

export function ViewModeSwitcher() {
  const { mode, setMode } = useViewMode();

  return (
    <div className="inline-flex items-center rounded-xl border border-border/80 bg-panel/90 p-1 shadow-md backdrop-blur-md">
      <button
        type="button"
        onClick={() => setMode("simple")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95",
          mode === "simple"
            ? "bg-accent/20 text-accent border border-accent/40 shadow-sm"
            : "text-muted hover:text-text hover:bg-panel/50 border border-transparent"
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span>Simple View</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("analyst")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95",
          mode === "analyst"
            ? "bg-accent text-white font-bold shadow-md"
            : "text-muted hover:text-text hover:bg-panel/50 border border-transparent"
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Advanced Analyst Mode</span>
      </button>
    </div>
  );
}
