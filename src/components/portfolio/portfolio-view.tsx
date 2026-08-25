"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api";
import { fmtInr, fmtPct, type Holding } from "@/lib/types";
import { useApp, usePolling } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockSearch } from "@/components/shared/stock-search";
import { SectionHeading, AiSourceBadge } from "@/components/shared/section-heading";
import { ChangePill } from "@/components/shared/change-pill";

// ── XIRR (money-weighted return) via bisection ───────────────────────────

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * Cash outflows of -quantity*buyPrice at each buy date (today when unknown),
 * plus the current market value as today's inflow. Solves NPV(r) = 0.
 * Returns the annualised rate, or null when it can't be solved.
 */
function computeXirr(holdings: Holding[], totalValue: number): number | null {
  if (holdings.length < 1 || totalValue <= 0) return null;
  const now = Date.now();
  const cashflows = holdings.map((h) => ({
    t: h.buyDate ? Math.max(0, (now - new Date(h.buyDate).getTime()) / MS_PER_YEAR) : 0,
    amount: -(h.quantity * h.buyPrice),
  }));
  cashflows.push({ t: 0, amount: totalValue });

  const npv = (r: number) => cashflows.reduce((acc, cf) => acc + cf.amount / (1 + r) ** cf.t, 0);

  let lo = -0.95;
  let hi = 5;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo * fHi > 0) {
    lo = -0.999;
    hi = 100;
    fLo = npv(lo);
    fHi = npv(hi);
    if (fLo * fHi > 0) return null;
  }
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 0.01) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// ── AI risk scan payload ─────────────────────────────────────────────────

interface RiskAnalysis {
  overallRisk: string;
  riskScore: number;
  diversificationScore: number;
  summary: string;
  topRisks: string[];
  recommendations: string[];
}

const PIE_PALETTE = [
  "#f59e0b", "#22c55e", "#eab308", "#ef4444", "#a855f7",
  "#14b8a6", "#f97316", "#84cc16", "#ec4899", "#94a3b8",
];

const EMPTY_ADD_FORM = {
  symbol: "",
  quantity: "",
  buyPrice: "",
  buyDate: "",
  targetPrice: "",
  notes: "",
};

interface EditForm {
  id: string;
  symbol: string;
  quantity: string;
  buyPrice: string;
  buyDate: string;
  targetPrice: string;
  notes: string;
}

