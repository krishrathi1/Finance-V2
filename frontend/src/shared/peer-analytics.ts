/**
 * Peer-relative valuation and analyst consensus.
 *
 * The dashboard already returns a peer table and an analyst summary, but both
 * were rendered as raw figures. A P/E of 38 means nothing on its own — the
 * question every investor actually asks is "expensive *compared to what*",
 * and the answer is sitting in the peer list. Likewise a row of buy/hold/sell
 * counts doesn't say what those analysts think the stock is worth.
 *
 * Both are the headline features of the established Indian research sites
 * (Screener's peer comparison, Tickertape's forecast), and both are
 * computable from data already fetched.
 *
 * Pure and dependency-free.
 */

export type PeerRow = {
  name?: string | null;
  symbol?: string | null;
  marketCap?: number | null;
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Median of a numeric list. Even counts average the middle pair. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type PeerMetricComparison = {
  metric: "pe" | "pb" | "roe";
  label: string;
  value: number;
  peerMedian: number;
  /** How many peers reported this metric at all. */
  peerCount: number;
  /** 1 = lowest of the group. For ROE the caller reads it as "lowest first" too. */
  rank: number;
  /** Share of peers this company is below, 0-100. */
  percentile: number;
  /** Difference from the peer median, as a percentage of that median. */
  premiumPercent: number;
  /**
   * Whether being *below* the median is the favourable side. True for
   * valuation multiples (cheaper is better), false for returns (higher is
   * better) — without this the same "below median" reads as good and bad.
   */
  lowerIsBetter: boolean;
  verdict: "favourable" | "inline" | "unfavourable";
};

const METRIC_META: Record<
  PeerMetricComparison["metric"],
  { label: string; lowerIsBetter: boolean }
> = {
  pe: { label: "P/E ratio", lowerIsBetter: true },
  pb: { label: "P/B ratio", lowerIsBetter: true },
  roe: { label: "Return on equity", lowerIsBetter: false },
};

/**
 * Compare one metric against the peer group.
 *
 * Non-positive multiples are excluded from the peer set: a loss-making company
 * reports a negative or absent P/E, and letting that into a median drags it
 * toward nonsense — a negative "median P/E" would make every profitable peer
 * look expensive.
 */
function compareMetric(
  metric: PeerMetricComparison["metric"],
  value: number | null,
  peers: PeerRow[]
): PeerMetricComparison | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (METRIC_META[metric].lowerIsBetter && value <= 0) return null;

  const peerValues = peers
    .map((peer) => num(peer[metric]))
    .filter((peerValue): peerValue is number => {
      if (peerValue === null) return false;
      return METRIC_META[metric].lowerIsBetter ? peerValue > 0 : Number.isFinite(peerValue);
    });

  // A "median" of one peer is just that peer; below two there's no group to
  // compare against and the percentile is meaningless.
  if (peerValues.length < 2) return null;

  const peerMedian = median(peerValues)!;
  if (peerMedian === 0) return null;

  const below = peerValues.filter((peerValue) => peerValue < value).length;
  const percentile = (below / peerValues.length) * 100;
  const premiumPercent = ((value - peerMedian) / Math.abs(peerMedian)) * 100;

  const { label, lowerIsBetter } = METRIC_META[metric];
  // A ±10% band around the median counts as "in line" — narrower than that and
  // ordinary data noise flips the verdict between refreshes.
  const favourable = lowerIsBetter ? premiumPercent < -10 : premiumPercent > 10;
  const unfavourable = lowerIsBetter ? premiumPercent > 10 : premiumPercent < -10;

  return {
    metric,
    label,
    value,
    peerMedian,
    peerCount: peerValues.length,
    rank: below + 1,
    percentile,
    premiumPercent,
    lowerIsBetter,
    verdict: favourable ? "favourable" : unfavourable ? "unfavourable" : "inline",
  };
}

export type PeerComparison = {
  comparisons: PeerMetricComparison[];
  peerCount: number;
  /** Rank by market cap, 1 = largest in the group (the company plus its peers). */
  sizeRank: number | null;
  sizeGroup: number | null;
};

