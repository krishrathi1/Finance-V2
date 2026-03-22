"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  Edit2,
  Minus,
  Plus,
  ShieldAlert,
  Sparkles,
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
import { PortfolioDoctor } from "@/components/sections/portfolio-doctor";
import { fetchTickerTape, fetchPortfolioRiskAssessment } from "@/lib/api";
import {
  addHolding,
  enrichHoldings,
  getHoldings,
  portfolioSummary,
  removeHolding,
  updateHolding,
} from "@/lib/portfolio";
import type { Holding, HoldingWithValue } from "@/lib/portfolio";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtINR(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${fmt(n)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
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

function HoldingModal({ editing, onClose, onSave }: ModalProps) {
  const [symbol, setSymbol] = useState(editing?.symbol ?? "");
  const [companyName, setCompanyName] = useState(editing?.companyName ?? "");
  const [quantity, setQuantity] = useState(editing?.quantity ? String(editing.quantity) : "");
  const [buyPrice, setBuyPrice] = useState(editing?.buyPrice ? String(editing.buyPrice) : "");
  const [buyDate, setBuyDate] = useState(editing?.buyDate ?? today());
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState("");
  const symbolRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => symbolRef.current?.focus(), 50);
  }, []);

  const handleSave = useCallback(() => {
    const sym = symbol.trim().toUpperCase();
    const qty = parseFloat(quantity);
    const price = parseFloat(buyPrice);
    if (!sym) return setError("Symbol is required");
    if (!qty || qty <= 0) return setError("Enter a valid quantity");
    if (!price || price <= 0) return setError("Enter a valid buy price");
    setError("");

    if (editing) {
      updateHolding(editing.id, {
        symbol: sym,
        companyName: companyName.trim() || sym,
        quantity: qty,
        buyPrice: price,
        buyDate,
        notes: notes.trim() || undefined,
      });
    } else {
      addHolding(sym, companyName.trim() || sym, qty, price, buyDate, notes.trim() || undefined);
    }
    onSave();
    onClose();
  }, [symbol, companyName, quantity, buyPrice, buyDate, notes, editing, onSave, onClose]);

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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Symbol *</p>
              <input
                ref={symbolRef}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. RELIANCE"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm uppercase outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Company Name</p>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-border/60 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>
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
        <p className="text-xs text-muted">Avg Cost</p>
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
          <p className={`text-sm font-semibold ${isPos ? "text-success" : "text-danger"}`}>
            {isPos ? "+" : ""}₹{fmt(h.pnl)}
            <span className="ml-1 text-xs opacity-80">
              ({isPos ? "+" : ""}{h.pnlPercent?.toFixed(1)}%)
            </span>
          </p>
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
  const [holdings, setHoldings] = useState<HoldingWithValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const loadPortfolio = useCallback(async () => {
    const raw = getHoldings();
    if (raw.length === 0) {
      setHoldings([]);
      setLoading(false);
      return;
    }
    const symbols = [...new Set(raw.map((h) => h.symbol))];
    let priceMap: Record<string, number> = {};
    try {
      const tickers = await fetchTickerTape(symbols);
      for (const t of tickers) priceMap[t.symbol.toUpperCase()] = t.cmp;
    } catch {
      // prices stay null
    }
    setHoldings(enrichHoldings(raw, priceMap));
    setLoading(false);
  }, []);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);

  const handleRemove = useCallback((id: string) => {
    removeHolding(id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }, []);

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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            <Link href="/" className="hover:text-text">Home</Link> / Portfolio
          </p>
          <h1 className="mt-1 font-[var(--font-space)] text-2xl font-bold sm:text-3xl">
            <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
              My Portfolio
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Track holdings, monitor P&amp;L, and analyse your allocation — stored locally
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true); }}
          className="flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          Add Holding
        </button>
      </div>

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
              isPositive={isGain}
              icon={isGain ? TrendingUp : TrendingDown}
            />
            <SummaryCard
              label="Return"
              value={`${isGain ? "+" : ""}${summary.totalPnlPercent.toFixed(2)}%`}
              isPositive={isGain}
              icon={isGain ? ArrowUpRight : ArrowDownRight}
            />
          </div>

          {/* AI Portfolio Risk */}
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-r from-accent/5 via-purple-500/5 to-transparent p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="text-sm font-semibold">AI Portfolio Risk Analysis</p>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">Powered by Gemini</span>
                </div>
                <p className="mt-1 text-xs text-muted">Get AI insights on concentration, correlation, and diversification of your portfolio.</p>
              </div>
              <button
                onClick={handleAIRisk}
                disabled={riskLoading || holdings.length === 0}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-purple-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
              >
                {riskLoading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                {riskLoading ? "Analysing…" : "Analyse Portfolio"}
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
                <span>Avg Cost</span>
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
        </>
      )}

      {/* Modal */}
      {mounted && showModal && (
        <HoldingModal editing={editTarget} onClose={handleModalClose} onSave={loadPortfolio} />
      )}
    </div>
  );
}
