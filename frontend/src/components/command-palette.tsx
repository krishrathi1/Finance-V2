"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, Search, TrendingUp } from "lucide-react";

import { searchStocks } from "@/lib/api";

type Result = { symbol: string; name: string; exchange: string };

/**
 * Ctrl+K / Cmd+K quick-open: type a name, hit Enter, land on the stock.
 *
 * The header search only exists on some pages, and reaching any stock from,
 * say, the portfolio takes a navigation plus a search. A global palette makes
 * every stock two keystrokes and a name away from anywhere, which is the
 * difference between "look it up later" and looking it up now.
 *
 * Deliberately small: search stocks, open stock. Not a general command menu —
 * a palette that lists every action needs maintenance every time a page
 * changes, and the one thing users actually reach for is a ticker.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Stamps each search so a slow early response can't overwrite a later one. */
  const searchSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
  }, []);

  // Global shortcut. keydown on window, not document.body, so it works before
  // anything has focus; ignores the shortcut while a text field is focused so
  // Ctrl+K in an input (a browser URL habit) doesn't hijack typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const target = event.target as HTMLElement | null;
        const typing =
          target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (typing && !open) return;
        event.preventDefault();
        setOpen((previous) => !previous);
      }
      if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search. Sequenced rather than aborted: searchStocks swallows its
  // own errors and returns [], so the guard here only has to prevent a stale
  // response landing after a newer one.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    debounceRef.current = setTimeout(async () => {
      const found = await searchStocks(trimmed);
      if (seq !== searchSeq.current) return;
      setResults(found.slice(0, 8));
      setActive(0);
      setSearching(false);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const go = useCallback(
    (result: Result) => {
      close();
      router.push(`/stocks/${encodeURIComponent(result.symbol)}`);
    },
    [router, close]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 px-4 pt-[14vh] backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Quick stock search"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/60 bg-panel/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2.5 border-b border-border/40 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((previous) => Math.min(previous + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((previous) => Math.max(previous - 1, 0));
              } else if (event.key === "Enter" && results[active]) {
                go(results[active]);
              }
            }}
            placeholder="Search any stock — Reliance, TCS, HDFC…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted/60"
            aria-label="Stock search"
          />
          <kbd className="hidden rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted sm:block">
            esc
          </kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {searching && (
            <p className="px-3 py-4 text-center text-xs text-muted">Searching…</p>
          )}
          {!searching && query.trim() && results.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted">
              Nothing found for &ldquo;{query.trim()}&rdquo;
            </p>
          )}
          {!searching && !query.trim() && (
            <p className="px-3 py-4 text-center text-[11px] text-muted">
              Type a company name or symbol. <span className="text-muted/70">↑↓ to pick, Enter to open.</span>
            </p>
          )}
          {results.map((result, index) => (
            <button
              key={`${result.symbol}-${result.exchange}`}
              type="button"
              onClick={() => go(result)}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                index === active ? "bg-accent/12 text-accent" : "hover:bg-bg/60"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{result.symbol}</span>
                <span className="block truncate text-[11px] text-muted">{result.name}</span>
              </span>
              <span className="shrink-0 rounded-md bg-bg/70 px-1.5 py-0.5 text-[10px] text-muted">
                {result.exchange}
              </span>
              {index === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-70" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