export function comparePeers(
  metrics: { peRatio?: number | null; pbRatio?: number | null; roe?: number | null; marketCap?: number | null } | null | undefined,
  peers: PeerRow[] | null | undefined
): PeerComparison | null {
  const table = Array.isArray(peers) ? peers : [];
  if (table.length < 2) return null;

  const comparisons = (["pe", "pb", "roe"] as const)
    .map((metric) =>
      compareMetric(
        metric,
        metric === "pe" ? num(metrics?.peRatio) : metric === "pb" ? num(metrics?.pbRatio) : num(metrics?.roe),
        table
      )
    )
    .filter((comparison): comparison is PeerMetricComparison => comparison !== null);

  const marketCap = num(metrics?.marketCap);
  const peerCaps = table
    .map((peer) => num(peer.marketCap))
    .filter((cap): cap is number => cap !== null && cap > 0);

  let sizeRank: number | null = null;
  let sizeGroup: number | null = null;
  if (marketCap !== null && marketCap > 0 && peerCaps.length >= 2) {
    sizeRank = peerCaps.filter((cap) => cap > marketCap).length + 1;
    sizeGroup = peerCaps.length + 1;
  }

  if (!comparisons.length && sizeRank === null) return null;

  return { comparisons, peerCount: table.length, sizeRank, sizeGroup };
}

// ---------------------------------------------------------------------------
// Analyst consensus
// ---------------------------------------------------------------------------

export type AnalystReport = {
  broker?: string | null;
  action?: string | null;
  targetPrice?: number | null;
  date?: string | null;
};

export type AnalystConsensus = {
  buy: number;
  hold: number;
  sell: number;
  total: number;
  buySharePercent: number;
  /** Plain-language consensus derived from the distribution. */
  rating: "Strong Buy" | "Buy" | "Hold" | "Sell";
  /** Mean of the reported target prices. */
  averageTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  /** Upside to the average target from the current price, as a percentage. */
  upsidePercent: number | null;
  targetCount: number;
};

/**
 * Analyst consensus with the implied upside.
 *
 * The counts alone don't answer the question people are actually asking, which
 * is what the analysts think it's worth. Targets are averaged across whatever
 * brokers reported one, and the spread is kept — a tight cluster and a wild
 * disagreement produce the same mean, and only the range distinguishes them.
 */
export function analystConsensus(
  summary: { buy?: number | null; hold?: number | null; sell?: number | null; total?: number | null } | null | undefined,
  reports: AnalystReport[] | null | undefined,
  currentPrice: number | null | undefined
): AnalystConsensus | null {
  const buy = Math.max(0, num(summary?.buy) ?? 0);
  const hold = Math.max(0, num(summary?.hold) ?? 0);
  const sell = Math.max(0, num(summary?.sell) ?? 0);
  const total = buy + hold + sell;
  if (total === 0) return null;

  const buySharePercent = (buy / total) * 100;
  const sellSharePercent = (sell / total) * 100;

  const rating: AnalystConsensus["rating"] =
    buySharePercent >= 80
      ? "Strong Buy"
      : buySharePercent >= 50
      ? "Buy"
      : sellSharePercent >= 50
      ? "Sell"
      : "Hold";

  const targets = (Array.isArray(reports) ? reports : [])
    .map((report) => num(report.targetPrice))
    .filter((target): target is number => target !== null && target > 0);

  const averageTarget = targets.length
    ? targets.reduce((sum, target) => sum + target, 0) / targets.length
    : null;
  const price = num(currentPrice);
  const upsidePercent =
    averageTarget !== null && price !== null && price > 0
      ? ((averageTarget - price) / price) * 100
      : null;

  return {
    buy,
    hold,
    sell,
    total,
    buySharePercent,
    rating,
    averageTarget,
    highTarget: targets.length ? Math.max(...targets) : null,
    lowTarget: targets.length ? Math.min(...targets) : null,
    upsidePercent,
    targetCount: targets.length,
  };
}
