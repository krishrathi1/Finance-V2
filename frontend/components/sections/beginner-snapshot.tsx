"use client";

import { ArrowUpRight, ShieldAlert, Sparkles, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

function getQualitySummary(score: number) {
  if (score >= 4) return { label: "Strong", tone: "text-success", detail: "Business quality looks strong on your current score mix." };
  if (score >= 3.2) return { label: "Good", tone: "text-accent", detail: "Quality looks decent, but still worth validating before buying." };
  if (score >= 2.3) return { label: "Mixed", tone: "text-amber-500", detail: "Some signals are working, but conviction is not clean yet." };
  return { label: "Weak", tone: "text-danger", detail: "Quality signals are weak right now." };
}

function getRiskSummary(score: number) {
  if (score <= 1.5) return { label: "Low", tone: "text-success", detail: "Price and business risk look relatively calm." };
  if (score <= 2.5) return { label: "Manageable", tone: "text-lime-500", detail: "Risk is present, but still reasonable for a patient investor." };
  if (score <= 3.5) return { label: "Moderate", tone: "text-amber-500", detail: "Expect volatility and do not treat this as a low-stress pick." };
  return { label: "High", tone: "text-danger", detail: "This may be tough for a first-time investor to hold through swings." };
}

function getReliabilitySummary(confidence?: number) {
  const safeConfidence = Math.max(0, Math.min(1, confidence ?? 0));
  if (safeConfidence >= 0.7) return { label: "High", tone: "text-success" };
  if (safeConfidence >= 0.45) return { label: "Medium", tone: "text-amber-500" };
  return { label: "Low", tone: "text-danger" };
}

function getBeginnerVerdict(smartScore: number, riskScore: number) {
  if (smartScore >= 3.5 && riskScore <= 2.5) {
    return {
      title: "Looks beginner-friendly",
      tone: "text-success",
      badgeClass: "border-success/20 bg-success/10 text-success",
      summary: "The quality signal is healthy and the risk profile is not extreme."
    };
  }
  if (smartScore >= 3 && riskScore <= 3.2) {
    return {
      title: "Okay for patient beginners",
      tone: "text-accent",
      badgeClass: "border-accent/20 bg-accent/10 text-accent",
      summary: "This can work if you are comfortable with some volatility and a longer holding period."
    };
  }
  if (smartScore >= 2.3 && riskScore <= 4) {
    return {
      title: "Watchlist first",
      tone: "text-amber-500",
      badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-500",
      summary: "There is some upside, but the setup is not simple enough for a first read."
    };
  }
  return {
    title: "Needs caution",
    tone: "text-danger",
    badgeClass: "border-danger/20 bg-danger/10 text-danger",
    summary: "The current mix of quality and risk is not easy for a new investor to hold with confidence."
  };
}

export function BeginnerSnapshot({
  smartScore,
  riskScore,
  currentPrice,
  aiTarget,
  mlConfidence
}: {
  smartScore: number;
  riskScore: number;
  currentPrice: number;
  aiTarget: number;
  mlConfidence?: number;
}) {
  const quality = getQualitySummary(smartScore);
  const risk = getRiskSummary(riskScore);
  const reliability = getReliabilitySummary(mlConfidence);
  const verdict = getBeginnerVerdict(smartScore, riskScore);
  const targetGap = currentPrice > 0 ? ((aiTarget - currentPrice) / currentPrice) * 100 : 0;
  const targetTone = targetGap >= 0 ? "text-success" : "text-danger";
  const targetLabel = targetGap >= 0 ? "Potential upside" : "Possible downside";

  return (
    <Card className="overflow-hidden border border-border/70 bg-panel/80 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Beginner Snapshot</h3>
              <p className="text-sm text-muted">Plain-English view using the same live score, risk, and target data.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-bg/35 p-4">
            <Badge variant="outline" className={verdict.badgeClass}>
              {verdict.title}
            </Badge>
            <p className={`mt-3 text-xl font-semibold ${verdict.tone}`}>{verdict.summary}</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Smart Score says the business setup is <span className={quality.tone}>{quality.label.toLowerCase()}</span>, while Risk Score says the ride is
              {" "}
              <span className={risk.tone}>{risk.label.toLowerCase()}</span>. This gives a faster first read before you open all the detailed charts.
            </p>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[28rem]">
          <div className="rounded-2xl border border-border/60 bg-bg/35 p-3.5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <Sparkles className="h-3.5 w-3.5" />
              Quality
            </div>
            <p className={`mt-2 text-xl font-semibold ${quality.tone}`}>{quality.label}</p>
            <p className="mt-1 text-sm text-muted">{quality.detail}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-bg/35 p-3.5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <ShieldAlert className="h-3.5 w-3.5" />
              Risk
            </div>
            <p className={`mt-2 text-xl font-semibold ${risk.tone}`}>{risk.label}</p>
            <p className="mt-1 text-sm text-muted">{risk.detail}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-bg/35 p-3.5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {targetLabel}
            </div>
            <p className={`mt-2 text-xl font-semibold ${targetTone}`}>{targetGap >= 0 ? "+" : ""}{targetGap.toFixed(2)}%</p>
            <p className="mt-1 text-sm text-muted">
              Current {formatCurrency(currentPrice)} vs analyst target {formatCurrency(aiTarget)}
            </p>
            <p className="mt-1 text-[10px] text-muted/50">Source: FMP analyst consensus</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-bg/35 p-3.5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <Target className="h-3.5 w-3.5" />
              ML Signal Reliability
            </div>
            <p className={`mt-2 text-xl font-semibold ${reliability.tone}`}>{reliability.label}</p>
            <p className="mt-1 text-sm text-muted">
              Walk-forward ML model trained on this stock’s own price history.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
