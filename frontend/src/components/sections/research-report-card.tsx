"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, RefreshCw, CheckCircle2, ShieldCheck, TrendingUp, AlertCircle, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { brokerActionBadgeClass, formatCurrency, formatPercent, formatReportDate } from "@/shared/format";
import { fetchResearchReport, type ResearchReportResponse } from "@/lib/api";
import type { DashboardData } from "@/shared/types";

type BrokerageReport = NonNullable<DashboardData["brokerageResearch"]>["reports"][number];

export function ResearchReportCard({
  companyName,
  symbol,
  cmp,
  report,
}: {
  companyName: string;
  symbol: string;
  cmp: number;
  report?: BrokerageReport;
}) {
  const [activeTab, setActiveTab] = useState<"ai" | "broker">(report ? "broker" : "ai");
  const [aiReport, setAiReport] = useState<ResearchReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadAiReport = (refresh = false) => {
    setLoading(true);
    setError(false);
    fetchResearchReport(symbol, { refresh })
      .then((res) => {
        setAiReport(res);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAiReport(false);
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasBrokerTarget = report && Number.isFinite(report.targetPrice) && cmp > 0;
  const brokerUpside = hasBrokerTarget ? ((Number(report!.targetPrice) - cmp) / cmp) * 100 : null;

  const hasAiTarget = aiReport && Number.isFinite(aiReport.targetPrice) && aiReport.targetPrice! > 0 && cmp > 0;
  const aiUpside = hasAiTarget ? ((Number(aiReport!.targetPrice) - cmp) / cmp) * 100 : null;

  return (
    <Card className="flex flex-col p-5">
      {/* Header with Switcher & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-tight">Research Report</h3>
            <p className="text-[11px] text-muted">Equity analysis and retail investor checks</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {report && (
            <div className="inline-flex rounded-lg border border-border/80 bg-panel/90 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setActiveTab("broker")}
                className={`rounded-md px-2.5 py-1 transition ${
                  activeTab === "broker" ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                Broker Note
              </button>
              <button
                onClick={() => setActiveTab("ai")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                  activeTab === "ai" ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                <span>AI Note</span>
              </button>
            </div>
          )}

          {activeTab === "ai" && (
            <button
              onClick={() => loadAiReport(true)}
              disabled={loading}
              title="Regenerate with Gemini"
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-bg/50 px-2 py-1 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-text disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin text-accent" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Broker Note View */}
      {activeTab === "broker" && report && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-base font-bold text-accent">
              {(companyName.trim().charAt(0) || symbol.charAt(0)).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-text">{companyName}</p>
              <p className="text-xs text-muted">{symbol} • Broker Coverage</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-bg/45 px-3 py-2">
              <p className="text-[11px] text-muted">Date</p>
              <p className="mt-0.5 text-sm font-semibold">{formatReportDate(report.date)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-bg/45 px-3 py-2">
              <p className="text-[11px] text-muted">CMP</p>
              <p className="mt-0.5 text-sm font-semibold">{formatCurrency(cmp)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-bg/45 px-3 py-2">
              <p className="text-[11px] text-muted">Target</p>
              <p className="mt-0.5 text-sm font-semibold">
                {Number.isFinite(report.targetPrice) ? formatCurrency(Number(report.targetPrice)) : "N/A"}
              </p>
            </div>
            <div
              className={`rounded-xl px-3 py-2 ${
                brokerUpside === null ? "bg-bg/45" : brokerUpside >= 0 ? "bg-success/15" : "bg-danger/10"
              }`}
            >
              <p className="text-[11px] text-muted">Upside</p>
              <p className={`mt-0.5 text-sm font-semibold ${brokerUpside !== null ? (brokerUpside >= 0 ? "text-success" : "text-danger") : ""}`}>
                {brokerUpside !== null ? formatPercent(brokerUpside) : "N/A"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${brokerActionBadgeClass(report.action)}`}>
                {report.action || "hold"}
              </span>
              <span>{report.broker}</span>
            </div>
            {report.url && (
              <Link
                href={report.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                View PDF Report <span aria-hidden="true">&rsaquo;</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* AI Note View */}
      {(activeTab === "ai" || !report) && (
        <div className="mt-3 flex flex-1 flex-col justify-between">
          {loading && !aiReport ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Sparkles className="h-4 w-4 animate-spin text-accent" />
                <span>Generating institutional AI research note with Gemini...</span>
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-border/40" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-border/40" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-border/40" />
            </div>
          ) : error && !aiReport ? (
            <div className="py-4 text-center text-xs text-muted">
              <AlertCircle className="mx-auto mb-1 h-5 w-5 text-amber-400" />
              <p>Unable to load AI research report. Please retry shortly.</p>
            </div>
          ) : aiReport ? (
            <div className="space-y-3.5">
              {/* Badge row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                    <Sparkles className="h-3 w-3" />
                    <span>AI Research Note</span>
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      aiReport.riskLevel === "low"
                        ? "bg-success/15 text-success"
                        : aiReport.riskLevel === "high"
                        ? "bg-danger/15 text-danger"
                        : "bg-amber-400/15 text-amber-400"
                    }`}
                  >
                    {aiReport.riskLevel} Risk
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {aiReport.targetPrice && (
                    <span className="font-semibold text-text">
                      Target: ₹{aiReport.targetPrice.toLocaleString("en-IN")}{" "}
                      {aiUpside !== null && (
                        <span className={aiUpside >= 0 ? "text-success font-bold" : "text-danger font-bold"}>
                          ({formatPercent(aiUpside)})
                        </span>
                      )}
                    </span>
                  )}
                  <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] text-muted">
                    {aiReport.source === "gemini" ? "Gemini 2.5 Flash" : "Rule Engine"}
                  </span>
                </div>
              </div>

              {/* Report Narrative */}
              <div className="space-y-2 text-xs leading-relaxed text-muted/90">
                {aiReport.report.split("\n\n").map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>

              {/* Actionable Recommendations */}
              {aiReport.recommendations?.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-bg/40 p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text">
                    Key Investor Monitorables
                  </p>
                  <ul className="space-y-1.5 text-xs text-muted">
                    {aiReport.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">No report generated yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}
