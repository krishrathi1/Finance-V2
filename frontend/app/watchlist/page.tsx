"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart,
  List,
  Plus,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WatchlistAnalysisButton } from "@/components/watchlist-analysis-button";
import { fetchTickerTape } from "@/lib/api";
import {
  getWatchlist,
  getWatchlists,
  removeFromWatchlist,
  createWatchlist,
  deleteWatchlist,
} from "@/lib/watchlist";

type TickerRow = {
  symbol: string;
  cmp: number;
  change: number;
  changePercent: number;
};

export default function WatchlistPage() {
  const router = useRouter();
  const [lists, setLists] = useState<string[]>([]);
  const [activeList, setActiveList] = useState("My Watchlist");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [tickerData, setTickerData] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");

  // Load watchlists on mount
  useEffect(() => {
    setLists(getWatchlists());
  }, []);

  // Load symbols when active list changes
  useEffect(() => {
    const syms = getWatchlist(activeList);
    setSymbols(syms);
  }, [activeList]);

  // Fetch ticker data
  useEffect(() => {
    if (symbols.length === 0) {
      setTickerData([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTickerTape(symbols)
      .then((rows) => {
        if (!cancelled) {
          setTickerData(rows as TickerRow[]);
        }
      })
      .catch(() => {
        if (!cancelled) setTickerData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const handleRemove = useCallback(
    (symbol: string) => {
      removeFromWatchlist(symbol, activeList);
      setSymbols((prev) => prev.filter((s) => s !== symbol));
      setTickerData((prev) => prev.filter((r) => r.symbol !== symbol));
    },
    [activeList]
  );

  const handleCreateList = useCallback(() => {
    const name = newListName.trim();
    if (!name) return;
    createWatchlist(name);
    setLists(getWatchlists());
    setActiveList(name);
    setShowNewList(false);
    setNewListName("");
  }, [newListName]);

  const handleDeleteList = useCallback(
    (name: string) => {
      if (name === "My Watchlist") return;
      deleteWatchlist(name);
      const updated = getWatchlists();
      setLists(updated);
      if (activeList === name) {
        setActiveList("My Watchlist");
      }
    },
    [activeList]
  );

  // Merge ticker data with symbols (some symbols may not return data)
  const rows = symbols.map((sym) => {
    const data = tickerData.find(
      (r) => r.symbol.toUpperCase() === sym.toUpperCase()
    );
    return {
      symbol: sym,
      cmp: data?.cmp ?? null,
      change: data?.change ?? null,
      changePercent: data?.changePercent ?? null,
    };
  });

  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Watchlist" }]}
        eyebrow="Monitoring workspace"
        title={
          <>
            Watchlists that feel like a
            <span className="block bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
              real market desk.
            </span>
          </>
        }
        description="Organize names into focused lists, scan movement quickly, and jump into deeper analysis without the interface looking lightweight or disposable."
        actions={
          <Link
            href="/compare"
            className="inline-flex items-center gap-2 rounded-full border border-border/55 bg-bg/60 px-4 py-2 text-sm font-semibold text-text transition hover:border-accent/35 hover:text-accent active:scale-[0.98]"
          >
            <TrendingUp className="h-4 w-4" />
            Compare Stocks
          </Link>
        }
        stats={[
          { label: "Lists", value: `${lists.length}` },
          { label: "Tracked", value: `${symbols.length}`, toneClassName: "text-accent" },
          { label: "Workflow", value: "Multi-list", toneClassName: "text-success" },
        ]}
        aside={
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Heart className="h-4 w-4 text-accent" />
              Watchlist mode
            </div>
            <div className="grid gap-2">
              <div className="rounded-2xl border border-border/45 bg-bg/42 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Active list</p>
                <p className="mt-1 text-sm font-semibold text-text">{activeList}</p>
              </div>
              <div className="rounded-2xl border border-border/45 bg-bg/42 px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Coverage</p>
                <p className="mt-1 text-sm font-semibold text-text">
                  {symbols.length > 0 ? `${symbols.length} names ready to scan` : "Add names to start tracking"}
                </p>
              </div>
            </div>
          </div>
        }
      />
      {/* Header */}
      <div className="hidden flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">
              Home
            </Link>{" "}
            / Watchlist
          </p>
          <h1 className="mt-1 font-[var(--font-space)] text-2xl font-bold sm:text-3xl">
            <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
              Watchlists
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Track your favorite stocks in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/compare"
            className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-panel/80 px-3 py-2 text-xs font-medium text-muted backdrop-blur-sm transition hover:border-accent/40 hover:text-accent sm:text-sm"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Compare Stocks
          </Link>
        </div>
      </div>

      {/* List Tabs */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {lists.map((name) => (
              <button
                key={name}
                onClick={() => setActiveList(name)}
                className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                  activeList === name
                    ? "bg-accent/15 text-accent"
                    : "bg-panel/60 text-muted hover:bg-accent/8 hover:text-text"
                }`}
              >
                {name === "My Watchlist" ? (
                  <Star className="h-3 w-3" />
                ) : (
                  <List className="h-3 w-3" />
                )}
                {name}
                {name !== "My Watchlist" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteList(name);
                    }}
                    className="ml-1 rounded p-0.5 text-muted opacity-0 transition hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </button>
            ))}

            {showNewList ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateList();
                    if (e.key === "Escape") {
                      setShowNewList(false);
                      setNewListName("");
                    }
                  }}
                  placeholder="List name..."
                  className="h-7 w-32 rounded-lg border border-border/60 bg-bg/60 px-2 text-xs outline-none focus:border-accent/50 sm:w-40"
                />
                <button
                  onClick={handleCreateList}
                  className="rounded-lg bg-accent/15 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/25"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowNewList(false);
                    setNewListName("");
                  }}
                  className="rounded-lg p-1 text-muted transition hover:text-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewList(true)}
                className="flex items-center gap-1 rounded-xl border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted transition hover:border-accent/40 hover:text-accent"
              >
                <Plus className="h-3 w-3" />
                New List
              </button>
            )}
          </div>

          <p className="text-xs text-muted">
            {symbols.length} {symbols.length === 1 ? "stock" : "stocks"}
          </p>
        </CardHeader>

        <CardContent>
          {/* Loading State */}
          {loading && symbols.length > 0 && (
            <div className="space-y-3">
              {Array.from({ length: Math.min(symbols.length, 5) }).map(
                (_, i) => (
                  <div
                    key={i}
                    className="shimmer h-16 rounded-xl border border-border/40"
                  />
                )
              )}
            </div>
          )}

          {/* Empty State */}
          {!loading && symbols.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <Heart className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-lg font-semibold">
                Add stocks to your watchlist
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Browse stocks and tap the heart icon to add them here. You can
                track prices, changes, and quickly navigate to detailed analysis.
              </p>
              <Link
                href="/"
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <TrendingUp className="h-4 w-4" />
                Browse Stocks
              </Link>
            </div>
          )}

          {/* Stock List */}
          {!loading && rows.length > 0 && (
            <div className="space-y-2">
              {/* Table Header - hidden on mobile */}
              <div className="hidden grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 px-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
                <span>Symbol</span>
                <span className="w-24 text-right">Price</span>
                <span className="w-24 text-right">Change</span>
                <span className="w-20 text-right">Change %</span>
                <span className="w-24 text-right">AI View</span>
                <span className="w-10" />
              </div>

              {rows.map((row) => {
                const isPositive = (row.change ?? 0) >= 0;
                return (
                  <div
                    key={row.symbol}
                    className="glow-card group grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border/50 bg-panel/60 px-4 py-3 backdrop-blur-sm transition sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:gap-4"
                  >
                    {/* Symbol */}
                    <button
                      onClick={() =>
                        router.push(`/stocks/${row.symbol}`)
                      }
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-xs font-bold text-accent">
                        {row.symbol.slice(0, 2)}
                      </span>
                      <div>
                        <p className="text-sm font-semibold transition group-hover:text-accent">
                          {row.symbol}
                        </p>
                        <p className="text-[10px] text-muted sm:hidden">
                          {row.cmp !== null
                            ? `₹${row.cmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "---"}
                        </p>
                      </div>
                    </button>

                    {/* Mobile: Change badge + remove */}
                    <div className="flex items-center gap-2 sm:hidden">
                      {row.changePercent !== null && (
                        <span
                          className={`flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold ${
                            isPositive
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {isPositive ? "+" : ""}
                          {row.changePercent.toFixed(2)}%
                        </span>
                      )}
                      <WatchlistAnalysisButton symbol={row.symbol} compactLabel />
                      <button
                        onClick={() => handleRemove(row.symbol)}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-danger/15 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Desktop: Price */}
                    <span className="hidden w-24 text-right text-sm font-medium sm:block">
                      {row.cmp !== null
                        ? `₹${row.cmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "---"}
                    </span>

                    {/* Desktop: Change */}
                    <span
                      className={`hidden w-24 text-right text-sm font-medium sm:block ${
                        isPositive ? "text-success" : "text-danger"
                      }`}
                    >
                      {row.change !== null
                        ? `${isPositive ? "+" : ""}${row.change.toFixed(2)}`
                        : "---"}
                    </span>

                    {/* Desktop: Change % */}
                    <span className="hidden w-20 sm:flex sm:justify-end">
                      {row.changePercent !== null ? (
                        <span
                          className={`flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold ${
                            isPositive
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {isPositive ? "+" : ""}
                          {row.changePercent.toFixed(2)}%
                        </span>
                      ) : (
                        "---"
                      )}
                    </span>

                    {/* Desktop: AI Analysis */}
                    <span className="hidden w-24 sm:flex sm:justify-end">
                      <WatchlistAnalysisButton symbol={row.symbol} compactLabel />
                    </span>

                    {/* Desktop: Remove */}
                    <span className="hidden w-10 sm:flex sm:justify-end">
                      <button
                        onClick={() => handleRemove(row.symbol)}
                        className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
