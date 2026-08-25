"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChangePill } from "@/components/shared/change-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { apiGet } from "@/lib/api";
import { useApp, usePolling } from "@/lib/store";
import { fmtCr, fmtInr, type ScreenerRow } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── presets ──────────────────────────────────────────────────────────────
const PRESETS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "volume-shockers", label: "⚡ Volume Shockers" },
  { key: "high52", label: "🏆 Momentum Breakouts" },
  { key: "clean-forensics", label: "🛡️ Clean Forensics" },
  { key: "dividend", label: "🔥 High Dividend" },
  { key: "value-growth", label: "📈 Value + Growth" },
  { key: "quality-large", label: "🏦 Quality Largecaps" },
];

type SortKey =
  | "symbol"
  | "name"
  | "price"
  | "changePercent"
  | "marketCapCr"
  | "pe"
  | "pb"
  | "roe"
  | "dividendYield"
  | "smartScore"
  | "riskScore";

interface ScreenerResponse {
  results: ScreenerRow[];
  count: number;
  sectors: string[];
}

interface DebouncedFilters {
  search: string;
  minMcap: string;
  maxPe: string;
  minDy: string;
  minRoe: string;
}

const EMPTY_FILTERS: DebouncedFilters = { search: "", minMcap: "", maxPe: "", minDy: "", minRoe: "" };

function sameFilters(a: DebouncedFilters, b: DebouncedFilters): boolean {
  return (
    a.search === b.search &&
    a.minMcap === b.minMcap &&
    a.maxPe === b.maxPe &&
    a.minDy === b.minDy &&
    a.minRoe === b.minRoe
  );
}

function peClass(pe: number | null): string {
  if (pe === null) return "text-muted-foreground";
  if (pe < 15) return "text-success";
  if (pe < 30) return "text-text";
  if (pe < 50) return "text-warn";
  return "text-danger";
}

