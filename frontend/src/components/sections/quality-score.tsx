import { AlertTriangle, Check, Minus, ShieldCheck, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { computeQuality, type QualityLabel, type AltmanZone } from "@/lib/quality-checklist";

function labelTone(label: QualityLabel) {
  if (label === "Strong") return "bg-success/15 text-success";
  if (label === "Moderate") return "bg-amber-400/15 text-amber-400";
  if (label === "Weak") return "bg-danger/15 text-danger";
  return "bg-bg text-muted";
}

function zoneTone(zone: AltmanZone) {
  if (zone === "Safe") return "bg-success/15 text-success";
  if (zone === "Grey") return "bg-amber-400/15 text-amber-400";
  return "bg-danger/15 text-danger";
}

export function QualityScore({
  metrics,
  financials,
  sector,
}: {
  metrics?: Record<string, number | null>;
  financials?: { incomeStatement?: any[]; balanceSheet?: any[]; growthSnapshot?: any };
  /** Suppresses Altman Z for banks/NBFCs, where the model doesn't hold. */
  sector?: string | null;
}) {
  const result = computeQuality({
    metrics,
    incomeStatement: financials?.incomeStatement,
    balanceSheet: financials?.balanceSheet,
    growthSnapshot: financials?.growthSnapshot,
    sector,
  });

  const nothing = result.total === 0 && result.altmanZ === null;
  const hasAltman = result.altmanZ !== null && result.altmanZone !== null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
        <h3 className="text-lg font-semibold">Quality &amp; Safety</h3>
        <span className="ml-1 text-[11px] text-muted">Fundamental health checklist</span>
      </div>

      {nothing ? (
        <p className="mt-3 rounded-xl border border-border/70 bg-bg/40 p-4 text-sm text-muted">
          Not enough financial history to grade quality for this stock yet.
        </p>
      ) : (
        <>
          <div className={`mt-3 grid gap-3 ${hasAltman ? "sm:grid-cols-2" : ""}`}>
            {/* Quality score */}
            <div className="rounded-xl border border-border/70 bg-bg/40 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted">Quality score</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold">
                  {result.total > 0 ? result.passed : "—"}
                  {result.total > 0 ? <span className="text-lg text-muted">/{result.total}</span> : null}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${labelTone(result.label)}`}>
                  {result.label}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">Checks passed on profitability, leverage, growth &amp; consistency</p>
            </div>

            {/* Altman Z — only when balance-sheet data is available */}
            {hasAltman ? (
              <div className="rounded-xl border border-border/70 bg-bg/40 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted">Altman Z-Score</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{result.altmanZ!.toFixed(2)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${zoneTone(result.altmanZone!)}`}>
                    {result.altmanZone}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Bankruptcy-risk model · &gt;2.99 safe, &lt;1.81 distress</p>
              </div>
            ) : null}
          </div>

          {/* Checklist */}
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 rounded-lg border border-border/45 bg-bg/30 px-3 py-2 text-sm" title={c.detail}>
                <span className="mt-0.5 shrink-0">
                  {c.pass === true ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : c.pass === false ? (
                    <X className="h-4 w-4 text-danger" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted" />
                  )}
                </span>
                <span className={c.pass === null ? "text-muted" : ""}>{c.label}</span>
              </li>
            ))}
          </ul>

          {/* Red flags */}
          <div className="mt-3">
            {result.redFlags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" /> Red flags
                </span>
                {result.redFlags.map((flag) => (
                  <span key={flag} className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
                    {flag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> No major red flags detected
              </span>
            )}
          </div>

          <p className="mt-3 text-[10px] text-muted/60">
            Rule-based analysis from reported financials · educational, not investment advice.
          </p>
        </>
      )}
    </Card>
  );
}
