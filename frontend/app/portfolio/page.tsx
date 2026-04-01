"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle,
  Edit2,
  Minus,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FaqSection } from "@/components/seo/faq-section";
import { FeatureAuthWall } from "@/components/sections/feature-auth-wall";
import { PortfolioDoctor } from "@/components/sections/portfolio-doctor";
import { fetchAIScreenerResults, fetchTickerTape, fetchPortfolioRiskAssessment, searchStocks, parsePortfolioDocument } from "@/lib/api";
import { addAlert, getAlertsForSymbol, removeAlert } from "@/lib/alerts";
import { ImportModal } from "@/components/modals/import-modal";
import {
  addHolding,
  enrichHoldings,
  getHoldings,
  portfolioSummary,
  removeHolding,
  updateHolding,
} from "@/lib/portfolio";
import type { Holding, HoldingWithValue } from "@/lib/portfolio";
import type { ScreenerResult } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PortfolioSuggestionCard() {
  const [budget, setBudget] = useState("10000");
  const [goal, setGoal] = useState("steady compounder");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<ScreenerResult | null>(null);

  const handleSuggest = useCallback(async () => {
    const numericBudget = parseFloat(budget);
    if (!numericBudget || numericBudget <= 0) {
      setError("Enter a valid budget to get a suggestion.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = `Suggest one Indian stock for a ${goal} investor with a budget of Rs ${numericBudget}. Prefer liquid businesses with understandable fundamentals.`;
      const { results } = await fetchAIScreenerResults(query);
      if (!results.length) {
        setSuggestion(null);
        setError("No suggestion found right now. Try a different budget or goal.");
        return;
      }
      setSuggestion(results[0]);
    } catch {
      setSuggestion(null);
      setError("AI stock suggestion is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [budget, goal]);

  const estimatedShares = suggestion?.price ? Math.floor(parseFloat(budget || "0") / suggestion.price) : 0;

  return (
    <Card className="border-accent/20 bg-gradient-to-r from-accent/8 via-amber-500/5 to-transparent">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold">AI Stock Suggestion</p>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                Beginner Mode
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Not sure what to buy first? Start with your budget and goal, then use this as a shortlist starter.
            </p>
          </div>
          <button
            onClick={handleSuggest}
            disabled={loading}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {loading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? "Finding match..." : "Suggest a stock"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Budget (Rs)</p>
            <input
              type="number"
              min="100"
              step="100"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Goal</p>
            <div className="grid grid-cols-3 gap-2">
              {["steady compounder", "lower risk", "higher growth"].map((item) => (
                <button
                  key={item}
                  onClick={() => setGoal(item)}
                  className={`rounded-xl border px-2 py-2 text-[11px] font-semibold capitalize transition ${
                    goal === item
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border/50 bg-panel/50 text-muted hover:border-accent/30 hover:text-text"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {suggestion ? (
          <div className="rounded-2xl border border-border/50 bg-bg/35 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">Suggested first look</p>
                <p className="mt-1 text-lg font-bold">{suggestion.symbol}</p>
                <p className="text-sm text-muted">{suggestion.companyName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">
                  {suggestion.exchange || "NSE"}
                </span>
                {suggestion.sector ? (
                  <span className="rounded-lg bg-bg px-2 py-1 text-[11px] text-muted">
                    {suggestion.sector}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/40 bg-panel/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted">Current Price</p>
                <p className="mt-1 text-sm font-semibold">{fmtINR(suggestion.price)}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-panel/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted">Approx Shares</p>
                <p className="mt-1 text-sm font-semibold">{estimatedShares > 0 ? estimatedShares : "<1 share"}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-panel/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted">Why it fits</p>
                <p className="mt-1 text-sm font-semibold capitalize">{goal}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>This is a shortlist starter, not an automatic buy.</span>
              <Link
                href={`/stocks/${suggestion.symbol}?exchange=${encodeURIComponent(suggestion.exchange || "NSE")}`}
                className="font-semibold text-accent hover:text-accent/80"
              >
                Open full analysis
              </Link>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function fmtINR(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${fmt(n)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function syncPortfolioTargetAlert(symbol: string, targetPrice: number | undefined, referencePrice: number) {
  const taggedAlerts = getAlertsForSymbol(symbol).filter((alert) =>
    alert.note.startsWith("Portfolio target")
  );
  taggedAlerts.forEach((alert) => removeAlert(alert.id));
  if (!targetPrice || targetPrice <= 0) return;
  addAlert(
    symbol,
    targetPrice,
    targetPrice >= referencePrice ? "above" : "below",
    "Portfolio target alert"
  );
}

const PIE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#06b6d4",
];

// ────────────────────────────────────────────────────────────────────────────
// Add / Edit Modal
// ────────────────────────────────────────────────────────────────────────────

type ModalProps = {
  editing: Holding | null;
  onClose: () => void;
  onSave: () => void;
};

type SearchResult = { symbol: string; name: string; exchange: string };

function HoldingModal({ editing, onClose, onSave }: ModalProps) {
  const [symbol, setSymbol] = useState(editing?.symbol ?? "");
  const [companyName, setCompanyName] = useState(editing?.companyName ?? "");
  const [quantity, setQuantity] = useState(editing?.quantity ? String(editing.quantity) : "");
  const [buyPrice, setBuyPrice] = useState(editing?.buyPrice ? String(editing.buyPrice) : "");
  const [buyDate, setBuyDate] = useState(editing?.buyDate ?? today());
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [targetPrice, setTargetPrice] = useState(editing?.targetPrice ? String(editing.targetPrice) : "");
  const [error, setError] = useState("");

  // Symbol autocomplete state
  const [query, setQuery] = useState(editing?.symbol ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSymbolSearch(q: string) {
    setQuery(q);
    setSymbol(q.toUpperCase());
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 1) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      const res = await searchStocks(q);
      setResults(res);
      setOpen(res.length > 0);
    }, 250);
  }

  function selectResult(item: SearchResult) {
    setQuery(item.symbol);
    setSymbol(item.symbol);
    setCompanyName(item.name);
    setOpen(false);
  }

  const handleSave = useCallback(() => {
    const sym = symbol.trim().toUpperCase();
    const qty = parseFloat(quantity);
    const price = parseFloat(buyPrice);
    const target = targetPrice.trim() ? parseFloat(targetPrice) : undefined;
    if (!sym) return setError("Symbol is required");
    if (!qty || qty <= 0) return setError("Enter a valid quantity");
    if (!price || price <= 0) return setError("Enter a valid buy price");
    if (targetPrice.trim() && (!target || target <= 0)) return setError("Enter a valid target price");
    setError("");

    if (editing) {
      updateHolding(editing.id, {
        symbol: sym,
        companyName: companyName.trim() || sym,
        quantity: qty,
        buyPrice: price,
        buyDate,
        notes: notes.trim() || undefined,
        targetPrice: target,
      });
    } else {
      addHolding(sym, companyName.trim() || sym, qty, price, buyDate, notes.trim() || undefined, target);
    }
    syncPortfolioTargetAlert(sym, target, price);
    onSave();
    onClose();
  }, [symbol, companyName, quantity, buyPrice, targetPrice, buyDate, notes, editing, onSave, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-bg/70 p-4 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border/70 bg-panel/95 p-5 shadow-2xl backdrop-blur-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-accent" />
            <p className="text-sm font-semibold">{editing ? "Edit Holding" : "Add Holding"}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-accent/10 hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Symbol search with autocomplete */}
          <div ref={containerRef} className={`relative ${open ? "z-[80]" : "z-0"}`}>
            <p className="mb-1 text-xs font-medium text-muted">Company Name *</p>
            <div className="flex items-center rounded-xl border border-border/60 bg-bg/60 px-3 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/30">
              <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => handleSymbolSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) {
                    setSymbol(query.toUpperCase());
                    setOpen(false);
                  }
                }}
                onFocus={() => { if (results.length > 0) setOpen(true); }}
                placeholder="Search company or symbol…"
                className="h-9 w-full bg-transparent text-sm uppercase outline-none focus:outline-none focus:ring-0 border-0 border-transparent focus:border-transparent"
              />
            </div>
            {open && results.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-panel/95 p-1 shadow-2xl backdrop-blur-xl">
                {results.map((item) => (
                  <button
                    key={item.symbol}
                    onMouseDown={(e) => { e.preventDefault(); selectResult(item); }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-accent/8"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">
                        {item.symbol.slice(0, 2)}
                      </span>
                      <div>
                        <p className="text-xs font-semibold">{item.symbol}</p>
                        <p className="text-[10px] text-muted">{item.name}</p>
                      </div>
                    </div>
                    <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-muted">{item.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>


          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Quantity *</p>
              <input
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Buy Price (₹) *</p>
              <input
                type="number"
                min="0"
                step="0.01"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="e.g. 2450"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted">Buy Date *</p>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              max={today()}
              className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted">Notes (optional)</p>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Long-term hold"
              className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted">Target Price (optional)</p>
            <div className="rounded-xl border border-border/60 bg-bg/60 px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                <Bell className="h-3 w-3" />
                Save a target and auto-create an alert when price reaches it.
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="e.g. 3000"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={handleSave}
            className="w-full rounded-xl bg-gradient-to-r from-accent to-amber-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            {editing ? "Update Holding" : "Add to Portfolio"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Summary Card
// ────────────────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  isPositive,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  isPositive?: boolean;
  icon: React.ElementType;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 text-lg font-bold sm:text-xl">{value}</p>
          {sub && (
            <p
              className={`mt-0.5 text-xs font-semibold ${
                isPositive === undefined ? "text-muted" : isPositive ? "text-success" : "text-danger"
              }`}
            >
              {sub}
            </p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isPositive === undefined
              ? "bg-accent/10"
              : isPositive
              ? "bg-success/10"
              : "bg-danger/10"
          }`}
        >
          <Icon
            className={`h-5 w-5 ${
              isPositive === undefined ? "text-accent" : isPositive ? "text-success" : "text-danger"
            }`}
          />
        </div>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Holdings Table Row
// ────────────────────────────────────────────────────────────────────────────

function HoldingRow({
  h,
  totalValue,
  onEdit,
  onRemove,
}: {
  h: HoldingWithValue;
  totalValue: number;
  onEdit: (h: Holding) => void;
  onRemove: (id: string) => void;
}) {
  const isPos = h.pnl !== null ? h.pnl >= 0 : true;
  const weight = totalValue > 0 && h.currentValue ? (h.currentValue / totalValue) * 100 : 0;

  return (
    <div className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border/50 bg-panel/60 px-4 py-3 transition hover:border-accent/30 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
      {/* Symbol + company */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/stocks/${h.symbol}`} className="text-sm font-bold transition hover:text-accent">
            {h.symbol}
          </Link>
          {weight > 0 && (
            <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {weight.toFixed(1)}%
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted">{h.companyName}</p>
        {h.notes && <p className="truncate text-[10px] italic text-muted/70">{h.notes}</p>}
        {h.targetPrice ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
              Target {fmtINR(h.targetPrice)}
            </span>
            {h.currentPrice !== null ? (
              <span className="text-muted">
                {h.targetPrice >= h.currentPrice
                  ? `${(((h.targetPrice - h.currentPrice) / h.currentPrice) * 100).toFixed(1)}% upside`
                  : `${(((h.currentPrice - h.targetPrice) / h.currentPrice) * 100).toFixed(1)}% below current`}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile: key info */}
      <div className="flex items-center gap-2 sm:hidden">
        <div className="text-right">
          <p className="text-xs font-semibold">
            {h.currentValue !== null ? fmtINR(h.currentValue) : "—"}
          </p>
          {h.pnl !== null && (
            <p className={`text-[10px] font-medium ${isPos ? "text-success" : "text-danger"}`}>
              {isPos ? "+" : ""}
              {fmt(h.pnl)} ({h.pnlPercent !== null ? (isPos ? "+" : "") + h.pnlPercent.toFixed(1) + "%" : "—"})
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(h)} className="rounded-lg p-1.5 text-muted hover:bg-accent/10 hover:text-accent">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onRemove(h.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Desktop columns */}
      <div className="hidden sm:block">
        <p className="text-xs text-muted">Qty</p>
        <p className="text-sm font-medium">{h.quantity.toLocaleString("en-IN")}</p>
      </div>
      <div className="hidden sm:block">
        <p className="text-xs text-muted">Buy Cost</p>
        <p className="text-sm font-medium">₹{fmt(h.buyPrice)}</p>
      </div>
      <div className="hidden sm:block">
        <p className="text-xs text-muted">Current</p>
        <p className="text-sm font-medium">
          {h.currentPrice !== null ? `₹${fmt(h.currentPrice)}` : "—"}
        </p>
      </div>
      <div className="hidden sm:block">
        <p className="text-xs text-muted">P&L</p>
        {h.pnl !== null ? (
          <div className="space-y-0.5">
            <p className={`text-sm font-semibold ${isPos ? "text-success" : "text-danger"}`}>
            {isPos ? "+" : ""}₹{fmt(h.pnl)}
            </p>
            <p className={`text-xs font-semibold ${isPos ? "text-success" : "text-danger"}`}>
              {isPos ? "+" : ""}{h.pnlPercent?.toFixed(1)}%
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </div>

      {/* Desktop actions */}
      <div className="hidden items-center gap-1 sm:flex">
        <button
          onClick={() => onEdit(h)}
          className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onRemove(h.id)}
          className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Allocation Pie Chart
// ────────────────────────────────────────────────────────────────────────────

function AllocationChart({ enriched }: { enriched: HoldingWithValue[] }) {
  const data = useMemo(() => {
    const total = enriched.reduce((s, h) => s + (h.currentValue ?? h.investedValue), 0);
    if (total === 0) return [];
    // Group by symbol (sum duplicates)
    const map = new Map<string, number>();
    for (const h of enriched) {
      const val = h.currentValue ?? h.investedValue;
      map.set(h.symbol, (map.get(h.symbol) ?? 0) + val);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value, pct: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [enriched]);

  if (data.length === 0) return null;

  return (
    <Card className="p-4">
      <CardHeader className="p-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-accent" />
          Allocation
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col items-center gap-4">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number | string | undefined) => [fmtINR(Number(v || 0)), "Value"]}
                  contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 12 }}
                  labelStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="w-full space-y-2">
            {data.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate text-xs font-medium">{item.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-right">
                  <span className="text-xs text-muted">{item.pct.toFixed(1)}%</span>
                  <span className="text-xs font-semibold">{fmtINR(item.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────────────────

type RiskAnalysis = {
  overallRisk: string;
  riskScore: number;
  diversificationScore: number;
  sectorConcentration: string;
  topRisks: string[];
  recommendations: string[];
  summary: string;
};

export default function PortfolioPage() {
  const portfolioFaqs = [
    {
      question: "What can I track with the portfolio page?",
      answer:
        "You can track holdings, average buy price, current value, allocation, profit and loss, price alerts, and AI portfolio risk commentary for Indian stocks.",
    },
    {
      question: "Does the portfolio tracker require a login?",
      answer:
        "The current portfolio workflow stores data locally in your browser, so it is designed as a lightweight no-login experience for quick tracking and review.",
    },
    {
      question: "Can I use the portfolio page for stock market analysis?",
      answer:
        "Yes. The portfolio view is not just a holdings ledger. It also helps you review concentration, target levels, and AI risk insights so you can manage the portfolio with more context.",
    },
  ];
  const portfolioFaqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: portfolioFaqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const [holdings, setHoldings] = useState<HoldingWithValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadPortfolio = useCallback(async (options: { force?: boolean; keepLoading?: boolean } = {}) => {
    const { force = false, keepLoading = true } = options;
    const raw = getHoldings();
    if (raw.length === 0) {
      setHoldings([]);
      setLoading(false);
      return;
    }
    if (keepLoading) {
      setLoading(true);
    }
    const symbols = [...new Set(raw.map((h) => h.symbol))];
    let priceMap: Record<string, number> = {};
    try {
      const tickers = await fetchTickerTape(symbols, { force });
      for (const t of tickers) priceMap[t.symbol.toUpperCase()] = t.cmp;
    } catch {
      // prices stay null
    }
    setHoldings(enrichHoldings(raw, priceMap));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (holdings.length === 0) return;

    const refresh = () => {
      void loadPortfolio({ force: true, keepLoading: false });
    };

    const intervalId = window.setInterval(refresh, 20_000);
    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [holdings.length, loadPortfolio]);

  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);

  const handleRemove = useCallback((id: string) => {
    const removed = holdings.find((holding) => holding.id === id);
    removeHolding(id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
    if (!removed) return;
    const remainingForSymbol = holdings.filter((holding) => holding.id !== id && holding.symbol === removed.symbol);
    if (!remainingForSymbol.length) {
      getAlertsForSymbol(removed.symbol)
        .filter((alert) => alert.note.startsWith("Portfolio target"))
        .forEach((alert) => removeAlert(alert.id));
    }
  }, [holdings]);

  const handleAIRisk = useCallback(async () => {
    if (holdings.length === 0) return;
    setRiskLoading(true);
    setRiskError(null);
    try {
      const payload = await fetchPortfolioRiskAssessment(
        holdings.map((h) => ({
          symbol: h.symbol,
          quantity: h.quantity,
          buyPrice: h.buyPrice,
          currentPrice: h.currentPrice ?? undefined,
          sector: undefined,
          beta: undefined,
        }))
      );
      const analysis = payload.analysis as RiskAnalysis;
      setRiskAnalysis(analysis);
    } catch {
      setRiskError("AI analysis unavailable. Please try again.");
    } finally {
      setRiskLoading(false);
    }
  }, [holdings]);

  const handleEdit = useCallback((h: Holding) => {
    setEditTarget(h);
    setShowModal(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setShowModal(false);
    setEditTarget(null);
  }, []);

  const hasHoldings = holdings.length > 0;
  const isGain = summary.totalPnl >= 0;

  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioFaqJsonLd) }}
      />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">Home</Link> / Portfolio
          </p>
          <h1 className="mt-1 font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
            My Portfolio
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Holdings, P&amp;L, and allocation — stored in your browser
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 rounded-xl border border-accent/30 bg-bg px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/5"
          >
            <Sparkles className="h-4 w-4" />
            Bulk Import AI
          </button>
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Holding
          </button>
        </div>
      </div>

      <FeatureAuthWall
        title="Sign up to use Portfolio"
        description="Track holdings, P&L, allocation, and AI portfolio insights after signup."
        ctaLabel="Sign up to use portfolio"
        points={["Add and edit holdings", "Live P&L tracking", "Allocation and risk view", "AI portfolio helper"]}
      >
        {/* Loading shimmer */}
        {loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shimmer h-24 rounded-2xl border border-border/40" />
              ))}
            </div>
            <div className="shimmer h-48 rounded-2xl border border-border/40" />
          </div>
        )}

      {/* Empty state */}
      {!loading && !hasHoldings && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-panel/40 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <Wallet className="h-8 w-8 text-accent" />
          </div>
          <h3 className="text-lg font-semibold">No holdings yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Add your first holding to start tracking your portfolio performance in real time.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add First Holding
          </button>
        </div>
      )}

      {/* Portfolio content */}
      {!loading && hasHoldings && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="Invested"
              value={fmtINR(summary.totalInvested)}
              icon={Wallet}
            />
            <SummaryCard
              label="Current Value"
              value={fmtINR(summary.totalCurrentValue)}
              sub={`${summary.knownCount}/${holdings.length} priced`}
              icon={BarChart3}
            />
            <SummaryCard
              label="Total P&L"
              value={(isGain ? "+" : "") + fmtINR(summary.totalPnl)}
              sub={`${isGain ? "+" : ""}${summary.totalPnlPercent.toFixed(2)}% overall`}
              isPositive={isGain}
              icon={isGain ? TrendingUp : TrendingDown}
            />
            <SummaryCard
              label="Return"
              value={`${isGain ? "+" : ""}${summary.totalPnlPercent.toFixed(2)}%`}
              sub={`${isGain ? "+" : ""}${fmtINR(summary.totalPnl)} in rupees`}
              isPositive={isGain}
              icon={isGain ? ArrowUpRight : ArrowDownRight}
            />
          </div>

          <PortfolioSuggestionCard />

          {/* AI Portfolio Risk */}
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-r from-accent/5 via-purple-500/5 to-transparent p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="text-sm font-semibold">AI Portfolio Risk Analysis</p>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">Powered by Gemini</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Get a plain-English view of concentration, correlation, and diversification so you know where your portfolio is strong or exposed.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-lg border border-border/40 bg-bg/45 px-2 py-1 text-muted">
                    What it means: how risky your current basket is
                  </span>
                  <span className="rounded-lg border border-border/40 bg-bg/45 px-2 py-1 text-muted">
                    What to do: reduce concentration and spot weak positions
                  </span>
                  <span className="rounded-lg border border-border/40 bg-bg/45 px-2 py-1 text-muted">
                    <Target className="mr-1 inline h-3 w-3 text-accent" />
                    Target alerts are saved per holding
                  </span>
                </div>
              </div>
              <button
                onClick={handleAIRisk}
                disabled={riskLoading || holdings.length === 0}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
              >
                {riskLoading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                {riskLoading ? "Analysing..." : "Check Portfolio Risk"}
              </button>
            </div>

            {riskError && <p className="mt-2 text-xs text-danger">{riskError}</p>}

            {riskAnalysis && !riskLoading && (
              <div className="mt-4 space-y-3">
                {/* Risk badges */}
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted">Overall Risk</p>
                    <p className={`text-sm font-bold ${riskAnalysis.overallRisk === "Low" ? "text-success" : riskAnalysis.overallRisk === "High" ? "text-danger" : "text-amber-400"}`}>
                      {riskAnalysis.overallRisk}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted">Risk Score</p>
                    <p className="text-sm font-bold">{riskAnalysis.riskScore}/10</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted">Diversification</p>
                    <p className="text-sm font-bold text-accent">{riskAnalysis.diversificationScore}/10</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2 text-center">
                    <p className="text-[10px] text-muted">Concentration</p>
                    <p className="text-sm font-bold">{riskAnalysis.sectorConcentration}</p>
                  </div>
                </div>

                {/* Summary */}
                <p className="rounded-xl border border-border/40 bg-bg/40 px-3 py-2 text-xs text-muted leading-5">
                  {riskAnalysis.summary}
                </p>

                {/* Risks + Recommendations */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-danger flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Top Risks</p>
                    {riskAnalysis.topRisks.map((r, i) => (
                      <p key={i} className="text-xs text-muted pl-4">• {r}</p>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-success flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Recommendations</p>
                    {riskAnalysis.recommendations.map((r, i) => (
                      <p key={i} className="text-xs text-muted pl-4">• {r}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Portfolio Doctor */}
          <PortfolioDoctor />

          {/* Chart + Holdings */}
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <AllocationChart enriched={holdings} />

            <div className="space-y-3">
              {/* Holdings list header */}
              <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-3 px-4 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
                <span>Stock</span>
                <span>Qty</span>
                <span>Buy Cost</span>
                <span>Current</span>
                <span>P&L</span>
                <span className="w-16" />
              </div>
              {holdings.map((h) => (
                <HoldingRow
                  key={h.id}
                  h={h}
                  totalValue={summary.totalCurrentValue}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-center text-[11px] text-muted/60">
            Portfolio data is stored locally in your browser. Prices are fetched live and may be delayed.
            This is not investment advice.
          </p>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-[24px] border border-border/45 bg-panel/40 p-5 backdrop-blur-sm">
              <h2 className="font-[var(--font-space)] text-xl font-bold tracking-tight">
                Portfolio tracking for Indian investors
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                This page supports search intent around portfolio tracker India, stock holdings
                tracker, portfolio analysis, and stock return tracking. It combines live prices,
                allocation, price alerts, and AI portfolio commentary in one browser-based workflow.
              </p>
            </article>
            <article className="rounded-[24px] border border-border/45 bg-panel/40 p-5 backdrop-blur-sm">
              <h2 className="font-[var(--font-space)] text-xl font-bold tracking-tight">
                Why this portfolio workflow matters
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                Investors often search for a simple way to monitor current value, profit and loss,
                and risk concentration across holdings. This page focuses on those tasks without
                requiring a complex onboarding flow.
              </p>
            </article>
          </section>

          <FaqSection
            title="Portfolio Tracker FAQs"
            intro="These answers cover the main questions users search for when looking for a stock portfolio tracker in India."
            items={portfolioFaqs}
          />
        </>
      )}

      </FeatureAuthWall>

      {/* Modal */}
      {mounted && showModal && (
        <HoldingModal editing={editTarget} onClose={handleModalClose} onSave={loadPortfolio} />
      )}
      {mounted && showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} onSave={loadPortfolio} />
      )}
    </div>
  );
}