export function PortfolioView() {
  const holdings = useApp((s) => s.holdings);
  const addHolding = useApp((s) => s.addHolding);
  const updateHolding = useApp((s) => s.updateHolding);
  const removeHolding = useApp((s) => s.removeHolding);
  const refreshLive = useApp((s) => s.refreshLive);
  const openStock = useApp((s) => s.openStock);

  usePolling(() => {
    void refreshLive();
  }, 20000);

  // ── add-holding dialog state ──
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);

  // ── edit-holding dialog state ──
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── AI risk scan state ──
  const [risk, setRisk] = useState<{ data: RiskAnalysis; source: "ai" | "fallback" } | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // ── computed summary ──
  const summary = useMemo(() => {
    const totalInvested = holdings.reduce((a, h) => a + h.invested, 0);
    const totalValue = holdings.reduce((a, h) => a + h.currentValue, 0);
    const totalPnl = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const xirr = computeXirr(holdings, totalValue);
    const best =
      holdings.length > 0
        ? holdings.reduce((a, h) => (h.pnlPercent > a.pnlPercent ? h : a))
        : null;
    const worst =
      holdings.length > 0
        ? holdings.reduce((a, h) => (h.pnlPercent < a.pnlPercent ? h : a))
        : null;
    return { totalInvested, totalValue, totalPnl, pnlPct, xirr, best, worst };
  }, [holdings]);

  const allocation = useMemo(
    () =>
      [...holdings]
        .sort((a, b) => b.currentValue - a.currentValue)
        .map((h, i) => ({
          symbol: h.symbol,
          value: h.currentValue,
          weight: summary.totalValue > 0 ? h.currentValue / summary.totalValue : 0,
          fill: PIE_PALETTE[i % PIE_PALETTE.length],
        })),
    [holdings, summary.totalValue]
  );

  // ── actions ──
  const submitAdd = async () => {
    const quantity = Number(addForm.quantity);
    const buyPrice = Number(addForm.buyPrice);
    if (!addForm.symbol) {
      toast.error("Pick a stock first");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      toast.error("Buy price must be greater than ₹0");
      return;
    }
    setAddSaving(true);
    try {
      await addHolding({
        symbol: addForm.symbol,
        quantity,
        buyPrice,
        buyDate: addForm.buyDate || undefined,
        targetPrice: addForm.targetPrice ? Number(addForm.targetPrice) : undefined,
        notes: addForm.notes.trim() || undefined,
      });
      toast.success(`Added ${addForm.symbol} to your portfolio`);
      setAddOpen(false);
      setAddForm(EMPTY_ADD_FORM);
      setRisk(null);
    } catch {
      toast.error("Could not add the holding — please try again");
    } finally {
      setAddSaving(false);
    }
  };

  const openEdit = (h: Holding) => {
    setEditForm({
      id: h.id,
      symbol: h.symbol,
      quantity: String(h.quantity),
      buyPrice: String(h.buyPrice),
      buyDate: toDateInput(h.buyDate),
      targetPrice: h.targetPrice != null ? String(h.targetPrice) : "",
      notes: h.notes ?? "",
    });
  };

  const submitEdit = async () => {
    if (!editForm) return;
    const quantity = Number(editForm.quantity);
    const buyPrice = Number(editForm.buyPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      toast.error("Buy price must be greater than ₹0");
      return;
    }
    setEditSaving(true);
    try {
      await updateHolding(editForm.id, {
        quantity,
        buyPrice,
        buyDate: editForm.buyDate || undefined,
        targetPrice: editForm.targetPrice ? Number(editForm.targetPrice) : null,
        notes: editForm.notes.trim() || undefined,
      });
      toast.success(`Updated ${editForm.symbol} position`);
      setEditForm(null);
      setRisk(null);
    } catch {
      toast.error("Could not update the holding");
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemove = async (h: Holding) => {
    await removeHolding(h.id);
    toast.success(`Removed ${h.symbol} from your portfolio`);
  };

  const runRiskScan = async () => {
    if (holdings.length === 0 || riskLoading) return;
    setRiskLoading(true);
    try {
      const res = await apiPost<{ analysis: string; source: "ai" | "fallback" }>(
        "/api/ai/analysis",
        {
          type: "portfolio-risk",
          holdings: holdings.map((h) => ({
            symbol: h.symbol,
            name: h.companyName,
            quantity: h.quantity,
            buyPrice: h.buyPrice,
            currentPrice: h.currentPrice,
            invested: h.invested,
            currentValue: h.currentValue,
            weight: h.currentValue / (summary.totalValue || 1),
          })),
        }
      );
      try {
        const parsed = JSON.parse(res.analysis) as RiskAnalysis;
        setRisk({ data: parsed, source: res.source });
      } catch {
        toast.error("Could not read the risk analysis — please try again");
      }
    } catch {
      toast.error("Risk scan failed — please try again");
    } finally {
      setRiskLoading(false);
    }
  };

  const riskBadgeClass =
    risk?.data.overallRisk === "Low"
      ? "border-success/40 bg-success/10 text-success"
      : risk?.data.overallRisk === "Medium"
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-danger/40 bg-danger/10 text-danger";

  return (
    <section aria-label="Portfolio" className="space-y-4">
      <SectionHeading
        icon={Briefcase}
        kicker="Your positions"
        title="My Portfolio"
        right={
          <Button onClick={() => setAddOpen(true)} className="shine-btn bg-brand text-white hover:bg-brand/90">
            <Plus className="h-4 w-4" aria-hidden />
            Add Holding
          </Button>
        }
      />

      {holdings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-bold text-text">No holdings yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Add your first position to unlock P&amp;L tracking, XIRR and AI risk scans.
          </p>
          <Button onClick={() => setAddOpen(true)} className="shine-btn mt-5 bg-brand text-white hover:bg-brand/90">
            <Plus className="h-4 w-4" aria-hidden />
            Add Holding
          </Button>
        </div>
      ) : (
        <>
          {/* ── summary cards ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invested</p>
              <p className="mt-1.5 font-display text-lg font-bold tabular-nums text-text">
                ₹{summary.totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current Value</p>
              <p className="mt-1.5 font-display text-lg font-bold tabular-nums text-text">
                {fmtInr(summary.totalValue)}
              </p>
            </div>
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Unrealised P&amp;L</p>
              <p
                className={cn(
                  "mt-1.5 font-display text-lg font-bold tabular-nums",
                  summary.totalPnl > 0 ? "text-success" : summary.totalPnl < 0 ? "text-danger" : "text-text"
                )}
              >
                {fmtInr(summary.totalPnl)}
              </p>
              <p
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  summary.totalPnl > 0 ? "text-success" : summary.totalPnl < 0 ? "text-danger" : "text-muted-foreground"
                )}
              >
                {fmtPct(summary.pnlPct)}
              </p>
            </div>
            <div className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4" title="Money-weighted return">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">XIRR</p>
              <p
                className={cn(
                  "mt-1.5 font-display text-lg font-bold tabular-nums",
                  summary.xirr == null
                    ? "text-muted-foreground"
                    : summary.xirr > 0
                      ? "text-success"
                      : summary.xirr < 0
                        ? "text-danger"
                        : "text-text"
                )}
              >
                {summary.xirr == null ? "—" : fmtPct(summary.xirr * 100, 1)}
              </p>
              <p className="text-[10px] text-muted-foreground">Money-weighted return</p>
            </div>
            <div className="stat-card col-span-2 rounded-2xl border border-border/50 bg-panel/60 p-4 lg:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Holdings</p>
              <p className="mt-1.5 font-display text-lg font-bold tabular-nums text-text">{holdings.length}</p>
              {summary.best && (
                <p className="truncate text-xs text-muted-foreground" title={`Best: ${summary.best.symbol}`}>
                  Best:{" "}
                  <span className="font-semibold tabular-nums text-success">
                    {summary.best.symbol} {fmtPct(summary.best.pnlPercent, 1)}
                  </span>
                </p>
              )}
              {summary.worst && summary.worst.symbol !== summary.best?.symbol && (
                <p className="truncate text-xs text-muted-foreground" title={`Worst: ${summary.worst.symbol}`}>
                  Worst:{" "}
                  <span className="font-semibold tabular-nums text-danger">
                    {summary.worst.symbol} {fmtPct(summary.worst.pnlPercent, 1)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* ── AI risk scan ── */}
          <div className="rounded-2xl border border-border/50 bg-panel/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-brand" aria-hidden />
                <h3 className="font-display text-sm font-bold text-text">AI Risk Scan</h3>
                {risk && <AiSourceBadge source={risk.source} />}
              </div>
              {holdings.length > 0 && (
                <Button
                  onClick={() => void runRiskScan()}
                  disabled={riskLoading}
                  variant="outline"
                  size="sm"
                  className="border-brand/40 text-brand hover:bg-brand/10 hover:text-brand"
                >
                  {riskLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {riskLoading ? "Scanning…" : "Run AI Risk Scan"}
                </Button>
              )}
            </div>

            {riskLoading ? (
              <div className="space-y-2.5" aria-live="polite" aria-busy="true">
                <Skeleton className="shimmer h-4 w-1/2" />
                <Skeleton className="shimmer h-4 w-5/6" />
                <Skeleton className="shimmer h-4 w-2/3" />
              </div>
            ) : risk ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", riskBadgeClass)}>
                    {risk.data.overallRisk} risk
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Risk score {Number(risk.data.riskScore).toFixed(1)}/10 · Diversification{" "}
                    {Number(risk.data.diversificationScore).toFixed(1)}/10
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Portfolio risk
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-600"
                        style={{
                          width: `${Math.min(100, Math.max(0, (Number(risk.data.riskScore) / 10) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Diversification
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-600 to-emerald-400"
                        style={{
                          width: `${Math.min(100, Math.max(0, (Number(risk.data.diversificationScore) / 10) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-6 text-text/90">{risk.data.summary}</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Top risks
                    </p>
                    <ul className="space-y-1.5">
                      {(risk.data.topRisks ?? []).map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-text/90">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Recommendations
                    </p>
                    <ul className="space-y-1.5">
                      {(risk.data.recommendations ?? []).map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-text/90">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                Scan your book for concentration, correlation and sizing risks — scored 0–10 with actionable fixes.
              </p>
            )}
          </div>

          {/* ── allocation pie ── */}
          <div className="rounded-2xl border border-border/50 bg-panel/60 p-4">
            <h3 className="mb-3 font-display text-sm font-bold text-text">Allocation</h3>
            <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr]">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={allocation}
                      dataKey="value"
                      nameKey="symbol"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {allocation.map((a) => (
                        <Cell key={a.symbol} fill={a.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => fmtInr(typeof v === "number" ? v : Number(v))}
                      contentStyle={{
                        background: "rgba(24, 24, 27, 0.95)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 12,
                        color: "#fafafa",
                        fontSize: 12,
                      }}
                      itemStyle={{ color: "#fafafa" }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5" aria-label="Allocation by stock">
                {allocation.map((a) => (
                  <li key={a.symbol} className="flex items-center gap-2 text-xs sm:text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.fill }} aria-hidden />
                    <button
                      onClick={() => openStock(a.symbol)}
                      className="min-w-14 text-left font-semibold text-text transition hover:text-brand"
                    >
                      {a.symbol}
                    </button>
                    <span className="tabular-nums text-muted-foreground">{fmtPct(a.weight * 100, 1)}</span>
                    <span className="ml-auto tabular-nums text-text/90">{fmtInr(a.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── holdings table ── */}
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-panel/60">
            <Table className="text-xs sm:text-sm">
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Stock</TableHead>
                  <TableHead className="text-right text-muted-foreground">Qty</TableHead>
                  <TableHead className="text-right text-muted-foreground">Buy Price</TableHead>
                  <TableHead className="text-muted-foreground">Buy Date</TableHead>
                  <TableHead className="text-right text-muted-foreground">Current</TableHead>
                  <TableHead className="text-right text-muted-foreground">Value</TableHead>
                  <TableHead className="text-right text-muted-foreground">P&amp;L</TableHead>
                  <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((h) => (
                  <TableRow key={h.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openStock(h.symbol)}
                          className="font-display font-bold text-text transition hover:text-brand"
                        >
                          {h.symbol}
                        </button>
                        {h.notes && (
                          <span title={h.notes} className="inline-flex">
                            <StickyNote className="h-3 w-3 text-muted-foreground" aria-hidden />
                          </span>
                        )}
                      </div>
                      <p className="max-w-[180px] truncate text-[10px] text-muted-foreground" title={h.companyName}>
                        {h.companyName}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.quantity.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInr(h.buyPrice)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(h.buyDate)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end">
                        <span className="font-semibold tabular-nums">{fmtInr(h.currentPrice)}</span>
                        <ChangePill size="xs" value={h.changePercent} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtInr(h.currentValue)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end">
                        <span className={cn("font-semibold tabular-nums", h.pnl >= 0 ? "text-success" : "text-danger")}>
                          {fmtInr(h.pnl)}
                        </span>
                        <span className={cn("text-[10px] tabular-nums", h.pnlPercent >= 0 ? "text-success" : "text-danger")}>
                          {fmtPct(h.pnlPercent)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(h)}
                          aria-label={`Edit ${h.symbol} position`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-danger"
                          onClick={() => void handleRemove(h)}
                          aria-label={`Remove ${h.symbol} position`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── add holding dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Add Holding</DialogTitle>
            <DialogDescription>
              Record a buy to track live P&amp;L, XIRR and AI risk insights.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">Stock</Label>
              {addForm.symbol ? (
                <button
                  onClick={() => setAddForm((f) => ({ ...f, symbol: "" }))}
                  className="flex h-11 items-center justify-between rounded-2xl border border-brand/40 bg-brand/10 px-4 text-sm font-semibold text-brand transition hover:bg-brand/15"
                  aria-label={`Selected ${addForm.symbol}, click to change`}
                >
                  {addForm.symbol}
                  <Plus className="h-3.5 w-3.5 rotate-45" aria-hidden />
                </button>
              ) : (
                <StockSearch
                  placeholder="Search a stock to add…"
                  onSelect={(s) => setAddForm((f) => ({ ...f, symbol: s.toUpperCase() }))}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="add-quantity" className="text-xs">
                  Quantity
                </Label>
                <Input
                  id="add-quantity"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="100"
                  value={addForm.quantity}
                  onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-price" className="text-xs">
                  Buy price (₹)
                </Label>
                <Input
                  id="add-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="2450.50"
                  value={addForm.buyPrice}
                  onChange={(e) => setAddForm((f) => ({ ...f, buyPrice: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="add-date" className="text-xs">
                  Buy date <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="add-date"
                  type="date"
                  value={addForm.buyDate}
                  onChange={(e) => setAddForm((f) => ({ ...f, buyDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-target" className="text-xs">
                  Target price (₹) <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="add-target"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="3000"
                  value={addForm.targetPrice}
                  onChange={(e) => setAddForm((f) => ({ ...f, targetPrice: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="add-notes" className="text-xs">
                Notes <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="add-notes"
                placeholder="Thesis, stop-loss, anything worth remembering…"
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitAdd()} disabled={addSaving} className="bg-brand text-white hover:bg-brand/90">
              {addSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save Holding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── edit holding dialog ── */}
      <Dialog open={editForm != null} onOpenChange={(open) => !open && setEditForm(null)}>
        {editForm && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Edit {editForm.symbol} Position</DialogTitle>
              <DialogDescription>Update quantity, cost basis, target or notes.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-quantity" className="text-xs">
                    Quantity
                  </Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, quantity: e.target.value } : f))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-price" className="text-xs">
                    Buy price (₹)
                  </Label>
                  <Input
                    id="edit-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={editForm.buyPrice}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, buyPrice: e.target.value } : f))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-date" className="text-xs">
                    Buy date
                  </Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editForm.buyDate}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, buyDate: e.target.value } : f))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-target" className="text-xs">
                    Target price (₹)
                  </Label>
                  <Input
                    id="edit-target"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="—"
                    value={editForm.targetPrice}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, targetPrice: e.target.value } : f))}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="edit-notes" className="text-xs">
                  Notes
                </Label>
                <Textarea
                  id="edit-notes"
                  placeholder="Thesis, stop-loss, anything worth remembering…"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, notes: e.target.value } : f))}
                  className="min-h-16"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditForm(null)}>
                Cancel
              </Button>
              <Button onClick={() => void submitEdit()} disabled={editSaving} className="bg-brand text-white hover:bg-brand/90">
                {editSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
