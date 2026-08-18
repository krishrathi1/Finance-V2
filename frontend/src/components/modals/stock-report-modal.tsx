"use client";

import React from "react";
import {
  Printer,
  Download,
  X,
  FileText,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Activity,
  Award,
} from "lucide-react";
import type { DashboardData } from "@/shared/types";
import { computeForensicAudit } from "@/server/domain/forensic-scores";

export function StockReportModal({
  isOpen,
  onClose,
  data,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: DashboardData;
}) {
  if (!isOpen || !data) return null;

  const symbol = data.symbol || "STOCK";
  const companyName = data.companyName || symbol;
  const cmp = data.price?.cmp || 0;
  const mcap = data.metrics?.marketCap || 0;

  const bs0 = data.financials?.balanceSheet?.[0] || {};
  const is0 = data.financials?.incomeStatement?.[0] || {};
  const cf0 = data.financials?.cashFlow?.[0] || {};

  const audit = computeForensicAudit({
    marketCap: mcap,
    revenue: is0.revenue || is0.totalRevenue,
    grossProfit: is0.grossProfit,
    netIncome: is0.netIncome,
    operatingCashFlow: cf0.operatingCashFlow,
    totalAssets: bs0.totalAssets,
    promoterPledgePct: data.shareholding?.promoterPledge,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md print:p-0 print:bg-white">
      <div className="relative w-full max-w-4xl rounded-3xl border border-border/80 bg-panel text-fg p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Modal Action Bar (Hidden on Print) */}
        <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold">Equity Research &amp; Forensic Report</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 shadow transition-all"
            >
              <Printer className="h-4 w-4" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-secondary text-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Header */}
        <div className="border-b-2 border-primary pb-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-bold">
                FINANCIAL FORENSICS AI • INSTITUTIONAL EQUITY NOTE
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">{companyName}</h1>
              <p className="text-sm text-muted print:text-gray-600 font-mono">
                NSE: {symbol} | Sector: {data.sector || "Equity"} | Date: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted print:text-gray-600">Current Market Price</span>
              <p className="text-2xl sm:text-3xl font-extrabold font-mono text-primary">
                ₹{cmp.toLocaleString("en-IN")}
              </p>
              <span className="text-[11px] text-muted print:text-gray-600">
                52W: ₹{data.price?.fiftyTwoWeekLow || "—"} - ₹{data.price?.fiftyTwoWeekHigh || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Executive Summary & Scores Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
          {/* Smart Score */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-bg/50 print:border-gray-300">
            <span className="text-[10px] uppercase font-bold text-muted print:text-gray-600">Smart Score</span>
            <p className="text-xl font-black text-primary mt-1">{data.smartScore?.label || "Strong"}</p>
            <span className="text-[10px] text-muted print:text-gray-500">Quantitative Rating</span>
          </div>

          {/* Piotroski F-Score */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-bg/50 print:border-gray-300">
            <span className="text-[10px] uppercase font-bold text-muted print:text-gray-600">Piotroski F-Score</span>
            <p className="text-xl font-black text-fg print:text-black mt-1">{audit.fScore.score} / 9</p>
            <span className="text-[10px] text-muted print:text-gray-500">{audit.fScore.rating} Strength</span>
          </div>

          {/* Beneish M-Score */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-bg/50 print:border-gray-300">
            <span className="text-[10px] uppercase font-bold text-muted print:text-gray-600">Beneish M-Score</span>
            <p className="text-xl font-black text-fg print:text-black mt-1">{audit.mScore.score}</p>
            <span className="text-[10px] text-muted print:text-gray-500">{audit.mScore.manipulationRisk} Manipulation Risk</span>
          </div>

          {/* Altman Z-Score */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-bg/50 print:border-gray-300">
            <span className="text-[10px] uppercase font-bold text-muted print:text-gray-600">Altman Z-Score</span>
            <p className="text-xl font-black text-fg print:text-black mt-1">{audit.zScore.score}</p>
            <span className="text-[10px] text-muted print:text-gray-500">{audit.zScore.zone} Solvency Zone</span>
          </div>
        </div>

        {/* Forensic & Accounting Audit Section */}
        <div className="p-4 rounded-2xl border border-border/70 bg-secondary/30 mb-6 print:border-gray-300 print:bg-gray-50">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
            Forensic Accounting &amp; Governance Assessment
          </h4>
          <p className="text-xs leading-relaxed text-muted-fg print:text-gray-700">
            {audit.compositeForensicVerdict.summary}
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {audit.governanceFlags.map((flag, idx) => (
              <div key={idx} className="p-2 rounded-lg bg-bg/60 border border-border/40 print:bg-white print:border-gray-200">
                <span className="font-semibold text-fg print:text-black">• {flag.title}: </span>
                <span className="text-muted print:text-gray-600">{flag.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Key Valuation & Financial Metrics Table */}
        <div className="mb-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted print:text-gray-700 mb-2.5">
            Key Financial Ratios &amp; Multiples
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl border border-border/50 bg-bg/40 print:border-gray-200">
              <span className="text-muted print:text-gray-500 block text-[10px]">Price to Earnings (P/E)</span>
              <span className="font-bold font-mono text-sm">{data.metrics?.peRatio ? `${data.metrics.peRatio.toFixed(1)}x` : "—"}</span>
            </div>
            <div className="p-2.5 rounded-xl border border-border/50 bg-bg/40 print:border-gray-200">
              <span className="text-muted print:text-gray-500 block text-[10px]">Price to Book (P/B)</span>
              <span className="font-bold font-mono text-sm">{data.metrics?.pbRatio ? `${data.metrics.pbRatio.toFixed(1)}x` : "—"}</span>
            </div>
            <div className="p-2.5 rounded-xl border border-border/50 bg-bg/40 print:border-gray-200">
              <span className="text-muted print:text-gray-500 block text-[10px]">ROCE / ROE</span>
              <span className="font-bold font-mono text-sm">{data.metrics?.roce ? `${data.metrics.roce.toFixed(1)}%` : "—"}</span>
            </div>
            <div className="p-2.5 rounded-xl border border-border/50 bg-bg/40 print:border-gray-200">
              <span className="text-muted print:text-gray-500 block text-[10px]">Debt to Equity</span>
              <span className="font-bold font-mono text-sm">{data.metrics?.debtToEquity ? `${data.metrics.debtToEquity.toFixed(2)}` : "0.00 (Zero Debt)"}</span>
            </div>
          </div>
        </div>

        {/* Disclaimer Footer */}
        <div className="border-t border-border/60 pt-4 text-[10px] text-muted print:text-gray-500 leading-relaxed">
          <p>
            <strong>Disclaimer:</strong> This report is generated automatically by Financial Forensics AI for research, educational, and analytical purposes only. It does not constitute investment advice or a recommendation to buy/sell securities.
          </p>
        </div>
      </div>
    </div>
  );
}
