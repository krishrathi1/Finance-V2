"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MarketStatusBadge } from "@/components/market-status-badge";
import { fetchIpoAiAnalysis, fetchIpoData } from "@/lib/api";
import type { IpoAiAnalysis, IpoItem } from "@/lib/api";

type Tab = "upcoming" | "recent";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d; }
}

function formatMarketCap(mc: number | null) {
  if (!mc) return "—";
  if (mc >= 1e11) return `₹${(mc / 1e7).toFixed(0)} Cr`;
  if (mc >= 1e7)  return `₹${(mc / 1e7).toFixed(2)} Cr`;
  return `₹${mc.toLocaleString("en-IN")}`;
}

function formatShares(s: number | null) {
  if (!s) return "—";
  if (s >= 1e7) return `${(s / 1e7).toFixed(2)} Cr`;
  if (s >= 1e5) return `${(s / 1e5).toFixed(2)} L`;
  return s.toLocaleString("en-IN");
}

function daysUntil(dateStr: string): number | null {
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

function getIpoRiskProfile(ipo: IpoItem, tab: Tab) {
  let score = 0;

  if (!ipo.marketCap || ipo.marketCap < 5e9) score += 1;
  if (!ipo.priceRange) score += 0.5;
  if (tab === "recent" && Math.abs(ipo.changePercent ?? 0) >= 10) score += 1;
  if (tab === "recent" && Math.abs(ipo.changePercent ?? 0) >= 20) score += 1;
  if (tab === "upcoming" && ipo.status !== "Active") score += 0.5;
  if ((ipo.shares ?? 0) >= 1e7) score -= 0.5;

  if (score >= 2.5) {
    return {
      label: "High Risk",
      className: "border-danger/30 bg-danger/10 text-danger",
    };
  }
  if (score >= 1) {
    return {
      label: "Medium Risk",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    };
  }
  return {
    label: "Low Risk",
    className: "border-success/30 bg-success/10 text-success",
  };
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  Subscribe: { bg: "bg-success/10", text: "text-success", border: "border-success/30", icon: CheckCircle2 },
  Avoid:     { bg: "bg-danger/10",  text: "text-danger",  border: "border-danger/30",  icon: XCircle },
  Neutral:   { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", icon: Shield },
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return <div className="shimmer h-56 rounded-2xl border border-border/40" />;
}

// ─── IPO Detail Modal ────────────────────────────────────────────────────────

type ModalProps = { ipo: IpoItem; tab: Tab; onClose: () => void };

function IpoModal({ ipo, tab, onClose }: ModalProps) {
  const symbol = ipo.symbol?.replace(/\.(NS|BO)$/i, "");
  const [analysis, setAnalysis] = useState<IpoAiAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const days = daysUntil(ipo.date);
  const riskProfile = getIpoRiskProfile(ipo, tab);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", down);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", down);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleAI = async () => {
    if (!symbol) return;
    setAiLoading(true);
    setAiError(false);
    try {
      const res = await fetchIpoAiAnalysis(symbol);
      setAnalysis(res);
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const verdictStyle = analysis ? (VERDICT_STYLES[analysis.verdict] ?? VERDICT_STYLES.Neutral) : null;
  const VerdictIcon = verdictStyle?.icon;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[300] flex items-end justify-center bg-bg/70 p-0 backdrop-blur-md sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex w-full max-w-2xl max-h-[92dvh] flex-col rounded-t-3xl rounded-b-none border border-border/60 bg-panel shadow-2xl sm:rounded-3xl overflow-hidden">

        {/* Modal header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-amber-400/10 text-sm font-black text-accent">
              {(ipo.company || symbol || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-[var(--font-space)] text-base font-bold leading-snug">
                {ipo.company || symbol || "Unknown Company"}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                {symbol && <span className="text-xs font-medium text-muted">{symbol}</span>}
                {ipo.exchange && (
                  <span className="rounded-md border border-border/50 bg-bg/60 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {ipo.exchange}
                  </span>
                )}
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${riskProfile.className}`}>
                  {riskProfile.label}
                </span>
                {ipo.actions && (
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    {ipo.actions}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-xl border border-border/50 p-2 text-muted transition hover:bg-bg/60 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Key info grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: CalendarDays, label: tab === "upcoming" ? "Listing Date" : "Listed On", value: formatDate(ipo.date) },
              { icon: CircleDollarSign, label: "Price Range", value: ipo.priceRange || "—" },
              { icon: Layers, label: "Issue Size", value: formatMarketCap(ipo.marketCap) },
              { icon: BarChart3, label: "Total Shares", value: formatShares(ipo.shares) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-border/50 bg-bg/50 px-3 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3.5 w-3.5 text-muted" />
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
                </div>
                <p className="text-sm font-bold">{value}</p>
              </div>
            ))}
          </div>

          {/* Upcoming — extra NSE dates */}
          {tab === "upcoming" && (ipo.issueStartDate || ipo.issueEndDate || ipo.status) && (
            <div className="grid grid-cols-3 gap-3">
              {ipo.issueStartDate && (
                <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Issue Opens</p>
                  <p className="text-xs font-bold">{ipo.issueStartDate}</p>
                </div>
              )}
              {ipo.issueEndDate && (
                <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Issue Closes</p>
                  <p className="text-xs font-bold">{ipo.issueEndDate}</p>
                </div>
              )}
              {ipo.status && (
                <div className={`rounded-xl border px-3 py-2.5 text-center ${ipo.status === "Active" ? "border-success/30 bg-success/8" : "border-border/50 bg-bg/50"}`}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Status</p>
                  <p className={`text-xs font-bold ${ipo.status === "Active" ? "text-success" : "text-text"}`}>{ipo.status}</p>
                </div>
              )}
            </div>
          )}

          {/* Days badge for upcoming */}
          {tab === "upcoming" && days !== null && days >= 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/8 px-4 py-3">
              <CalendarRange className="h-4 w-4 text-accent shrink-0" />
              <p className="text-sm font-semibold text-accent">
                {days === 0 ? "Issue closes today!" : days === 1 ? "Issue closes tomorrow" : `Issue closes in ${days} days`}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div
              title="Grey Market Premium is the unofficial premium traders quote before listing. It hints at expected listing gain, but it is not guaranteed."
              className="rounded-2xl border border-border/40 bg-bg/40 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-accent" />
                <p className="text-xs font-semibold text-text">What is GMP?</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                Grey Market Premium = unofficial expected listing gain. Useful as a sentiment check, not as a guarantee.
              </p>
            </div>
            <div
              title="Subscription rate shows how many times investors applied for the shares on offer. Higher demand can support listing sentiment, but valuation still matters."
              className="rounded-2xl border border-border/40 bg-bg/40 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-accent" />
                <p className="text-xs font-semibold text-text">What is Subscription Rate?</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                Subscription rate = demand divided by shares offered. Higher demand can be positive, but price and quality still matter.
              </p>
            </div>
          </div>

          {/* Recent — live price info */}
          {tab === "recent" && ipo.currentPrice && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2.5 text-center">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Current Price</p>
                <p className="text-xs font-bold">₹{ipo.currentPrice}</p>
              </div>
              {ipo.prevClose && (
                <div className="rounded-xl border border-border/50 bg-bg/50 px-3 py-2.5 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Prev Close</p>
                  <p className="text-xs font-bold">₹{ipo.prevClose}</p>
                </div>
              )}
              {ipo.changePercent !== undefined && (
                <div className={`rounded-xl border px-3 py-2.5 text-center ${ipo.changePercent >= 0 ? "border-success/30 bg-success/8" : "border-danger/30 bg-danger/8"}`}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">Today</p>
                  <p className={`text-xs font-bold ${ipo.changePercent >= 0 ? "text-success" : "text-danger"}`}>
                    {ipo.changePercent >= 0 ? "+" : ""}{ipo.changePercent?.toFixed(2)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Links row */}
          <div className="flex flex-wrap gap-2">
            {symbol && (
              <Link
                href={`/stocks/${symbol}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Stock Page
              </Link>
            )}
            <a
              href={`https://www.chittorgarh.com/search/${encodeURIComponent(ipo.company || symbol || "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-bg/50 px-3 py-2 text-xs font-medium text-muted transition hover:border-accent/30 hover:text-accent"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              IPO Details
            </a>
            <a
              href={`https://www.sebi.gov.in/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-bg/50 px-3 py-2 text-xs font-medium text-muted transition hover:border-accent/30 hover:text-accent"
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              SEBI Filing
            </a>
          </div>

          {/* ── AI Analysis ── */}
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/6 via-purple-500/4 to-transparent p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <p className="text-sm font-semibold">AI IPO Analysis</p>
                <span className="rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                  Gemini
                </span>
              </div>
              {!analysis && (
                <button
                  onClick={handleAI}
                  disabled={aiLoading}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {aiLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Analysing...</>
                    : <><Sparkles className="h-4 w-4" />Run AI IPO Analysis</>}
                </button>
              )}
              {analysis && (
                <button
                  onClick={handleAI}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-bg/50 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/30 hover:text-accent disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              )}
            </div>

            {!analysis && !aiLoading && !aiError && (
              <p className="mt-2 text-xs text-muted">
                Get Gemini AI's instant verdict on valuation, risks, listing outlook, and who should apply.
              </p>
            )}

            {aiError && (
              <p className="mt-2 text-xs text-danger">AI analysis failed. Please try again.</p>
            )}

            {aiLoading && !analysis && (
              <div className="mt-4 space-y-2">
                {[80, 60, 90, 70].map((w, i) => (
                  <div key={i} className="h-3 rounded-full bg-border/40 shimmer" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}

            {analysis && verdictStyle && VerdictIcon && (
              <div className="mt-4 space-y-4">
                {/* Verdict badge + quick take */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className={`inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 ${verdictStyle.bg} ${verdictStyle.border}`}>
                    <VerdictIcon className={`h-4 w-4 ${verdictStyle.text}`} />
                    <span className={`text-base font-black ${verdictStyle.text}`}>{analysis.verdict}</span>
                  </div>
                  <p className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold leading-relaxed ${verdictStyle.bg} ${verdictStyle.border} ${verdictStyle.text}`}>
                    {analysis.quickTake}
                  </p>
                </div>

                {/* Summary */}
                <p className="rounded-xl border border-border/40 bg-bg/40 px-4 py-3 text-sm leading-6 text-muted">
                  {analysis.summary}
                </p>

                {/* Strengths + Risks */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-success" />
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-success">Key Strengths</p>
                    </div>
                    <ul className="space-y-1.5">
                      {analysis.keyStrengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success/70" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-danger/20 bg-danger/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-danger" />
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-danger">Key Risks</p>
                    </div>
                    <ul className="space-y-1.5">
                      {analysis.keyRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger/70" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Valuation + Who should apply */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/40 bg-bg/40 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Valuation Take</p>
                    <p className="text-xs leading-5 text-text">{analysis.valuation}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-bg/40 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Who Should Apply</p>
                    <p className="text-xs leading-5 text-text">{analysis.whoShouldApply}</p>
                  </div>
                </div>

                {/* Listing outlook */}
                <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-bg/40 px-4 py-2.5">
                  <BarChart3 className="h-4 w-4 text-accent shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Listing Outlook</p>
                    <p className="mt-0.5 text-sm font-semibold capitalize text-text">{analysis.listingOutlook}</p>
                  </div>
                </div>

                <p className="text-[10px] text-muted/60 text-center">
                  AI analysis is for informational purposes only. Not investment advice. DYOR.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── IPO Card ────────────────────────────────────────────────────────────────

function IpoCard({ ipo, tab, onClick }: { ipo: IpoItem; tab: Tab; onClick: () => void }) {
  const symbol = ipo.symbol?.replace(/\.(NS|BO)$/i, "");
  const days = tab === "upcoming" ? daysUntil(ipo.date) : null;
  const initials = (ipo.company || symbol || "?").slice(0, 2).toUpperCase();
  const riskProfile = getIpoRiskProfile(ipo, tab);

  return (
    <button
      onClick={onClick}
      className="glow-card group relative flex w-full flex-col rounded-2xl border border-border/50 bg-panel/60 p-5 text-left backdrop-blur-sm transition hover:border-accent/35 active:scale-[0.99]"
    >
      {/* top accent line */}
      <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-accent/60 via-purple-500/30 to-transparent" />

      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-amber-400/10 text-xs font-black text-accent">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-snug group-hover:text-accent transition">
              {ipo.company || symbol || "Unknown"}
            </p>
            {symbol && <p className="text-[11px] text-muted">{symbol}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {ipo.exchange && (
            <span className="rounded-lg border border-border/50 bg-bg/60 px-2 py-0.5 text-[10px] font-medium text-muted">
              {ipo.exchange}
            </span>
          )}
          <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${riskProfile.className}`}>
            {riskProfile.label}
          </span>
          {days !== null && days >= 0 && days <= 7 && (
            <span className="rounded-lg bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              {days === 0 ? "Today" : `${days}d left`}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CalendarDays className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              {tab === "upcoming" ? "Listing" : "Listed"}
            </p>
          </div>
          <p className="text-xs font-semibold">{formatDate(ipo.date)}</p>
        </div>
        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CircleDollarSign className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Price</p>
          </div>
          <p className="text-xs font-semibold">{ipo.priceRange || "—"}</p>
        </div>
        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Layers className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Issue Size</p>
          </div>
          <p className="text-xs font-semibold">{formatMarketCap(ipo.marketCap)}</p>
        </div>
        <div className="rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <BarChart3 className="h-3 w-3 text-muted" />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Shares</p>
          </div>
          <p className="text-xs font-semibold">{formatShares(ipo.shares)}</p>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent/70" />
          <span className="text-[11px] font-medium text-muted">AI verdict + risk view available</span>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition group-hover:translate-x-0.5 group-hover:bg-accent/15">
          View AI Analysis
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
        <Building2 className="h-8 w-8 text-accent" />
      </div>
      <h3 className="text-lg font-semibold">No {tab === "upcoming" ? "Upcoming" : "Recent"} IPOs</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">
        {tab === "upcoming"
          ? "No IPOs scheduled in the next 3 months."
          : "No IPOs listed in the past 3 months."}
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IpoPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [data, setData] = useState<IpoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IpoItem | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async (t: Tab, force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const rows = await fetchIpoData(t, { force });
      setData(rows);
    } catch {
      setError("Unable to load IPO data. Please try again.");
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  useEffect(() => {
    const refresh = () => {
      void load(tab, true);
    };

    const intervalId = window.setInterval(refresh, 30_000);
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
  }, [tab, load]);

  const stats = useMemo(() => ({
    total: data.length,
    withPrice: data.filter((d) => d.priceRange).length,
  }), [data]);

  return (
    <div className="stagger-fade space-y-6 py-4 sm:space-y-8 sm:py-8">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarRange className="h-4 w-4 text-accent" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Equity Events</p>
            <MarketStatusBadge compact />
          </div>
          <h1 className="font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
            IPO Calendar
          </h1>
          <p className="mt-1 text-sm text-muted">
            Upcoming listings and recent issues on NSE &amp; BSE — click any card for full details and AI verdict.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!loading && data.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-panel/60 px-4 py-2.5">
              <div className="text-center">
                <p className="text-base font-black text-accent">{stats.total}</p>
                <p className="text-[10px] text-muted">Total</p>
              </div>
              <div className="h-6 w-px bg-border/60" />
              <div className="text-center">
                <p className="text-base font-black text-success">{stats.withPrice}</p>
                <p className="text-[10px] text-muted">Priced</p>
              </div>
            </div>
          )}
          <button
            onClick={() => load(tab, true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-panel/60 px-3 py-2.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border/30">
        <div className="flex gap-6">
          {(["upcoming", "recent"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium transition border-b-2 ${
                tab === t
                  ? "border-accent text-accent font-semibold"
                  : "text-muted hover:text-text border-transparent"
              }`}
            >
              {t === "upcoming" ? "Upcoming IPOs" : "Recently Listed"}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)
          : data.length === 0
          ? <EmptyState tab={tab} />
          : data.map((ipo, idx) => (
              <IpoCard
                key={`${ipo.symbol}-${ipo.date}-${idx}`}
                ipo={ipo}
                tab={tab}
                onClick={() => setSelected(ipo)}
              />
            ))
        }
      </div>

      <p className="text-center text-[11px] text-muted/60">
        IPO data sourced from FMP. Refreshes every 30 minutes. AI analysis is for informational purposes only — not investment advice.
      </p>

      {/* Modal */}
      {mounted && selected && (
        <IpoModal ipo={selected} tab={tab} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
