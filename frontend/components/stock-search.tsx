"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { searchStocks } from "@/lib/api";

export function StockSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ symbol: string; name: string; exchange: string }>>([]);
  const [open, setOpen] = useState(false);

  async function onSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const nextResults = await searchStocks(value);
    setResults(nextResults);
    setOpen(true);
  }

  const canSubmit = useMemo(() => query.trim().length > 0, [query]);

  return (
    <div className={`relative z-40 ${className}`}>
      <div className="relative z-10 flex items-center rounded-2xl border border-border/70 bg-panel px-3 shadow-sm">
        <Search className="mr-2 h-4 w-4 text-muted" />
        <input
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSubmit) {
              router.push(`/stocks/${query.toUpperCase()}`);
              setOpen(false);
            }
          }}
          placeholder="Search NSE/BSE symbol, e.g. HDFCBANK"
          className="h-12 w-full bg-transparent text-sm outline-none"
        />
        <button
          onClick={() => canSubmit && router.push(`/stocks/${query.toUpperCase()}`)}
          className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-md"
        >
          Analyze
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="smooth-panel-enter absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border/80 bg-panel/95 p-2 shadow-xl">
          <div className="search-scroll max-h-[290px] overflow-y-auto pr-1">
            {results.map((item) => (
            <button
              key={item.symbol}
              onClick={() => {
                router.push(`/stocks/${item.symbol}`);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:translate-x-1 hover:bg-bg"
            >
              <span className="shrink-0 font-semibold">{item.symbol}</span>
              <span className="truncate text-xs text-muted">{item.name}</span>
            </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
