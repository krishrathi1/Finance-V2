"use client";

import { ArrowRight, Loader2, Search, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

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
  const [isPending, startTransition] = useTransition();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ symbol: string; name: string; exchange: string }>>([]);
  const [open, setOpen] = useState(false);
  const [navigatingSymbol, setNavigatingSymbol] = useState<string | null>(null);

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
    if (requestId !== searchRequestId.current) return;
    setResults(nextResults);
    setOpen(true);
  }

  const navigateToStock = (symbol: string, exchange?: string) => {
    const targetSymbol = symbol.trim().toUpperCase();
    setNavigatingSymbol(targetSymbol);
    startTransition(() => {
      router.push(buildStockHref(targetSymbol, exchange));
      setOpen(false);
    });
  };

  const canSubmit = useMemo(() => query.trim().length > 0 && !isPending, [query, isPending]);

  return (
    <div ref={shellRef} className={`stock-search-shell relative z-[80] ${className}`}>
      <div className="search-bar relative z-10 flex items-center rounded-xl border border-border/60 bg-panel/80 px-2 shadow-sm backdrop-blur-sm sm:rounded-2xl sm:px-3">
        {isPending ? (
          <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin text-accent sm:mr-2" />
        ) : (
          <Search className="mr-1.5 h-4 w-4 shrink-0 text-muted sm:mr-2" />
        )}
        <input
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          disabled={isPending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSubmit) {
              navigateToStock(query);
            }
          }}
          placeholder={isPending && navigatingSymbol ? `Loading ${navigatingSymbol}...` : "Search any NSE/BSE stock..."}
          className="search-input h-10 w-full bg-transparent text-sm outline-none disabled:opacity-70 sm:h-12"
        />
        <button
          disabled={!canSubmit}
          onClick={() => canSubmit && navigateToStock(query)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-50 sm:rounded-xl sm:px-4 sm:py-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Analyze</span>
            </>
          )}
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="search-dropdown smooth-panel-enter absolute left-0 right-0 top-full z-[95] mt-2 overflow-hidden rounded-xl border border-border/60 bg-panel/95 p-1.5 shadow-2xl backdrop-blur-xl sm:mt-3 sm:rounded-2xl sm:p-2">
          <div className="search-scroll max-h-[290px] overflow-y-auto pr-1">
            {results.map((item) => {
              const isItemNavigating = isPending && navigatingSymbol === item.symbol.toUpperCase();
              return (
                <button
                  key={`${item.symbol}-${item.exchange}`}
                  disabled={isPending}
                  onClick={() => navigateToStock(item.symbol, item.exchange)}
                  className={`group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition sm:rounded-xl ${
                    isItemNavigating
                      ? "bg-accent/15 text-accent"
                      : "hover:bg-accent/8 disabled:opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                        item.exchange === "BSE" ? "bg-amber-500/15 text-amber-400" : "bg-accent/10 text-accent"
                      }`}
                    >
                      {item.symbol.slice(0, 2)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{item.symbol}</p>
                      <p className="text-[11px] text-muted">{item.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.exchange === "BSE"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-bg text-muted"
                      }`}
                    >
                      {item.exchange}
                    </span>
                    {isItemNavigating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
