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
    <div className={`relative ${className}`}>
      <div className="flex items-center rounded-2xl border border-border/70 bg-panel px-3">
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
          className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white"
        >
          Analyze
        </button>
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-14 z-30 rounded-2xl border border-border bg-panel p-2 shadow-2xl">
          {results.map((item) => (
            <button
              key={item.symbol}
              onClick={() => {
                router.push(`/stocks/${item.symbol}`);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-bg"
            >
              <span className="font-semibold">{item.symbol}</span>
              <span className="text-xs text-muted">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
