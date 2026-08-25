import { Target, TrendingDown, TrendingUp, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { analystConsensus, comparePeers, type AnalystReport, type PeerRow } from "@/shared/peer-analytics";

function inr(value: number) {
  if (Math.abs(value) >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (Math.abs(value) >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const VERDICT_TONE: Record<"favourable" | "inline" | "unfavourable", string> = {
  favourable: "bg-success/15 text-success",
  inline: "bg-bg text-muted",
  unfavourable: "bg-danger/15 text-danger",
};

const RATING_TONE: Record<string, string> = {
  "Strong Buy": "bg-success/20 text-success",
  Buy: "bg-success/15 text-success",
  Hold: "bg-amber-400/15 text-amber-400",
  Sell: "bg-danger/15 text-danger",
};

/**
 * Valuation relative to peers, and what analysts think it's worth.
 *
 * Both were already in the payload but shown only as raw numbers: a peer table
 * with no comparison, and buy/hold/sell counts with no implied price. A P/E of
 * 38 is meaningless in isolation — the useful statement is "more expensive
 * than 6 of its 8 peers", which is the whole point of a peer list.
 */
export function PeerValuation({
  metrics,
  competitors,
  brokerageResearch,
  currentPrice,
}: {
  metrics?: Record<string, number | null>;
  competitors?: { table?: PeerRow[]; sectorName?: string; industryName?: string };
  brokerageResearch?: {
    summary?: { buy?: number; hold?: number; sell?: number; total?: number };
    reports?: AnalystReport[];
  };
  currentPrice?: number | null;
}) {
  const peers = comparePeers(
    {
      peRatio: metrics?.peRatio,
      pbRatio: metrics?.pbRatio,
      roe: metrics?.roe,
      marketCap: metrics?.marketCap,
    },
    competitors?.table
  );

  const consensus = analystConsensus(
    brokerageResearch?.summary,
    brokerageResearch?.reports,
    currentPrice
  );

  if (!peers && !consensus) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-gradient-to-b from-teal-400 to-emerald-500" />
        <h3 className="text-lg font-semibold">Peers &amp; Forecast</h3>
        {peers?.sizeRank && peers.sizeGroup ? (
          <span className="ml-auto text-[11px] text-muted">
            #{peers.sizeRank} of {peers.sizeGroup} by size
          </span>
        ) : null}
      </div>

      {peers && peers.comparisons.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <Users className="h-3 w-3" />
            Versus {competitors?.industryName || competitors?.sectorName || "sector"} peers
          </p>

          <div className="space-y-2.5">
            {peers.comparisons.map((comparison) => (
              <div key={comparison.metric}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">{comparison.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums">
                      {comparison.value.toFixed(2)}
                      {comparison.metric === "roe" ? "%" : ""}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        VERDICT_TONE[comparison.verdict]
                      }`}
                    >
                      {comparison.premiumPercent >= 0 ? "+" : ""}
                      {comparison.premiumPercent.toFixed(0)}% vs median
                    </span>
                  </span>
                </div>

                {/* Position within the peer range. The marker is where this
                    company sits; the tick is the peer median. */}
                <div className="relative mt-1 h-1.5 w-full rounded-full bg-bg">
                  <div
                    className={`absolute top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-full ${
                      comparison.verdict === "favourable"
                        ? "bg-success"
                        : comparison.verdict === "unfavourable"
                        ? "bg-danger"
                        : "bg-muted"
                    }`}
                    style={{ left: `calc(${Math.min(98, Math.max(0, comparison.percentile))}% )` }}
                    aria-hidden="true"
                  />
                  <div className="absolute left-1/2 top-1/2 h-2 w-px -translate-y-1/2 bg-border" aria-hidden="true" />
                </div>

                <p className="mt-0.5 text-[11px] text-muted">
                  {comparison.lowerIsBetter
                    ? `Cheaper than ${comparison.peerCount - comparison.rank + 1} of ${
                        comparison.peerCount + 1
                      } in the group`
                    : `Higher than ${comparison.rank - 1} of ${comparison.peerCount} peers`}
                  {" · peer median "}
                  {comparison.peerMedian.toFixed(2)}
                  {comparison.metric === "roe" ? "%" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {consensus && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <Target className="h-3 w-3" /> Analyst forecast
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                RATING_TONE[consensus.rating] || "bg-bg text-muted"
              }`}
            >
              {consensus.rating}
            </span>
            <span className="text-[11px] text-muted">
              {consensus.buy} buy · {consensus.hold} hold · {consensus.sell} sell
              {" — "}
              {consensus.total} analyst{consensus.total === 1 ? "" : "s"}
            </span>
          </div>

          {/* Distribution bar: proportions read faster than three numbers. */}
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-bg">
            {consensus.buy > 0 && (
              <div className="bg-success" style={{ width: `${(consensus.buy / consensus.total) * 100}%` }} />
            )}
            {consensus.hold > 0 && (
              <div className="bg-amber-400" style={{ width: `${(consensus.hold / consensus.total) * 100}%` }} />
            )}
            {consensus.sell > 0 && (
              <div className="bg-danger" style={{ width: `${(consensus.sell / consensus.total) * 100}%` }} />
            )}
          </div>

          {consensus.averageTarget !== null && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
                <p className="text-[10px] text-muted">Average target</p>
                <p className="text-sm font-bold tabular-nums">{inr(consensus.averageTarget)}</p>
              </div>
              {consensus.upsidePercent !== null && (
                <div className="rounded-lg border border-border/40 bg-bg/40 px-2 py-2">
                  <p className="text-[10px] text-muted">Implied upside</p>
                  <p
                    className={`flex items-center gap-1 text-sm font-bold tabular-nums ${
                      consensus.upsidePercent >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {consensus.upsidePercent >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {consensus.upsidePercent >= 0 ? "+" : ""}
                    {consensus.upsidePercent.toFixed(1)}%
                  </p>
                </div>
              )}
              {consensus.lowTarget !== null && consensus.highTarget !== null && (
                <div className="col-span-2 rounded-lg border border-border/40 bg-bg/40 px-2 py-2 sm:col-span-1">
                  <p className="text-[10px] text-muted">Target range</p>
                  <p className="text-sm font-bold tabular-nums">
                    {inr(consensus.lowTarget)} – {inr(consensus.highTarget)}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] leading-4 text-muted/70">
            {consensus.targetCount > 0
              ? `Averaged across ${consensus.targetCount} published target${
                  consensus.targetCount === 1 ? "" : "s"
                }. `
              : ""}
            Analyst targets are opinions, not forecasts of fact.
          </p>
        </div>
      )}
    </Card>
  );
}
