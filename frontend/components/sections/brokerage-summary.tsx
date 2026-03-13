import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/lib/types";

type BrokeragePayload = DashboardData["brokerageResearch"];

function actionStyles(action: string) {
  const value = (action || "").toLowerCase();
  if (value === "buy") return "bg-emerald-600/15 text-emerald-700";
  if (value === "sell") return "bg-rose-600/15 text-rose-700";
  return "bg-amber-600/15 text-amber-800";
}

function formatDate(value: string) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTarget(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function BrokerageSummary({ brokerage }: { brokerage?: BrokeragePayload }) {
  const summary = brokerage?.summary || { "1D": 0, "1W": 0, "1M": 0, buy: 0, hold: 0, sell: 0, total: 0 };
  const reports = brokerage?.reports || [];

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Brokerage Summary</h3>
          <p className="text-xs text-muted">Latest analyst and broker report updates</p>
        </div>
        {brokerage?.sourceUrl ? (
          <Link
            href={brokerage.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-accent hover:underline"
          >
            Open Source
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-emerald-600/10 p-2 text-center">
          <p className="text-xs text-muted">Buy</p>
          <p className="font-semibold text-emerald-700">{summary.buy}</p>
        </div>
        <div className="rounded-lg bg-amber-600/10 p-2 text-center">
          <p className="text-xs text-muted">Hold</p>
          <p className="font-semibold text-amber-800">{summary.hold}</p>
        </div>
        <div className="rounded-lg bg-rose-600/10 p-2 text-center">
          <p className="text-xs text-muted">Sell</p>
          <p className="font-semibold text-rose-700">{summary.sell}</p>
        </div>
      </div>

      {reports.length ? (
        <div className="brokerage-scroll mt-4 min-h-0 max-h-[31rem] overflow-y-auto pr-1">
          <div className="space-y-2">
            {reports.map((row, idx) => (
              <div key={`${row.broker}-${row.date}-${idx}`} className="rounded-lg border border-border/70 bg-bg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{row.broker}</p>
                    <p className="text-xs text-muted">{formatDate(row.date)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${actionStyles(row.action)}`}>
                      {row.action || "hold"}
                    </span>
                    <p className="mt-1 text-xs text-muted">Target: {formatTarget(row.targetPrice)}</p>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted">{row.summary || row.headline}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex min-h-0 flex-1 items-center rounded-lg border border-dashed border-border/80 p-3 text-sm text-muted">
          No brokerage reports were found for this stock right now.
        </div>
      )}
    </Card>
  );
}
