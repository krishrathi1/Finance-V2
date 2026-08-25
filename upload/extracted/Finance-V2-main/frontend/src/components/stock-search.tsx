"use client";

import { ArrowRight, Search, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { searchStocks } from "@/lib/api";

function buildStockHref(symbol: string, exchange?: string) {
  const normalizedExchange = String(exchange || "").trim().toUpperCase();
  if (!normalizedExchange || normalizedExchange === "NSE" || normalizedExchange === "NSE/BSE") {
    return `/stocks/${symbol}`;
  }
  return `/stocks/${symbol}?exchange=${normalizedExchange}`;
}

export function StockSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ symbol: string; name: string; exchange: string }>>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const searchRequestId = useRef(0);

  async function onSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      searchRequestId.current += 1;
      setResults([]);
      setOpen(false);
      return;
    }
    const requestId = ++searchRequestId.current;
    const nextResults = await searchStocks(value);
    // A newer keystroke may have started its own search while this one was
    // in flight — only apply the response if it's still the latest request.
    if (requestId !== searchRequestId.current) return;
    setResults(nextResults);
    setOpen(true);
  }

  const canSubmit = useMemo(() => query.trim().length > 0, [query]);

  return (
    <div ref={shellRef} className={`stock-search-shell relative z-[80] ${className}`}>
      <div className="search-bar relative z-10 flex items-center rounded-xl border border-border/60 bg-panel/80 px-2 shadow-sm backdrop-blur-sm sm:rounded-2xl sm:px-3">
        <Search className="mr-1.5 h-4 w-4 shrink-0 text-muted sm:mr-2" />
        <input
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSubmit) {
              router.push(`/stocks/${encodeURIComponent(query.trim().toUpperCase())}`);
              setOpen(false);
            }
          }}
          placeholder="Search any NSE/BSE stock..."
          className="search-input h-10 w-full bg-transparent text-sm outline-none sm:h-12"
        />
        <button
          onClick={() => canSubmit && router.push(`/stocks/${encodeURIComponent(query.trim().toUpperCase())}`)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-xl sm:px-4 sm:py-2"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Analyze
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="search-dropdown smooth-panel-enter absolute left-0 right-0 top-full z-[95] mt-2 overflow-hidden rounded-xl border border-border/60 bg-panel/95 p-1.5 shadow-2xl backdrop-blur-xl sm:mt-3 sm:rounded-2xl sm:p-2">
          <div className="search-scroll max-h-[290px] overflow-y-auto pr-1">
            {results.map((item) => (
              <button
                key={item.symbol}
                onClick={() => {
                  router.push(buildStockHref(item.symbol, item.exchange));
                  setOpen(false);
                }}
                className="group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-accent/8 sm:rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-xs font-bold text-accent">
                    {item.symbol.slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.symbol}</p>
                    <p className="text-[11px] text-muted">{item.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-muted">{item.exchange}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
