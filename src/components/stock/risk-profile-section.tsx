"use client";

import { ShieldAlert } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { fmtInr, fmtPct } from "@/lib/types";
import type { StockDashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatDef {
  label: string;
  value: string;
  badge?: string;
  badgeClass?: string;
  helper?: string;
}

function betaBadge(v: number): { label: string; className: string } {
  if (v < 1) return { label: "Defensive", className: "border-success/30 bg-success/10 text-success" };
  if (v <= 1.3) return { label: "Market-like", className: "border-warn/30 bg-warn/10 text-warn" };
  return { label: "Aggressive", className: "border-brand/30 bg-brand/10 text-brand" };
}

function sharpeTone(v: number): string {
  if (v > 1) return "text-success";
  if (v < 0.5) return "text-danger";
  return "text-warn";
}

/** Risk profile — 8 stat cards + risk-adjusted verdict badge. */
export function RiskProfileSection({ d }: { d: StockDashboard }) {
  const rp = d.riskProfile;
  const beta = betaBadge(rp.beta);

  const verdict =
    rp.sharpe > 1 && rp.beta < 1.2 && rp.maxDrawdown < 30
      ? { label: "Attractive risk-adjusted profile", tone: "success" as const }
      : rp.sharpe > 0.6 && rp.beta < 1.4 && rp.maxDrawdown < 50
        ? { label: "Moderate risk-adjusted profile", tone: "warn" as const }
        : { label: "Elevated risk profile", tone: "danger" as const };

  const verdictClass: Record<string, string> = {
    success: "border-success/30 bg-success/10 text-success",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-danger/30 bg-danger/10 text-danger",
  };

  const stats: StatDef[] = [
    { label: "Beta (1Y)", value: rp.beta.toFixed(2), badge: beta.label, badgeClass: beta.className },
    { label: "Alpha", value: fmtPct(rp.alpha, 2), helper: "vs market index" },
    { label: "Sharpe Ratio", value: rp.sharpe.toFixed(2), helper: "risk-adjusted return" },
    { label: "Sortino Ratio", value: rp.sortino.toFixed(2), helper: "downside-adjusted" },
    { label: "Max Drawdown", value: fmtPct(-rp.maxDrawdown, 1), helper: "1Y peak-to-trough" },
    { label: "Volatility (Ann)", value: `${rp.volatilityAnn.toFixed(1)}%`, helper: "annualised stdev" },
    { label: "VaR 95% (1-day)", value: fmtInr(rp.var95), helper: "value at risk" },
    { label: "R² (vs market)", value: rp.rSquared.toFixed(2), helper: "correlation strength" },
  ];

  return (
    <div>
      <SectionHeading
        icon={ShieldAlert}
        kicker="Quant Risk"
        title="Risk Profile"
        right={<span className="text-xs text-muted-foreground">Annualised</span>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card rounded-2xl border border-border/50 bg-panel/60 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
              {s.badge && (
                <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider", s.badgeClass)}>
                  {s.badge}
                </span>
              )}
            </div>
            <p
              className={cn(
                "mt-1.5 font-display text-xl font-bold tabular-nums text-text",
                s.label === "Sharpe Ratio" && sharpeTone(rp.sharpe)
              )}
            >
              {s.value}
            </p>
            {s.helper && <p className="mt-1 text-[9px] text-muted-foreground">{s.helper}</p>}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border/50 bg-panel/60 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Risk-adjusted verdict
        </p>
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
              verdictClass[verdict.tone]
            )}
          >
            {verdict.label}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Verdict blends Sharpe ratio, beta and 1Y drawdown — purely quantitative, not investment advice.
        </p>
      </div>
    </div>
  );
}
