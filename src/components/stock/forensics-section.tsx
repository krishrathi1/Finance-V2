"use client";

import { SearchCheck, ShieldCheck, Flag } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import type { Forensics, StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { clamp } from "./helpers";

const MSCORE_COMPONENTS: { key: keyof Forensics["components"]; full: string }[] = [
  { key: "DSRI", full: "Days Sales in Receivables Index" },
  { key: "GMI", full: "Gross Margin Index" },
  { key: "AQI", full: "Asset Quality Index" },
  { key: "SGI", full: "Sales Growth Index" },
  { key: "DEPI", full: "Depreciation Index" },
  { key: "SGAI", full: "SG&A Expense Index" },
  { key: "TATA", full: "Total Accruals to Total Assets" },
  { key: "LVGI", full: "Leverage Index" },
];

const HEALTH_CLASS: Record<Forensics["overallHealth"], string> = {
  Pristine: "border-success/30 bg-success/10 text-success",
  Healthy: "border-success/25 bg-success/10 text-success/80",
  Caution: "border-warn/30 bg-warn/10 text-warn",
  Distress: "border-danger/30 bg-danger/10 text-danger",
};

const RISK_CLASS: Record<"Low" | "Moderate" | "High", string> = {
  Low: "border-success/30 bg-success/10 text-success",
  Moderate: "border-warn/30 bg-warn/10 text-warn",
  High: "border-danger/30 bg-danger/10 text-danger",
};

const RISK_TEXT: Record<"Low" | "Moderate" | "High", string> = {
  Low: "text-success",
  Moderate: "text-warn",
  High: "text-danger",
};

const ZONE_CLASS: Record<Forensics["zZone"], string> = {
  Safe: "border-success/30 bg-success/10 text-success",
  Grey: "border-warn/30 bg-warn/10 text-warn",
  Distress: "border-danger/30 bg-danger/10 text-danger",
};

const STRENGTH_CLASS: Record<Forensics["fStrength"], string> = {
  Strong: "border-success/30 bg-success/10 text-success",
  Moderate: "border-warn/30 bg-warn/10 text-warn",
  Weak: "border-danger/30 bg-danger/10 text-danger",
};

function chipValueClass(v: number): string {
  if (v > 1.4) return "text-danger";
  if (v > 1.1) return "text-warn";
  return "text-success";
}

/** Forensic accounting: Beneish M-Score, Altman Z, Piotroski F, governance flags. */
export function ForensicsSection({ d }: { d: StockDashboard }) {
  const f = d.forensics;

  // Altman Z marker position: 0% at z=1.8 (distress floor), 100% at z=3 (safe).
  const zPos = clamp((f.zScore - 1.8) / (3 - 1.8), 0, 1) * 100;

  return (
    <div>
      <SectionHeading
        icon={SearchCheck}
        kicker="Forensic Accounting"
        title="Forensic Check"
        right={
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              HEALTH_CLASS[f.overallHealth]
            )}
          >
            {f.overallHealth}
          </span>
        }
      />

      <div className="space-y-4">
        {/* Beneish M-Score */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-text">Beneish M-Score</h3>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  RISK_CLASS[f.mScoreRisk]
                )}
              >
                {f.mScoreRisk} risk
              </span>
              <span className={cn("font-display text-2xl font-bold tabular-nums", RISK_TEXT[f.mScoreRisk])}>
                {f.mScore.toFixed(2)}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manipulation probability signal — threshold −1.78 (above = risky)
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MSCORE_COMPONENTS.map((c) => {
              const v = f.components[c.key];
              return (
                <div
                  key={c.key}
                  title={c.full}
                  className="rounded-xl border border-border/50 bg-bg/50 p-2.5"
                >
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{c.key}</p>
                  <p className={cn("mt-0.5 text-sm font-bold tabular-nums", chipValueClass(v))}>
                    {v.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Altman Z-Score */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-text">Altman Z-Score</h3>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  ZONE_CLASS[f.zZone]
                )}
              >
                {f.zZone}
              </span>
              <span className="font-display text-2xl font-bold tabular-nums text-text">
                {f.zScore.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="relative mt-5 h-2.5 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500">
            <div
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-panel bg-text shadow"
              style={{ left: `calc(${zPos}% - 8px)` }}
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
            <span>{"Distress <1.81"}</span>
            <span>Grey</span>
            <span>{">2.99 Safe"}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Bankruptcy probability signal — higher scores indicate a stronger balance sheet.
          </p>
        </div>

        {/* Piotroski F-Score */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-text">Piotroski F-Score</h3>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  STRENGTH_CLASS[f.fStrength]
                )}
              >
                {f.fStrength}
              </span>
              <span className="font-display text-2xl font-bold tabular-nums text-text">
                {f.fScore}
                <span className="text-sm font-semibold text-muted-foreground"> / {f.fScoreMax}</span>
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5" aria-label={`Piotroski score ${f.fScore} of ${f.fScoreMax}`}>
            {Array.from({ length: f.fScoreMax }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  i < f.fScore ? "bg-success" : "bg-muted"
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Fundamental momentum checklist — profitability, leverage and operating efficiency.
          </p>
        </div>

        {/* Governance flags */}
        <div className="rounded-2xl border border-border/50 bg-panel/60 p-5 backdrop-blur-sm">
          <h3 className="font-display text-sm font-bold text-text">Governance Flags</h3>
          {f.governanceFlags.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-success">
              <ShieldCheck className="h-4 w-4" />
              No governance flags detected.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {f.governanceFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-5 text-text/85">
                  <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  {flag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
