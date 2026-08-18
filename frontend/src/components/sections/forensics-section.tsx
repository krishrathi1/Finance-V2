"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSearch,
  Activity,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { computeForensicAudit, type FinancialStatementsInput, type ForensicMetrics } from "@/server/domain/forensic-scores";

export function ForensicsSection({
  stockData,
}: {
  stockData?: {
    symbol?: string;
    companyName?: string;
    marketCap?: number;
    financials?: any;
    balanceSheet?: any[];
    incomeStatement?: any[];
    cashFlow?: any[];
    keyMetrics?: any;
    shareholding?: any;
  };
}) {
  const [expandedDetails, setExpandedDetails] = useState(false);

  // Extract financial statement lines if available
  const bs0 = stockData?.balanceSheet?.[0] || {};
  const bs1 = stockData?.balanceSheet?.[1] || {};
  const is0 = stockData?.incomeStatement?.[0] || {};
  const is1 = stockData?.incomeStatement?.[1] || {};
  const cf0 = stockData?.cashFlow?.[0] || {};
  const cf1 = stockData?.cashFlow?.[1] || {};

  const input: FinancialStatementsInput = {
    marketCap: stockData?.marketCap || stockData?.keyMetrics?.marketCap,
    totalAssets: bs0.totalAssets || is0.revenue ? is0.revenue * 1.2 : undefined,
    totalAssetsPrev: bs1.totalAssets,
    currentAssets: bs0.totalCurrentAssets,
    currentAssetsPrev: bs1.totalCurrentAssets,
    currentLiabilities: bs0.totalCurrentLiabilities,
    currentLiabilitiesPrev: bs1.totalCurrentLiabilities,
    totalLiabilities: bs0.totalLiabilities,
    longTermDebt: bs0.longTermDebt,
    longTermDebtPrev: bs1.longTermDebt,
    revenue: is0.revenue || is0.totalRevenue,
    revenuePrev: is1.revenue || is1.totalRevenue,
    grossProfit: is0.grossProfit,
    grossProfitPrev: is1.grossProfit,
    netIncome: is0.netIncome,
    netIncomePrev: is1.netIncome,
    operatingCashFlow: cf0.operatingCashFlow || cf0.netCashFromOperatingActivities,
    operatingCashFlowPrev: cf1.operatingCashFlow || cf1.netCashFromOperatingActivities,
    ebit: is0.ebit || is0.operatingIncome,
    retainedEarnings: bs0.retainedEarnings,
    receivables: bs0.netReceivables,
    receivablesPrev: bs1.netReceivables,
    promoterPledgePct: stockData?.shareholding?.promoterPledge ?? 0,
    promoterHoldingChangePct: stockData?.shareholding?.promoterChangeQoQ ?? 0,
  };

  const audit: ForensicMetrics = computeForensicAudit(input);

  const getVerdictStyle = (health: string) => {
    switch (health) {
      case "Pristine":
        return { bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300" };
      case "Healthy":
        return { bg: "bg-teal-500/10 border-teal-500/30 text-teal-400", badge: "bg-teal-500/20 text-teal-300" };
      case "Caution":
        return { bg: "bg-amber-500/10 border-amber-500/30 text-amber-400", badge: "bg-amber-500/20 text-amber-300" };
      case "High Risk":
      default:
        return { bg: "bg-rose-500/10 border-rose-500/30 text-rose-400", badge: "bg-rose-500/20 text-rose-300" };
    }
  };

  const verdictStyle = getVerdictStyle(audit.compositeForensicVerdict.overallHealth);

  return (
    <div className="space-y-6">
      {/* Top Banner Verdict */}
      <Card className={`relative overflow-hidden border p-5 transition-all ${verdictStyle.bg}`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-bg/60 backdrop-blur-md border border-white/10 shadow-inner">
              {audit.compositeForensicVerdict.overallHealth === "Pristine" || audit.compositeForensicVerdict.overallHealth === "Healthy" ? (
                <ShieldCheck className="h-7 w-7 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-7 w-7 text-rose-400 animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-fg">Forensic Accounting Audit</h3>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${verdictStyle.badge}`}>
                  {audit.compositeForensicVerdict.overallHealth}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-fg max-w-2xl">
                {audit.compositeForensicVerdict.summary}
              </p>
            </div>
          </div>
          <div className="text-right self-stretch md:self-auto flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 border-white/10 pt-3 md:pt-0">
            <span className="text-xs text-muted">Piotroski Score</span>
            <span className="text-2xl font-black font-mono text-fg">{audit.fScore.score} <span className="text-sm font-normal text-muted">/ 9</span></span>
          </div>
        </div>
      </Card>

      {/* 3 Core Forensic Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Beneish M-Score */}
        <Card className="p-5 flex flex-col justify-between border border-border/70 bg-card/60 backdrop-blur-md hover:border-border transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-muted">Beneish M-Score</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                audit.mScore.manipulationRisk === "Low" ? "bg-emerald-500/15 text-emerald-400" :
                audit.mScore.manipulationRisk === "Moderate" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400"
              }`}>
                {audit.mScore.manipulationRisk} Manipulation Risk
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-fg">{audit.mScore.score}</span>
              <span className="text-xs text-muted">(Threshold: &lt; -1.78)</span>
            </div>
            <p className="mt-2 text-xs text-muted-fg leading-relaxed">
              {audit.mScore.explanation}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted space-y-1">
            <div className="flex justify-between">
              <span>Days Sales Receivables Index (DSRI):</span>
              <span className="font-mono text-fg">{audit.mScore.details.dsri}</span>
            </div>
            <div className="flex justify-between">
              <span>Gross Margin Index (GMI):</span>
              <span className="font-mono text-fg">{audit.mScore.details.gmi}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Accruals to Assets (TATA):</span>
              <span className="font-mono text-fg">{audit.mScore.details.tata}</span>
            </div>
          </div>
        </Card>

        {/* 2. Altman Z-Score */}
        <Card className="p-5 flex flex-col justify-between border border-border/70 bg-card/60 backdrop-blur-md hover:border-border transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-muted">Altman Z-Score</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                audit.zScore.zone === "Safe" ? "bg-emerald-500/15 text-emerald-400" :
                audit.zScore.zone === "Grey" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400"
              }`}>
                {audit.zScore.zone} Zone
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-fg">{audit.zScore.score}</span>
              <span className="text-xs text-muted">(&gt; 2.99 Safe)</span>
            </div>
            <p className="mt-2 text-xs text-muted-fg leading-relaxed">
              {audit.zScore.explanation}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted space-y-1">
            <div className="flex justify-between">
              <span>Working Capital / Assets:</span>
              <span className="font-mono text-fg">{audit.zScore.components.x1WorkingCapitalToAssets}</span>
            </div>
            <div className="flex justify-between">
              <span>EBIT / Total Assets:</span>
              <span className="font-mono text-fg">{audit.zScore.components.x3EbitToAssets}</span>
            </div>
            <div className="flex justify-between">
              <span>Market Cap / Liabilities:</span>
              <span className="font-mono text-fg">{audit.zScore.components.x4MarketCapToLiabilities}</span>
            </div>
          </div>
        </Card>

        {/* 3. Piotroski F-Score */}
        <Card className="p-5 flex flex-col justify-between border border-border/70 bg-card/60 backdrop-blur-md hover:border-border transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-muted">Piotroski F-Score</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                audit.fScore.rating === "Strong" ? "bg-emerald-500/15 text-emerald-400" :
                audit.fScore.rating === "Moderate" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400"
              }`}>
                {audit.fScore.rating} Strength
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-fg">{audit.fScore.score}</span>
              <span className="text-xs text-muted">/ 9 criteria passed</span>
            </div>
            <p className="mt-2 text-xs text-muted-fg leading-relaxed">
              Assesses 9 financial trend signals covering operational profitability, leverage reduction, and asset productivity.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted">Pass Rate</span>
              <span className="font-semibold text-fg">{Math.round((audit.fScore.score / 9) * 100)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  audit.fScore.score >= 7 ? "bg-emerald-500" : audit.fScore.score >= 4 ? "bg-amber-500" : "bg-rose-500"
                }`}
                style={{ width: `${(audit.fScore.score / 9) * 100}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Corporate Governance & Red Flag Alerts */}
      <Card className="p-5 border border-border/70 bg-card/60 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            <h4 className="text-base font-semibold text-fg">Corporate Governance &amp; Forensic Flags</h4>
          </div>
          <span className="text-xs text-muted font-mono">{audit.governanceFlags.length} audits performed</span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {audit.governanceFlags.map((flag, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                flag.severity === "high"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : flag.severity === "medium"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              }`}
            >
              {flag.severity === "clean" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : flag.severity === "medium" ? (
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h5 className="text-xs font-bold text-fg">{flag.title}</h5>
                <p className="mt-1 text-xs text-muted-fg leading-relaxed">{flag.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Accordion for Detailed Piotroski 9-Point Breakdown */}
      <div className="border border-border/70 rounded-xl overflow-hidden bg-card/40">
        <button
          onClick={() => setExpandedDetails(!expandedDetails)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-secondary/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-fg">View 9-Point Piotroski Audit Breakdown</span>
          </div>
          {expandedDetails ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </button>

        {expandedDetails && (
          <div className="p-5 border-t border-border/70 space-y-3 bg-bg/20">
            {audit.fScore.points.map((pt, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/60">
                <div className="flex items-center gap-3">
                  {pt.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-fg">{pt.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-secondary text-muted">{pt.category}</span>
                    </div>
                    <p className="text-[11px] text-muted-fg mt-0.5">{pt.description}</p>
                  </div>
                </div>
                <span className={`text-xs font-mono font-bold ${pt.passed ? "text-emerald-400" : "text-rose-400"}`}>
                  {pt.passed ? "+1 Pass" : "0 Fail"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
