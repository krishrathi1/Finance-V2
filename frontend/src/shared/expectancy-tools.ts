/**
 * Whether a trading system makes money, and how much to risk on it.
 *
 * Every other calculator here prices a single trade. These two price the
 * *system* — and they are the ones that decide whether the rest matter,
 * because no entry, stop or position size rescues a negative edge. A trader
 * with a 70% win rate can still lose money, and a trader winning 35% of the
 * time can compound steadily; only the interaction of hit rate and payoff
 * says which.
 *
 * Two things this deliberately refuses to flatter:
 *
 *  - **Negative expectancy is reported as negative, and Kelly then returns a
 *    zero stake rather than a small one.** A losing system does not have a
 *    correct bet size; it has a correct decision, which is not to bet. Scaling
 *    down would imply otherwise.
 *  - **Full Kelly is shown alongside half Kelly, and the half is the one
 *    presented as usable.** Full Kelly is growth-optimal only given exact,
 *    unchanging probabilities — which no discretionary trader has — and its
 *    drawdowns are severe enough that most people abandon the system before
 *    the maths pays off. Quoting the full figure without that context is how
 *    a formula becomes a blown account.
 *
 * Pure and dependency-free.
 */

const roundTo = (value: number, factor: number): number => {
  const scaled = Math.round(value * factor);
  return Number.isFinite(scaled) ? scaled / factor : value;
};
const round2 = (value: number): number => roundTo(value, 100);
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export type ExpectancyInput = {
  /** Share of trades that win, 0-100. */
  winRatePercent: number;
  /** Average rupee gain on a winning trade. */
  averageWin: number;
  /** Average rupee loss on a losing trade, as a positive number. */
  averageLoss: number;
  /** Optional: trades per year, to project the edge over a period. */
  tradesPerYear?: number;
};

export type Expectancy = {
  /** Expected rupees per trade. Negative means the system loses money. */
  perTrade: number;
  /** Expectancy expressed in units of risk — the comparable figure. */
  perTradeR: number;
  /** Gross wins divided by gross losses. Above 1 is profitable. */
  profitFactor: number;
  /** Payoff ratio: average win over average loss. */
  rewardRiskRatio: number;
  /** The win rate this payoff ratio needs merely to break even. */
  breakevenWinRatePercent: number;
  /** How far the actual win rate sits above (or below) breakeven, in points. */
  edgePercentagePoints: number;
  profitable: boolean;
  /** Expected annual result, when a trade count was supplied. */
  annualExpectancy: number | null;
};

/**
 * The expected value of one trade, and the win rate the payoff demands.
 *
 * `breakevenWinRatePercent` is the number most worth reading: a 1:1 system
 * needs to win more than half its trades to make anything, which is why
 * "I win more than I lose" is not on its own evidence of an edge.
 */
export function tradingExpectancy(input: ExpectancyInput): Expectancy | null {
  if (!input || typeof input !== "object") return null;
  const { winRatePercent, averageWin, averageLoss } = input;

  if (!Number.isFinite(winRatePercent) || winRatePercent < 0 || winRatePercent > 100) return null;
  if (!isFinitePositive(averageWin) || !isFinitePositive(averageLoss)) return null;

  const winRate = winRatePercent / 100;
  const lossRate = 1 - winRate;

  const perTrade = winRate * averageWin - lossRate * averageLoss;
  const rewardRiskRatio = averageWin / averageLoss;
  // In R terms: how many multiples of the risk taken the average trade returns.
  const perTradeR = perTrade / averageLoss;

  const grossWins = winRate * averageWin;
  const grossLosses = lossRate * averageLoss;
  // A system that never loses has no finite profit factor; reporting Infinity
  // would violate this module's own contract, so the ratio is capped at a
  // value that plainly reads as "no losses recorded".
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0;

  // Break even when winRate * win = (1 - winRate) * loss, i.e. at
  // 1 / (1 + reward:risk).
  const breakevenWinRatePercent = (1 / (1 + rewardRiskRatio)) * 100;

  const tradesPerYear = isFinitePositive(input.tradesPerYear) ? input.tradesPerYear : null;
  const annualExpectancy = tradesPerYear !== null ? perTrade * tradesPerYear : null;

  if (![perTrade, perTradeR, profitFactor, breakevenWinRatePercent].every(Number.isFinite)) {
    return null;
  }

  const perTradeRounded = round2(perTrade);
  return {
    perTrade: perTradeRounded,
    perTradeR: round2(perTradeR),
    profitFactor: round2(profitFactor),
    rewardRiskRatio: round2(rewardRiskRatio),
    breakevenWinRatePercent: round2(breakevenWinRatePercent),
    edgePercentagePoints: round2(winRatePercent - breakevenWinRatePercent),
    profitable: perTradeRounded > 0,
    annualExpectancy:
      annualExpectancy !== null && Number.isFinite(annualExpectancy)
        ? round2(annualExpectancy)
        : null,
  };
}

export type KellyInput = {
  winRatePercent: number;
  averageWin: number;
  averageLoss: number;
  /** Capital the stake is a share of, to express Kelly in rupees. */
  capital?: number;
};

export type KellyStake = {
  /** The growth-optimal share of capital, 0-100. Zero on a losing system. */
  fullKellyPercent: number;
  /** Half Kelly — the figure meant to be used. */
  halfKellyPercent: number;
  /** Rupee stake at half Kelly, when capital was supplied. */
  halfKellyAmount: number | null;
  /** True when the edge is negative and the correct stake is nothing. */
  noEdge: boolean;
};

/**
 * The Kelly criterion stake, and the half-Kelly figure meant to be used.
 *
 * Kelly maximises the long-run growth rate given a known edge:
 * `f = W - (1 - W) / R`, where R is the payoff ratio. Its assumptions —
 * exactly known probabilities, a payoff that never drifts, and the emotional
 * capacity to sit through the drawdowns it produces — are ones no
 * discretionary trader actually has, which is why the practitioner convention
 * is to halve it. Half Kelly gives roughly three-quarters of the growth for
 * substantially less than half the drawdown, and that trade is the reason it
 * is the default here rather than a footnote.
 *
 * A negative edge yields a zero stake, not a small one. There is no bet size
 * that makes a losing system profitable, and returning a fraction of one
 * would imply there is.
 */
export function kellyStake(input: KellyInput): KellyStake | null {
  if (!input || typeof input !== "object") return null;
  const { winRatePercent, averageWin, averageLoss } = input;

  if (!Number.isFinite(winRatePercent) || winRatePercent < 0 || winRatePercent > 100) return null;
  if (!isFinitePositive(averageWin) || !isFinitePositive(averageLoss)) return null;

  const winRate = winRatePercent / 100;
  const payoffRatio = averageWin / averageLoss;
  const raw = winRate - (1 - winRate) / payoffRatio;
  if (!Number.isFinite(raw)) return null;

  // Clamped at zero (no edge, no stake) and at one (never stake more than the
  // capital, which an extreme payoff ratio would otherwise suggest).
  const fullKelly = Math.min(1, Math.max(0, raw));
  const halfKelly = fullKelly / 2;

  const capital = isFinitePositive(input.capital) ? input.capital : null;
  const halfKellyAmount = capital !== null ? capital * halfKelly : null;

  return {
    fullKellyPercent: round2(fullKelly * 100),
    halfKellyPercent: round2(halfKelly * 100),
    halfKellyAmount:
      halfKellyAmount !== null && Number.isFinite(halfKellyAmount)
        ? round2(halfKellyAmount)
        : null,
    noEdge: raw <= 0,
  };
}
