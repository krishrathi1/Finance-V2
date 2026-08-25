import Link from "next/link";

import { Card } from "@/components/ui/card";
import { brokerActionBadgeClass, formatCurrency, formatPercent, formatReportDate } from "@/shared/format";
import type { DashboardData } from "@/shared/types";

type BrokerageReport = NonNullable<DashboardData["brokerageResearch"]>["reports"][number];

export function ResearchReportCard({
  companyName,
  symbol,
  cmp,
  report
}: {
  companyName: string;
  symbol: string;
  cmp: number;
  report?: BrokerageReport;
}) {
  if (!report) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold">Research Report</h3>
        <p className="mt-3 rounded-xl border border-border/70 bg-bg/40 p-4 text-sm text-muted">
          No broker research report was found for {symbol} yet.
        </p>
      </Card>
    );
  }

  const hasTarget = Number.isFinite(report.targetPrice) && cmp > 0;
  const upside = hasTarget ? ((Number(report.targetPrice) - cmp) / cmp) * 100 : null;

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Research Report</h3>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
          {(companyName.trim().charAt(0) || symbol.charAt(0)).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-text">{companyName}</p>
          <p className="text-xs text-muted">{symbol}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            upside === null ? "bg-bg/45" : upside >= 0 ? "bg-success/15" : "bg-danger/10"
          }`}
        >
          <p className="text-[11px] text-muted">Upside</p>
          <p className={`mt-0.5 text-sm font-semibold ${upside !== null ? (upside >= 0 ? "text-success" : "text-danger") : ""}`}>
            {upside !== null ? formatPercent(upside) : "N/A"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${brokerActionBadgeClass(report.action)}`}>
            {report.action || "hold"}
          </span>
          <span>{report.broker}</span>
        </div>
        {report.url ? (
          <Link
            href={report.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
          >
            View Report <span aria-hidden="true">&rsaquo;</span>
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