/** Tiny 0–5 gradient meter used for Smart Score (violet) and Risk (red). */
function ScoreBar({ value, tone }: { value: number; tone: "smart" | "risk" }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="inline-flex items-center gap-1.5" aria-hidden>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "smart" ? "bg-gradient-to-r from-violet-500 to-fuchsia-500" : "bg-gradient-to-r from-red-500 to-orange-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

export function ScreenerView() {
  const openStock = useApp((s) => s.openStock);

  // raw (immediate) text inputs — debounced into `debounced`
  const [searchText, setSearchText] = useState("");
  const [minMcap, setMinMcap] = useState("");
  const [maxPe, setMaxPe] = useState("");
  const [minDy, setMinDy] = useState("");
  const [minRoe, setMinRoe] = useState("");
  const [debounced, setDebounced] = useState<DebouncedFilters>(EMPTY_FILTERS);

  const [sector, setSector] = useState("");
  const [preset, setPreset] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketCapCr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [count, setCount] = useState(0);
  const [sectors, setSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // debounce text inputs (350ms)
  useEffect(() => {
    const t = setTimeout(() => {
      const next: DebouncedFilters = {
        search: searchText.trim(),
        minMcap: minMcap.trim(),
        maxPe: maxPe.trim(),
        minDy: minDy.trim(),
        minRoe: minRoe.trim(),
      };
      setDebounced((prev) => (sameFilters(prev, next) ? prev : next));
    }, 350);
    return () => clearTimeout(t);
  }, [searchText, minMcap, maxPe, minDy, minRoe]);

  // always-fresh filter snapshot for the polling fetcher
  const filtersRef = useRef({ debounced, sector, preset, sortKey, sortDir });
  filtersRef.current = { debounced, sector, preset, sortKey, sortDir };
  const reqIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const f = filtersRef.current;
    const id = ++reqIdRef.current;
    const p = new URLSearchParams();
    if (f.preset) p.set("preset", f.preset);
    if (f.sector) p.set("sector", f.sector);
    if (f.debounced.search) p.set("q", f.debounced.search);
    if (f.debounced.minMcap) p.set("minMcap", f.debounced.minMcap);
    if (f.debounced.maxPe) p.set("maxPe", f.debounced.maxPe);
    if (f.debounced.minDy) p.set("minDy", f.debounced.minDy);
    if (f.debounced.minRoe) p.set("minRoe", f.debounced.minRoe);
    p.set("sort", f.sortKey);
    p.set("dir", f.sortDir);
    p.set("limit", "100");
    if (!silent) setLoading(true);
    try {
      const data = await apiGet<ScreenerResponse>(`/api/stocks/screener?${p.toString()}`);
      if (id !== reqIdRef.current) return;
      setRows(data.results);
      setCount(data.count);
      if (Array.isArray(data.sectors) && data.sectors.length > 0) {
        setSectors((prev) => (prev.length > 0 ? prev : data.sectors));
      }
      setError(null);
    } catch {
      if (id === reqIdRef.current) setError("Couldn't load the screener. Retrying shortly…");
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, []);

  // refetch on any filter change (initial load is handled by usePolling's immediate call)
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    load();
  }, [debounced, sector, preset, sortKey, sortDir, load]);

  // live prices every 30s
  usePolling(() => load(true), 30000);

  const resetAll = () => {
    setSearchText("");
    setMinMcap("");
    setMaxPe("");
    setMinDy("");
    setMinRoe("");
    setSector("");
    setPreset("");
    setSortKey("marketCapCr");
    setSortDir("desc");
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" || key === "name" ? "asc" : "desc");
    }
  };

  const hasActiveFilters =
    preset !== "" || sector !== "" || !sameFilters(debounced, EMPTY_FILTERS);

  const columns = useMemo(
    () =>
      [
        { key: "symbol" as SortKey, label: "Stock" },
        { key: "price" as SortKey, label: "Price", align: "right" },
        { key: "changePercent" as SortKey, label: "1D %", align: "right" },
        { key: "marketCapCr" as SortKey, label: "Mkt Cap", align: "right" },
        { key: "pe" as SortKey, label: "P/E", align: "right" },
        { key: "pb" as SortKey, label: "P/B", align: "right" },
        { key: "roe" as SortKey, label: "ROE %", align: "right" },
        { key: "dividendYield" as SortKey, label: "Div Yld %", align: "right" },
        { key: "smartScore" as SortKey, label: "Smart", align: "right" },
        { key: "riskScore" as SortKey, label: "Risk", align: "right" },
      ] as { key: SortKey; label: string; align?: "right" }[],
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="stagger-fade space-y-4"
    >
      <SectionHeading
        icon={SlidersHorizontal}
        kicker="Discovery"
        title="Stock Screener"
        right={
          <Badge
            variant="outline"
            className="border-border/50 bg-panel/60 tabular-nums text-muted-foreground"
          >
            {loading ? "scanning…" : `${count} ${count === 1 ? "match" : "matches"}`}
          </Badge>
        }
      />

      {/* preset chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Expert screen presets">
        {PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <button
              key={p.key || "all"}
              type="button"
              onClick={() => setPreset(p.key)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                active
                  ? "border-brand bg-brand text-white shadow-lg shadow-brand/20"
                  : "border-border/60 bg-panel/60 text-muted-foreground hover:border-brand/40 hover:text-text"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* filter bar */}
      <section
        aria-label="Screener filters"
        className="rounded-2xl border border-border/50 bg-panel/60 p-4 backdrop-blur-sm"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="relative col-span-2 md:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search symbol or company"
              aria-label="Search symbol or company"
              className="h-9 border-border/60 bg-bg/50 pl-9 text-sm placeholder:text-muted-foreground/70"
            />
          </div>

          <Select value={sector || "all"} onValueChange={(v) => setSector(v === "all" ? "" : v)}>
            <SelectTrigger
              aria-label="Filter by sector"
              className="h-9 w-full border-border/60 bg-bg/50 text-sm"
            >
              <SelectValue placeholder="All sectors" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            min={0}
            value={minMcap}
            onChange={(e) => setMinMcap(e.target.value)}
            placeholder="Min cap"
            aria-label="Minimum market cap in crore rupees"
            className="h-9 border-border/60 bg-bg/50 text-sm placeholder:text-muted-foreground/70"
          />
          <Input
            type="number"
            min={0}
            value={maxPe}
            onChange={(e) => setMaxPe(e.target.value)}
            placeholder="Max PE"
            aria-label="Maximum P/E ratio"
            className="h-9 border-border/60 bg-bg/50 text-sm placeholder:text-muted-foreground/70"
          />
          <Input
            type="number"
            min={0}
            value={minDy}
            onChange={(e) => setMinDy(e.target.value)}
            placeholder="Min div %"
            aria-label="Minimum dividend yield percent"
            className="h-9 border-border/60 bg-bg/50 text-sm placeholder:text-muted-foreground/70"
          />
          <Input
            type="number"
            min={0}
            value={minRoe}
            onChange={(e) => setMinRoe(e.target.value)}
            placeholder="Min ROE %"
            aria-label="Minimum return on equity percent"
            className="h-9 border-border/60 bg-bg/50 text-sm placeholder:text-muted-foreground/70"
          />

          <div className="col-span-2 flex items-center md:col-span-1 xl:col-span-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              disabled={!hasActiveFilters}
              aria-label="Reset all screener filters"
              className="h-9 w-full gap-1.5 text-xs text-muted-foreground hover:text-text"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </section>

      {/* results */}
      <section
        aria-label="Screener results"
        className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
          <p className="text-[11px] text-muted-foreground">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : (
              <>
                Scanned <span className="tabular-nums font-semibold text-text">{count}</span> stocks
                with current filters · showing top{" "}
                <span className="tabular-nums font-semibold text-text">{rows.length}</span>
              </>
            )}
          </p>
          <p className="hidden text-[11px] text-muted-foreground sm:block">prices refresh every 30s</p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          <Table className="text-xs sm:text-sm">
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                {columns.map((col) => {
                  const active = sortKey === col.key;
                  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <TableHead
                      key={col.key}
                      className={cn(
                        "sticky top-0 z-10 bg-panel px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                        col.align === "right" && "text-right"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        aria-label={`Sort by ${col.label}`}
                        className={cn(
                          "group inline-flex items-center gap-1 transition-colors hover:text-text",
                          col.align === "right" && "flex-row-reverse",
                          active && "text-brand"
                        )}
                      >
                        <span>{col.label}</span>
                        <Icon
                          className={cn(
                            "h-3 w-3 transition-opacity",
                            active ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                          )}
                        />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="border-border/30">
                    {columns.map((col) => (
                      <TableCell key={col.key} className={cn("px-3 py-3", col.align === "right" && "text-right")}>
                        <div className="shimmer h-4 w-full rounded bg-muted/60" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="p-0">
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                      <p className="text-sm text-muted-foreground">No stocks match these filters</p>
                      {hasActiveFilters && (
                        <Button variant="outline" size="sm" onClick={resetAll} className="gap-1.5 border-border/60">
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow
                    key={r.symbol}
                    onClick={() => openStock(r.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openStock(r.symbol);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${r.symbol} dashboard`}
                    className="cursor-pointer border-border/30 transition-colors hover:bg-brand/5 focus-visible:bg-brand/5 focus-visible:outline-none"
                  >
                    <TableCell className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-text">{r.symbol}</span>
                        <span className="block max-w-[170px] truncate text-[11px] text-muted-foreground">
                          {r.name}
                        </span>
                        <span className="w-fit rounded border border-border/50 bg-bg/60 px-1.5 py-px text-[10px] text-muted-foreground">
                          {r.sector}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right tabular-nums text-text">
                      {fmtInr(r.price)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      <ChangePill value={r.changePercent} size="xs" />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right tabular-nums text-text">
                      {fmtCr(r.marketCapCr)}
                    </TableCell>
                    <TableCell className={cn("px-3 py-2.5 text-right tabular-nums", peClass(r.pe))}>
                      {r.pe === null ? "—" : r.pe.toFixed(1)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right tabular-nums text-text">
                      {r.pb.toFixed(1)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.roe >= 20 ? "text-success" : "text-text"
                      )}
                    >
                      {r.roe.toFixed(1)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.dividendYield >= 3 ? "text-success" : "text-text"
                      )}
                    >
                      {r.dividendYield.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <span className="flex items-center justify-end gap-1.5">
                        <ScoreBar value={r.smartScore} tone="smart" />
                        <span className="tabular-nums text-text">{r.smartScore.toFixed(1)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <span className="flex items-center justify-end gap-1.5">
                        <ScoreBar value={r.riskScore} tone="risk" />
                        <span
                          className={cn(
                            "tabular-nums",
                            r.riskScore < 2 ? "text-success" : r.riskScore >= 3.5 ? "text-danger" : "text-warn"
                          )}
                        >
                          {r.riskScore.toFixed(1)}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </motion.div>
  );
}
