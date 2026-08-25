/**
 * Concentration analysis for a holdings list.
 *
 * The allocation pie already shows the shape of a portfolio, but reading risk
 * off a pie chart is guesswork — twelve slices look diversified even when one
 * of them is 60% of the money. These turn that shape into figures.
 *
 * Deliberately deterministic and local, alongside the AI portfolio commentary
 * rather than inside it. "You are over-concentrated" is a claim about
 * arithmetic, and a number that changes between two identical runs (or that a
 * model declines to produce during an outage) is not something to build a
 * risk warning on.
 *
 * Positions are weighted by *current* market value, not by what was paid. A
 * winner that has quadrupled is the position now carrying the risk, however
 * modest its original purchase looked.
 *
 * Pure and dependency-free.
 */

export type WeightedPosition = {
  symbol: string;
  companyName?: string;
  /** Current market value of the position. */
  value: number;
};

export type PositionWeight = {
  symbol: string;
  companyName?: string;
  value: number;
  /** Share of the portfolio, 0-100. */
  weightPercent: number;
};

/**
 * A single position above this share of the portfolio is flagged. Not a law of
 * finance — it is the level at which one company's bad quarter stops being a
 * dent and starts setting the portfolio's return, which is the point worth
 * telling someone about.
 */
export const SINGLE_POSITION_WARNING_PERCENT = 25;

/** Effective holdings below this read as concentrated however many rows exist. */
export const EFFECTIVE_HOLDINGS_WARNING = 5;

export type ConcentrationRisk = {
  positions: PositionWeight[];
  holdingCount: number;
  totalValue: number;
  /**
   * Herfindahl-Hirschman Index over the weights, 0-10000. The sum of squared
   * percentage weights: 10000 is everything in one stock, and an evenly split
   * portfolio of N holdings scores 10000/N.
   */
  hhi: number;
  /**
   * 10000 / HHI — how many equally-sized holdings would carry the same
   * concentration. This is the figure worth showing: "your 12 holdings behave
   * like 3" lands in a way an index number between 0 and 10000 does not.
   */
  effectiveHoldings: number;
  /** Weight of the single largest position, 0-100. */
  topWeightPercent: number;
  /** Combined weight of the largest three and five positions. */
  topThreePercent: number;
  topFivePercent: number;
  /** 0-100, higher is better diversified. */
  diversificationScore: number;
  level: "concentrated" | "moderate" | "diversified";
  /** Plain-language observations, most important first. Possibly empty. */
  flags: string[];
};

/**
 * Merge duplicate symbols before weighting.
 *
 * The portfolio allows the same stock to be held as several rows (bought in
 * tranches, or imported twice from a broker statement). Left separate, each
 * tranche looks like an independent position and the portfolio scores as more
 * diversified than it is — precisely inverting the measure.
 */
function mergeBySymbol(positions: WeightedPosition[]): WeightedPosition[] {
  const merged = new Map<string, WeightedPosition>();
  for (const position of positions) {
    const symbol = String(position?.symbol ?? "").trim().toUpperCase();
    const value = Number(position?.value);
    if (!symbol || !Number.isFinite(value) || value <= 0) continue;
    const existing = merged.get(symbol);
    if (existing) existing.value += value;
    else
      merged.set(symbol, {
        symbol,
        companyName: position.companyName,
        value,
      });
  }
  return [...merged.values()];
}

/**
 * Concentration measures for a set of positions.
 *
 * Returns null when there is nothing to measure — no positions, or none with a
 * usable current value (every price fetch failed). A concentration score built
 * from one priced holding out of twelve would describe a portfolio the user
 * does not have.
 */
export function concentrationRisk(
  positions: WeightedPosition[] | null | undefined
): ConcentrationRisk | null {
  const usable = mergeBySymbol(Array.isArray(positions) ? positions : []);
  if (usable.length === 0) return null;

  const totalValue = usable.reduce((sum, position) => sum + position.value, 0);
  if (!(totalValue > 0)) return null;

  const weighted: PositionWeight[] = usable
    .map((position) => ({
      symbol: position.symbol,
      companyName: position.companyName,
      value: position.value,
      weightPercent: (position.value / totalValue) * 100,
    }))
    .sort((a, b) => b.weightPercent - a.weightPercent);

  const hhi = weighted.reduce((sum, position) => sum + position.weightPercent ** 2, 0);
  // hhi is bounded below by 10000/N > 0 for any non-empty set, so this cannot
  // divide by zero.
  const effectiveHoldings = 10_000 / hhi;

  const sumTop = (count: number) =>
    weighted.slice(0, count).reduce((sum, position) => sum + position.weightPercent, 0);

  const topWeightPercent = weighted[0].weightPercent;
  const topThreePercent = sumTop(3);
  const topFivePercent = sumTop(5);

  /**
   * Scored on effective holdings rather than raw HHI, so the scale is linear in
   * something a person can picture. Ten effective holdings is treated as fully
   * diversified for a retail equity portfolio — past that, adding names buys
   * very little further reduction in single-stock risk.
   */
  const diversificationScore = Math.round(Math.min(100, (effectiveHoldings / 10) * 100));

  const level: ConcentrationRisk["level"] =
    effectiveHoldings < EFFECTIVE_HOLDINGS_WARNING
      ? "concentrated"
      : effectiveHoldings < 8
      ? "moderate"
      : "diversified";

  const flags: string[] = [];
  if (topWeightPercent >= SINGLE_POSITION_WARNING_PERCENT) {
    flags.push(
      `${weighted[0].symbol} is ${topWeightPercent.toFixed(0)}% of the portfolio — its results will drive your returns more than everything else combined.`
    );
  }
  if (weighted.length >= 3 && topThreePercent >= 70) {
    flags.push(
      `The top 3 positions hold ${topThreePercent.toFixed(0)}% of the value, so the remaining ${weighted.length - 3} contribute little to the outcome.`
    );
  }
  if (effectiveHoldings < EFFECTIVE_HOLDINGS_WARNING && weighted.length > effectiveHoldings + 1) {
    flags.push(
      `${weighted.length} holdings, but weighted like ${effectiveHoldings.toFixed(1)} — the count overstates how spread out this is.`
    );
  }
  if (weighted.length === 1) {
    flags.push("A single holding carries the entire portfolio's risk.");
  }

  return {
    positions: weighted,
    holdingCount: weighted.length,
    totalValue,
    hhi,
    effectiveHoldings,
    topWeightPercent,
    topThreePercent,
    topFivePercent,
    diversificationScore,
    level,
    flags,
  };
}
