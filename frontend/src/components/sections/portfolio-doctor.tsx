"use client";

import {
  AlertTriangle,
  CheckCircle,
  FileUp,
  Flame,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchPortfolioRoast } from "@/lib/api";

// ─── CSV parsing ──────────────────────────────────────────────────────────────

type ParsedHolding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentValue: number;
  pnl: number;
};

/**
 * RFC-4180-ish single-line CSV split: honors "quoted, fields" (embedded
 * commas) and "" escaped quotes. Doesn't handle a quoted field spanning
 * multiple physical lines (embedded newlines) — broker holdings exports
 * (ticker/qty/price columns) don't have free-text fields that would need it.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** Parses a number that may use Indian-style thousands separators ("1,23,456"). */
function parseLocaleNumber(raw: string): number {
  return parseFloat(String(raw ?? "").replace(/,/g, "").trim());
}

function parseZerodhaCSV(text: string): ParsedHolding[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const idxOf = (keys: string[]) => keys.map((k) => header.indexOf(k)).find((i) => i !== -1) ?? -1;

  const symIdx = idxOf(["instrumentname", "symbol", "scripname", "stock", "tradingsymbol"]);
  const qtyIdx = idxOf(["qty", "quantity", "holdingqty", "netqty"]);
  const avgIdx = idxOf(["avgcost", "avgprice", "averageprice", "buyavg", "averagecostprice"]);
  const curIdx = idxOf(["curval", "currentvalue", "presentvalue", "ltp", "lastprice"]);
  const pnlIdx = idxOf(["netreturns", "pnl", "unrealisedpnl", "returnamount", "profitloss"]);

  const results: ParsedHolding[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const symbol = symIdx >= 0 ? cols[symIdx]?.toUpperCase().replace(/\.(NS|BO)$/i, "") : "";
    const qty = qtyIdx >= 0 ? parseLocaleNumber(cols[qtyIdx]) : NaN;
    const avg = avgIdx >= 0 ? parseLocaleNumber(cols[avgIdx]) : NaN;
    if (!symbol || isNaN(qty) || qty <= 0 || isNaN(avg) || avg <= 0) continue;
    const cur = curIdx >= 0 ? parseLocaleNumber(cols[curIdx]) : qty * avg;
    const pnl = pnlIdx >= 0 ? parseLocaleNumber(cols[pnlIdx]) : cur - qty * avg;
    results.push({ symbol, quantity: qty, avgPrice: avg, currentValue: isNaN(cur) ? qty * avg : cur, pnl: isNaN(pnl) ? 0 : pnl });
  }
  return results;
}

// ─── Grade badge colors ────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  S: "text-purple-400 border-purple-400/40 bg-purple-400/10",
  A: "text-success border-success/40 bg-success/10",
  B: "text-accent border-accent/40 bg-accent/10",
  C: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  D: "text-orange-400 border-orange-400/40 bg-orange-400/10",
  F: "text-danger border-danger/40 bg-danger/10",
};

const TONE_COLORS: Record<string, string> = {
  green: "border-success/30 bg-success/5",
  amber: "border-amber-400/30 bg-amber-400/5",
  red: "border-danger/30 bg-danger/5",
};

// ─── RoastResult type ─────────────────────────────────────────────────────────

