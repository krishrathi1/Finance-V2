/**
 * Shareholding trend across the reported quarters.
 *
 * The dashboard receives up to twenty quarters of promoter/FII/DII/public
 * splits and renders a *picker*: choose a quarter, see that quarter. That
 * shows the data without answering the question it exists for — which way is
 * each holder class moving. Promoters steadily reducing their stake is the
 * single most watched red flag in Indian retail investing, and it is invisible
 * one quarter at a time.
 *
 * ## Zero is not a holding
 *
 * The feed reports an unbroken run of `fii: 0` for older quarters and then a
 * real figure once the provider starts breaking it out — RELIANCE shows 0
 * across nineteen quarters, then 28.12, with `public` dropping by the same
 * amount in the same quarter. Read literally that is a 28-point FII raid; it
 * is a change in reporting. So a class is only compared between quarters that
 * both report it, and a series that is mostly unreported is marked unreliable
 * rather than being turned into a headline.
 *
 * Pure and dependency-free.
 */

export type ShareholdingPoint = {
  /** "2026-06-30". */
  quarter: string;
  promoters?: number | null;
  fii?: number | null;
  dii?: number | null;
  public?: number | null;
};

export type HolderKey = "promoters" | "fii" | "dii" | "public";

export type HolderTrend = {
  key: HolderKey;
  label: string;
  /** Most recent reported stake, as a percentage. */
  latest: number;
  /** Change over roughly a year (four quarters back), in percentage points. */
  changeOneYearPoints: number | null;
  /** Change across the whole reported series, in percentage points. */
  changeFullPoints: number | null;
  /** Quarters that actually reported this class. */
  quartersReported: number;
  /**
   * False when the filing format changed during the series in a way that makes
   * this class's own history incomparable — see `signatureOf`. Both change
   * figures are null in that case rather than reporting a move that never
   * happened.
   */
  comparable: boolean;
  direction: "up" | "down" | "flat";
};

export type ShareholdingTrend = {
  latestQuarter: string;
  trends: HolderTrend[];
  /**
   * Plain-language observations, most important first. Promoter movement leads
   * because it is the one with a well-established signal attached to it.
   */
  flags: string[];
  /** Quarters in the series. */
  quarters: number;
};

const LABELS: Record<HolderKey, string> = {
  promoters: "Promoters",
  fii: "Foreign institutions",
  dii: "Domestic institutions",
  public: "Public",
};

/**
 * A stake reported for this quarter, or null.
 *
 * Zero is treated as "not reported" rather than "holds nothing". A genuine
 * zero and an unreported class are indistinguishable in this feed, and the
 * costly mistake is the other way round: reading an unreported run as a real
 * holding manufactures enormous swings the moment reporting starts.
 */
function stake(point: ShareholdingPoint, key: HolderKey): number | null {
  const value = Number(point?.[key]);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value;
}

const QUARTERS_PER_YEAR = 4;
/** Below this, a move is reporting noise rather than a change in ownership. */
const MATERIAL_POINTS = 0.5;

/**
 * Summarise how each holder class has moved.
 *
 * Returns null when there is nothing to compare — fewer than two quarters, or
 * no class reported in any of them.
 */
export function shareholdingTrend(
  history: ShareholdingPoint[] | null | undefined
): ShareholdingTrend | null {
  const points = (Array.isArray(history) ? history : [])
    .filter((point) => typeof point?.quarter === "string" && point.quarter.trim())
    // Newest last, so index arithmetic below reads forwards in time.
    .sort((a, b) => String(a.quarter).localeCompare(String(b.quarter)));

  if (points.length < 2) return null;

  /**
   * Which classes a quarter breaks out, as a stable signature.
   *
   * `public` is a residual — it is whatever is not held by promoters, and a
   * provider that does not break FII out folds it in there. So the quarter
   * FII starts being reported, `public` drops by the whole FII stake without
   * a single share changing hands. RELIANCE shows exactly this: public falls
   * 49.9% -> 21.4% as fii appears at 28.12%, which read literally is a 28-point
   * exodus and is actually a change in the filing format.
   *
   * Promoters, FII and DII are directly reported figures and stay comparable
   * across the boundary; `public` does not, so its comparison is withheld when
   * the signature changes rather than published as a movement.
   */
  const signatureOf = (point: ShareholdingPoint) =>
    (["promoters", "fii", "dii"] as HolderKey[])
      .filter((key) => stake(point, key) !== null)
      .join("|");

  const signatures = new Set(points.map(signatureOf));
  const reportingChanged = signatures.size > 1;

  const trends: HolderTrend[] = [];
  let latestReportedQuarter = "";

  for (const key of ["promoters", "fii", "dii", "public"] as HolderKey[]) {
    const reported = points.filter((point) => stake(point, key) !== null);
    if (reported.length < 2) continue;

    // The most recent quarter that actually reported this class, rather than
    // the most recent row. One unusable latest row — a provider glitch, a
    // placeholder — would otherwise discard an entire usable series.
    const latestPoint = reported[reported.length - 1];
    const latest = stake(latestPoint, key)!;
    if (String(latestPoint.quarter) > latestReportedQuarter) {
      latestReportedQuarter = String(latestPoint.quarter);
    }

    // A year back means four quarters back *in the reported series*, so gaps
    // don't silently turn a two-year comparison into a "1Y" figure.
    const comparable = !(key === "public" && reportingChanged);

    const yearAgo = reported[reported.length - 1 - QUARTERS_PER_YEAR];
    const changeOneYearPoints = comparable && yearAgo ? latest - stake(yearAgo, key)! : null;
    const changeFullPoints = comparable ? latest - stake(reported[0], key)! : null;

    trends.push({
      key,
      label: LABELS[key],
      latest,
      changeOneYearPoints,
      changeFullPoints,
      comparable,
      quartersReported: reported.length,
      direction:
        changeFullPoints === null || Math.abs(changeFullPoints) < MATERIAL_POINTS
          ? "flat"
          : changeFullPoints > 0
          ? "up"
          : "down",
    });
  }

  if (!trends.length) return null;

  const flags: string[] = [];
  const promoters = trends.find((trend) => trend.key === "promoters");
  const fii = trends.find((trend) => trend.key === "fii");
  const dii = trends.find((trend) => trend.key === "dii");

  if (promoters && promoters.comparable) {
    const change = promoters.changeOneYearPoints ?? promoters.changeFullPoints;
    if (change !== null && change <= -MATERIAL_POINTS) {
      flags.push(
        `Promoters have cut their stake by ${Math.abs(change).toFixed(2)} points to ${promoters.latest.toFixed(2)}%. Sustained promoter selling is worth understanding before buying.`
      );
    } else if (change !== null && change >= MATERIAL_POINTS) {
      flags.push(
        `Promoters have added ${change.toFixed(2)} points, taking their stake to ${promoters.latest.toFixed(2)}%. Insiders buying their own company is the cheapest vote of confidence available.`
      );
    }
  }

  for (const institution of [fii, dii]) {
    if (!institution || !institution.comparable) continue;
    const change = institution.changeOneYearPoints;
    if (change === null || Math.abs(change) < MATERIAL_POINTS) continue;
    flags.push(
      `${institution.label} ${change > 0 ? "increased" : "reduced"} their holding by ${Math.abs(change).toFixed(2)} points over the last four reported quarters, to ${institution.latest.toFixed(2)}%.`
    );
  }

  return {
    latestQuarter: latestReportedQuarter,
    trends,
    flags,
    quarters: points.length,
  };
}
