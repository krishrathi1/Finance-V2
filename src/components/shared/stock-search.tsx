"use client";

import { useEffect, useRef, useState } from "react";
import { Search, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { SearchResult } from "@/lib/types";

export function StockSearch({
  className,
  placeholder = "Search any NSE stock — Reliance, TCS, HDFC Bank…",
  onSelect,
  autoFocus = false,
}: {
  className?: string;
  placeholder?: string;
  onSelect?: (symbol: string) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const reqIdRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const openStock = useApp((s) => s.openStock);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiGet<SearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        if (reqId === reqIdRef.current) {
          const list = Array.isArray(res) ? res : [];
          setResults(list);
          setOpen(true);
          setActiveIndex(list.length > 0 ? 0 : -1);
        }
      } catch {
        if (reqId === reqIdRef.current) setResults([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const choose = (symbol: string) => {
    setOpen(false);
    setQuery("");
    if (onSelect) onSelect(symbol);
    else openStock(symbol);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) choose(results[activeIndex].symbol);
      else if (query.trim()) choose(query.trim().toUpperCase());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative w-full", className)} data-testid="stock-search">
      <div className="search-bar flex items-center gap-2 rounded-2xl border border-border/60 bg-panel/70 px-4 py-2.5 backdrop-blur">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKey}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Search stocks"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground/70"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />}
        <button
          onClick={() => query.trim() && choose(query.trim().toUpperCase())}
          className="shine-btn inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-brand/20 transition hover:opacity-95 active:scale-95"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Analyze
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border/60 bg-panel/95 shadow-2xl backdrop-blur-xl">
          <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {results.map((r, i) => (
              <li key={r.symbol}>
                <button
                  onClick={() => choose(r.symbol)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                    i === activeIndex ? "bg-brand/12" : "hover:bg-brand/8"
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-[10px] font-bold text-brand">
                    {r.symbol.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">{r.symbol}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.name}</span>
                  </span>
                  <span className="shrink-0 rounded-md border border-border/50 bg-bg/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {r.exchange}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