type RoastResult = {
  grade: string;
  gradeBadge: string;
  roast: string;
  praiseOne: string;
  topRed: string;
  topGreen: string;
  fixes: string[];
  verdict: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PortfolioDoctor() {
  const [holdings, setHoldings] = useState<ParsedHolding[]>([]);
  const [roast, setRoast] = useState<RoastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setRoast(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseZerodhaCSV(text);
      if (parsed.length === 0) {
        setError("Could not parse CSV. Make sure it's a Zerodha or Groww holdings export.");
        setHoldings([]);
      } else {
        setHoldings(parsed);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) handleFile(file);
    },
    [handleFile]
  );

  const handleRoast = useCallback(async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const total = holdings.reduce((s, h) => s + h.currentValue, 0);
      const res = await fetchPortfolioRoast(
        holdings.map((h) => ({
          symbol: h.symbol,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          currentValue: h.currentValue,
          pnl: h.pnl,
        })),
        total
      );
      setRoast((res.roast as RoastResult) || null);
    } catch {
      setError("AI roast failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [holdings]);

  const gradeClass = roast ? (GRADE_COLORS[roast.grade] ?? GRADE_COLORS.C) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4 text-orange-400" />
          Portfolio Doctor
          <Badge variant="secondary" className="bg-orange-400/10 border-transparent px-2 py-0.5 text-[10px] font-medium text-orange-400 hover:bg-orange-400/20">
            AI Roast
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted">
          Upload your <strong>Zerodha</strong> or <strong>Groww</strong> CSV holdings export.
          Get an AI-powered grade, roast, and actionable fixes.
        </p>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 bg-bg/40 py-8 transition hover:border-accent/50 hover:bg-accent/5"
        >
          <Upload className="h-7 w-7 text-muted" />
          <p className="text-sm font-medium">
            {fileName ? fileName : "Drop CSV or click to upload"}
          </p>
          <p className="text-[11px] text-muted">Zerodha · Groww · Any broker CSV</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {/* Parsed preview */}
        {holdings.length > 0 && !roast && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">
              {holdings.length} holdings detected
            </p>
            <div className="max-h-36 overflow-y-auto rounded-xl border border-border/40 bg-bg/40">
              {holdings.slice(0, 10).map((h) => (
                <div key={h.symbol} className="flex items-center justify-between border-b border-border/30 px-3 py-1.5 last:border-0">
                  <span className="text-xs font-semibold">{h.symbol}</span>
                  <span className="text-[11px] text-muted">{h.quantity} × ₹{h.avgPrice.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  <span className={`text-[11px] font-medium ${h.pnl >= 0 ? "text-success" : "text-danger"}`}>
                    {h.pnl >= 0 ? "+" : ""}₹{Math.abs(h.pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
              {holdings.length > 10 && (
                <p className="px-3 py-1.5 text-[11px] text-muted">+{holdings.length - 10} more</p>
              )}
            </div>
            <button
              onClick={handleRoast}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? "AI is judging your life choices…" : "🔥 Roast My Portfolio"}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        {/* Roast Result */}
        {roast && (
          <div className="space-y-4">
            {/* Grade */}
            <div className="flex items-center gap-4">
              <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border text-3xl font-black ${gradeClass}`}>
                {roast.grade}
              </div>
              <div>
                <p className="text-sm font-bold">{roast.gradeBadge}</p>
                <p className="mt-0.5 text-xs text-muted">{roast.verdict}</p>
              </div>
            </div>

            {/* Roast */}
            <div className="rounded-xl border border-orange-400/30 bg-orange-400/5 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">🔥 AI Roast</p>
              <p className="mt-1 text-sm">{roast.roast}</p>
            </div>

            {/* Praise */}
            <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-success">✅ You Got Right</p>
              <p className="mt-1 text-sm">{roast.praiseOne}</p>
            </div>

            {/* Best / Worst */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-success/30 bg-success/5 px-3 py-2">
                <div className="flex items-center gap-1 text-[11px] text-success">
                  <TrendingUp className="h-3 w-3" /> Top Pick
                </div>
                <p className="mt-0.5 text-xs">{roast.topGreen}</p>
              </div>
              <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2">
                <div className="flex items-center gap-1 text-[11px] text-danger">
                  <TrendingDown className="h-3 w-3" /> Watch Out
                </div>
                <p className="mt-0.5 text-xs">{roast.topRed}</p>
              </div>
            </div>

            {/* Fixes */}
            <div className="rounded-xl border border-border/50 bg-bg/50 px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
                <Star className="mr-1 inline h-3 w-3" /> Action Plan
              </p>
              {roast.fixes.map((fix, i) => (
                <p key={i} className="mb-1 text-xs text-muted">
                  <span className="font-bold text-accent">{i + 1}.</span> {fix}
                </p>
              ))}
            </div>

            {/* Reset */}
            <button
              onClick={() => { setRoast(null); setHoldings([]); setFileName(null); }}
              className="flex items-center gap-1 text-xs text-muted hover:text-text"
            >
              <X className="h-3 w-3" /> Upload different file
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
