/**
 * The case for and the case against, built from signals the page already
 * computes.
 *
 * Every other card here answers one question well. None of them makes the
 * reader hold two answers at once, which is the part that actually decides
 * whether someone should own a stock. A page of thirty green and amber badges
 * is easy to read selectively: a buyer notices the cheap multiple, a sceptic
 * notices the promoter selling, and both leave believing the page agreed with
 * them.
 *
 * So this deliberately does three things a score cannot:
 *
 *  1. **States both sides in full**, with the number behind each claim, so a
 *     bull argument and a bear argument sit at the same size on the screen.
 *  2. **Names the tensions** — the pairs where two credible signals point
 *     opposite ways. That contradiction is not noise to be averaged away; it
 *     is precisely where the thinking has to happen, and averaging it into a
 *     single 7.4/10 is how a page hides its most useful information.
 *  3. **Says what would change the view.** A thesis that cannot be falsified
 *     is a preference, and naming the disconfirming evidence up front is what
 *     separates the two.
 *
 * The balance figure is a summary of the arguments, not a recommendation, and
 * is deliberately not called a score. Nothing here is advice.
 *
 * Pure and dependency-free: every input is a number or flag the caller has
 * already computed, so the reasoning is directly testable.
 */

export type ThesisCategory =
  | "valuation"
  | "growth"
  | "quality"
  | "financial-health"
  | "momentum"
  | "ownership"
  | "income"
  | "risk";

export type ThesisSignal = {
  key: string;
  side: "bull" | "bear";
  /** 1 = worth noting, 2 = substantive, 3 = decisive on its own. */
  strength: 1 | 2 | 3;
  category: ThesisCategory;
  /** The claim, with the number that supports it. */
  claim: string;
  /** Why it matters — the reasoning, not a restatement. */
  detail: string;
};

export type ThesisTension = {
  /** The bull signal's claim. */
  bull: string;
  /** The bear signal's claim. */
  bear: string;
  /** The question the reader has to answer for themselves. */
  question: string;
};

export type InvestmentThesis = {
  bull: ThesisSignal[];
  bear: ThesisSignal[];
  bullScore: number;
  bearScore: number;
  /** -100 (entirely bearish) to +100 (entirely bullish). */
  balance: number;
  stance: "constructive" | "mixed" | "cautious";
  tensions: ThesisTension[];
  /** Specific, checkable things that would change the picture. */
  watchItems: string[];
  /** How many of the possible signals had data behind them. */
  evaluated: number;
  /** How many were possible in principle. */
  possible: number;
};

/**
 * Everything the thesis reasons over. All optional: a stock missing a
 * statement, a peer group or a dividend history simply contributes fewer
 * signals rather than dropping the whole card.
 */
export type ThesisInput = {
  // Valuation
  peRatio?: number | null;
  peerMedianPe?: number | null;
  pegRatio?: number | null;
  freeCashFlowYieldPercent?: number | null;
  // Growth
  revenueCagrPercent?: number | null;
  profitCagrPercent?: number | null;
  // Quality
  roePercent?: number | null;
  piotroskiScore?: number | null;
  piotroskiTestable?: number | null;
  cashConversionRatio?: number | null;
  // Financial health
  debtToEquity?: number | null;
  interestCoverage?: number | null;
  altmanZ?: number | null;
  // Momentum / price
  priceVsSma200Percent?: number | null;
  rsi?: number | null;
  rangePositionPercent?: number | null;
  // Risk
  maxDrawdownPercent?: number | null;
  annualisedVolatilityPercent?: number | null;
  /** Share of rolling multi-year windows that beat a fixed deposit, 0-100. */
  rollingBeatBenchmarkPercent?: number | null;
  currentlyUnderwaterPercent?: number | null;
  // Ownership
  promoterChangePoints?: number | null;
  promoterStakePercent?: number | null;
  // Income
  dividendYieldPercent?: number | null;
  dividendStreakYears?: number | null;
};

/**
 * Below this the card is withheld.
 *
 * Set at three rather than higher because most rules only fire at the edges of
 * their band, and a large, unremarkable business sits inside nearly all of
 * them — RELIANCE trips the valuation rules and little else. Requiring four
 * hid the card for exactly the widely-held blue chips people most often look
 * up, which is the opposite of useful. Three substantive arguments, each with
 * its number and shown alongside the honest "N of 19 checks had data" count,
 * is a real case; two is a coincidence.
 */
const MIN_SIGNALS = 3;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

/**
 * Every rule the thesis can apply.
 *
 * Each returns a signal or null. Written as a flat list rather than nested
 * conditionals so the count of *possible* signals is knowable, which is what
 * lets the card say "14 of 22 could be assessed" instead of implying the
 * silence of the other eight means agreement.
 */
type Rule = (input: ThesisInput) => ThesisSignal | null;

const RULES: Rule[] = [
  // ── Valuation ──────────────────────────────────────────────────────────
  (i) => {
    const pe = num(i.peRatio);
    const peer = num(i.peerMedianPe);
    if (pe === null || peer === null || pe <= 0 || peer <= 0) return null;
    const premium = ((pe - peer) / peer) * 100;
    if (premium <= -20) {
      return {
        key: "pe-vs-peers",
        side: "bull",
        strength: 2,
        category: "valuation",
        claim: `Trades at ${pe.toFixed(1)}x earnings against a peer median of ${peer.toFixed(1)}x`,
        detail:
          "A discount to comparable businesses is either an opportunity or the market pricing in something the peers do not have. Worth knowing which.",
      };
    }
    if (premium >= 25) {
      return {
        key: "pe-vs-peers",
        side: "bear",
        strength: 2,
        category: "valuation",
        claim: `Trades at ${pe.toFixed(1)}x earnings against a peer median of ${peer.toFixed(1)}x`,
        detail:
          "A premium multiple has to be earned by growth or durability that peers lack. If it is not, the rating is the risk.",
      };
    }
    return null;
  },
  (i) => {
    const peg = num(i.pegRatio);
    if (peg === null || peg <= 0) return null;
    if (peg < 1) {
      return {
        key: "peg",
        side: "bull",
        strength: 1,
        category: "valuation",
        claim: `PEG of ${peg.toFixed(2)} — growth is cheap relative to the multiple`,
        detail: "Below 1 the market is paying less per unit of growth than the growth rate itself implies.",
      };
    }
    if (peg > 2.5) {
      return {
        key: "peg",
        side: "bear",
        strength: 1,
        category: "valuation",
        claim: `PEG of ${peg.toFixed(2)} — the multiple runs well ahead of growth`,
        detail: "Above 2.5 the price already assumes growth well beyond what has been delivered.",
      };
    }
    return null;
  },
  (i) => {
    const fcfy = num(i.freeCashFlowYieldPercent);
    if (fcfy === null) return null;
    if (fcfy >= 5) {
      return {
        key: "fcf-yield",
        side: "bull",
        strength: 2,
        category: "valuation",
        claim: `Free cash flow yield of ${pct(fcfy)}`,
        detail:
          "Cash the business actually generates, against what the market charges for it — the one valuation measure accounting choices cannot flatter.",
      };
    }
    if (fcfy < 0) {
      return {
        key: "fcf-yield",
        side: "bear",
        strength: 2,
        category: "valuation",
        claim: `Free cash flow is negative (${pct(fcfy)} yield)`,
        detail: "The business consumed more cash than it produced. Sustainable only while funding stays available.",
      };
    }
    return null;
  },

  // ── Growth ─────────────────────────────────────────────────────────────
  (i) => {
    const revenue = num(i.revenueCagrPercent);
    if (revenue === null) return null;
    if (revenue >= 15) {
      return {
        key: "revenue-growth",
        side: "bull",
        strength: 2,
        category: "growth",
        claim: `Revenue compounding at ${pct(revenue)} a year`,
        detail: "Sustained top-line growth is harder to engineer than profit growth and usually leads it.",
      };
    }
    if (revenue < 0) {
      return {
        key: "revenue-growth",
        side: "bear",
        strength: 3,
        category: "growth",
        claim: `Revenue shrinking at ${pct(Math.abs(revenue))} a year`,
        detail:
          "A shrinking top line puts a ceiling on everything else — cost control can protect margins for a while, not indefinitely.",
      };
    }
    return null;
  },
  (i) => {
    const profit = num(i.profitCagrPercent);
    const revenue = num(i.revenueCagrPercent);
    if (profit === null) return null;
    if (profit >= 20) {
      return {
        key: "profit-growth",
        side: "bull",
        strength: 2,
        category: "growth",
        claim: `Profit compounding at ${pct(profit)} a year`,
        detail:
          revenue !== null && profit > revenue
            ? "Profit growing faster than revenue means margins are expanding, not just volume."
            : "Sustained earnings growth is what a multiple ultimately rests on.",
      };
    }
    if (profit < 0) {
      return {
        key: "profit-growth",
        side: "bear",
        strength: 2,
        category: "growth",
        claim: `Profit declining at ${pct(Math.abs(profit))} a year`,
        detail: "Falling earnings against a static price means the multiple is quietly expanding.",
      };
    }
    return null;
  },

  // ── Quality ────────────────────────────────────────────────────────────
  (i) => {
    const roe = num(i.roePercent);
    if (roe === null) return null;
    if (roe >= 18) {
      return {
        key: "roe",
        side: "bull",
        strength: 2,
        category: "quality",
        claim: `Return on equity of ${pct(roe)}`,
        detail: "A high, sustained ROE is the clearest evidence that reinvested profit compounds rather than leaks.",
      };
    }
    if (roe < 8) {
      return {
        key: "roe",
        side: "bear",
        strength: 2,
        category: "quality",
        claim: `Return on equity of only ${pct(roe)}`,
        detail: "Below the cost of capital, growth destroys value rather than creating it.",
      };
    }
    return null;
  },
  (i) => {
    const score = num(i.piotroskiScore);
    const testable = num(i.piotroskiTestable);
    if (score === null || testable === null || testable < 5) return null;
    const share = score / testable;
    if (share >= 0.75) {
      return {
        key: "piotroski",
        side: "bull",
        strength: 2,
        category: "quality",
        claim: `Passes ${score} of ${testable} applicable Piotroski checks`,
        detail: "The fundamentals improved year on year across profitability, leverage and efficiency together.",
      };
    }
    if (share <= 0.35) {
      return {
        key: "piotroski",
        side: "bear",
        strength: 2,
        category: "quality",
        claim: `Passes only ${score} of ${testable} applicable Piotroski checks`,
        detail: "Broad year-on-year deterioration rather than one weak line.",
      };
    }
    return null;
  },
  (i) => {
    const conversion = num(i.cashConversionRatio);
    if (conversion === null) return null;
    if (conversion >= 1) {
      return {
        key: "cash-conversion",
        side: "bull",
        strength: 2,
        category: "quality",
        claim: `Operating cash flow is ${conversion.toFixed(2)}x reported profit`,
        detail: "Reported profit is arriving as actual cash, which is the check that catches aggressive revenue recognition.",
      };
    }
    if (conversion < 0.7) {
      return {
        key: "cash-conversion",
        side: "bear",
        strength: 3,
        category: "quality",
        claim: `Operating cash flow is only ${conversion.toFixed(2)}x reported profit`,
        detail:
          "Persistently below 1 is the classic signature of profit recognised long before it is collected. Worth reading the receivables note.",
      };
    }
    return null;
  },

  // ── Financial health ───────────────────────────────────────────────────
  (i) => {
    const de = num(i.debtToEquity);
    if (de === null || de < 0) return null;
    if (de <= 0.3) {
      return {
        key: "leverage",
        side: "bull",
        strength: 2,
        category: "financial-health",
        claim: `Debt-to-equity of ${de.toFixed(2)} — effectively unlevered`,
        detail: "A clean balance sheet decides who survives a downturn and who is forced to raise at the bottom.",
      };
    }
    if (de >= 2) {
      return {
        key: "leverage",
        side: "bear",
        strength: 3,
        category: "financial-health",
        claim: `Debt-to-equity of ${de.toFixed(2)}`,
        detail: "Heavy leverage magnifies both directions and removes the option to wait out a bad year.",
      };
    }
    return null;
  },
  (i) => {
    const coverage = num(i.interestCoverage);
    if (coverage === null) return null;
    if (coverage < 2) {
      return {
        key: "interest-cover",
        side: "bear",
        strength: 3,
        category: "financial-health",
        claim: `Operating profit covers interest only ${coverage.toFixed(1)}x`,
        detail: "Below about 2x, one weak year turns a debt load into a solvency question.",
      };
    }
    if (coverage >= 8) {
      return {
        key: "interest-cover",
        side: "bull",
        strength: 1,
        category: "financial-health",
        claim: `Interest covered ${coverage.toFixed(1)}x by operating profit`,
        detail: "Debt service is comfortably inside normal earnings.",
      };
    }
    return null;
  },
  (i) => {
    const z = num(i.altmanZ);
    if (z === null) return null;
    if (z < 1.81) {
      return {
        key: "altman",
        side: "bear",
        strength: 3,
        category: "financial-health",
        claim: `Altman Z-Score of ${z.toFixed(2)} — distress zone`,
        detail: "A composite distress signal, not a prediction. It warrants reading the balance sheet directly.",
      };
    }
    if (z >= 3) {
      return {
        key: "altman",
        side: "bull",
        strength: 1,
        category: "financial-health",
        claim: `Altman Z-Score of ${z.toFixed(2)} — safe zone`,
        detail: "The composite distress model sees no balance-sheet stress.",
      };
    }
    return null;
  },

  // ── Momentum ───────────────────────────────────────────────────────────
  (i) => {
    const vs200 = num(i.priceVsSma200Percent);
    if (vs200 === null) return null;
    if (vs200 >= 10) {
      return {
        key: "trend",
        side: "bull",
        strength: 1,
        category: "momentum",
        claim: `Trading ${pct(vs200)} above its 200-day average`,
        detail: "A durable uptrend. Momentum is the weakest kind of evidence here, but it is not nothing.",
      };
    }
    if (vs200 <= -10) {
      return {
        key: "trend",
        side: "bear",
        strength: 1,
        category: "momentum",
        claim: `Trading ${pct(Math.abs(vs200))} below its 200-day average`,
        detail: "A sustained downtrend. Cheap and falling is the hardest combination to hold.",
      };
    }
    return null;
  },
  (i) => {
    const value = num(i.rsi);
    if (value === null) return null;
    if (value >= 75) {
      return {
        key: "rsi",
        side: "bear",
        strength: 1,
        category: "momentum",
        claim: `RSI of ${value.toFixed(0)} — extended`,
        detail: "Short-term stretched. It says nothing about the business, only about the recent pace of buying.",
      };
    }
    if (value <= 28) {
      return {
        key: "rsi",
        side: "bull",
        strength: 1,
        category: "momentum",
        claim: `RSI of ${value.toFixed(0)} — heavily sold`,
        detail: "Short-term washed out. A weak signal on its own, and no substitute for the reason it fell.",
      };
    }
    return null;
  },

  // ── Risk ───────────────────────────────────────────────────────────────
  (i) => {
    const beat = num(i.rollingBeatBenchmarkPercent);
    if (beat === null) return null;
    if (beat >= 70) {
      return {
        key: "rolling-consistency",
        side: "bull",
        strength: 3,
        category: "risk",
        claim: `${beat.toFixed(0)}% of multi-year holding periods beat a fixed deposit`,
        detail:
          "Measured across every start date, not the one ending today — which is what separates a genuine compounder from a well-timed chart.",
      };
    }
    if (beat <= 35) {
      return {
        key: "rolling-consistency",
        side: "bear",
        strength: 3,
        category: "risk",
        claim: `Only ${beat.toFixed(0)}% of multi-year holding periods beat a fixed deposit`,
        detail:
          "Across most entry points this did not pay for the risk taken. The headline return depended heavily on when you bought.",
      };
    }
    return null;
  },
  (i) => {
    const drawdown = num(i.maxDrawdownPercent);
    if (drawdown === null) return null;
    if (drawdown <= -50) {
      return {
        key: "drawdown",
        side: "bear",
        strength: 2,
        category: "risk",
        claim: `Has fallen ${pct(Math.abs(drawdown))} peak to trough`,
        detail: "The honest question is not whether that could recur but whether you would still be holding when it did.",
      };
    }
    return null;
  },
  (i) => {
    const volatility = num(i.annualisedVolatilityPercent);
    if (volatility === null) return null;
    if (volatility >= 45) {
      return {
        key: "volatility",
        side: "bear",
        strength: 1,
        category: "risk",
        claim: `Annualised volatility of ${pct(volatility, 0)}`,
        detail: "Position size, not conviction, is what makes a holding this volatile survivable.",
      };
    }
    return null;
  },
  (i) => {
    const underwater = num(i.currentlyUnderwaterPercent);
    if (underwater === null || underwater >= 0) return null;
    if (underwater <= -25) {
      return {
        key: "underwater",
        side: "bear",
        strength: 1,
        category: "risk",
        claim: `Currently ${pct(Math.abs(underwater))} below its previous high`,
        detail: "Either the market is wrong about the last year, or something changed. Both are worth naming explicitly.",
      };
    }
    return null;
  },

  // ── Ownership ──────────────────────────────────────────────────────────
  (i) => {
    const change = num(i.promoterChangePoints);
    const stake = num(i.promoterStakePercent);
    if (change === null || stake === null) return null;
    if (change <= -1) {
      return {
        key: "promoter",
        side: "bear",
        strength: 3,
        category: "ownership",
        claim: `Promoters cut their stake by ${Math.abs(change).toFixed(2)} points, to ${stake.toFixed(2)}%`,
        detail:
          "The people with the most information reduced their exposure. There are innocent explanations, and they are worth finding before buying.",
      };
    }
    if (change >= 1) {
      return {
        key: "promoter",
        side: "bull",
        strength: 2,
        category: "ownership",
        claim: `Promoters added ${change.toFixed(2)} points, to ${stake.toFixed(2)}%`,
        detail: "Insiders increasing their own exposure is the cheapest and least ambiguous signal available.",
      };
    }
    return null;
  },

  // ── Income ─────────────────────────────────────────────────────────────
  (i) => {
    const yieldPercent = num(i.dividendYieldPercent);
    const streak = num(i.dividendStreakYears);
    if (yieldPercent === null || yieldPercent <= 0) return null;
    if (yieldPercent >= 2.5 && (streak ?? 0) >= 5) {
      return {
        key: "dividend",
        side: "bull",
        strength: 2,
        category: "income",
        claim: `Yields ${pct(yieldPercent, 2)} and has paid for ${streak} straight years`,
        detail: "A long unbroken record is a stronger signal than the yield itself — it is hard to fake and expensive to break.",
      };
    }
    if (yieldPercent >= 2.5) {
      return {
        key: "dividend",
        side: "bull",
        strength: 1,
        category: "income",
        claim: `Yields ${pct(yieldPercent, 2)}`,
        detail: "A meaningful cash return while the thesis plays out.",
      };
    }
    return null;
  },
];

/**
 * Pairs of signals that, when both fire, pose a question neither answers.
 *
 * These are the entries the reader should spend their time on: a cheap stock
 * whose insiders are selling is not the average of "cheap" and "insiders
 * selling", and a single blended score is exactly the presentation that would
 * lose the distinction.
 */
const TENSION_PAIRS: Array<{ bull: string; bear: string; question: string }> = [
  {
    bull: "pe-vs-peers",
    bear: "promoter",
    question:
      "It is cheaper than its peers while the people who know it best are selling. Which of those two do you think is better informed?",
  },
  {
    bull: "pe-vs-peers",
    bear: "revenue-growth",
    question:
      "The discount to peers may simply be the market pricing in a shrinking business. Is this cheap, or correctly cheap?",
  },
  {
    bull: "profit-growth",
    bear: "cash-conversion",
    question:
      "Profit is growing but not converting to cash. Is that a working-capital cycle you can explain, or profit that has not been collected?",
  },
  {
    bull: "revenue-growth",
    bear: "leverage",
    question: "Growth is being delivered on a heavily levered balance sheet. Does it survive the growth pausing for a year?",
  },
  {
    bull: "roe",
    bear: "leverage",
    question:
      "A high ROE on high debt is partly the leverage rather than the business. Check the DuPont breakdown before crediting it to quality.",
  },
  {
    bull: "trend",
    bear: "rolling-consistency",
    question:
      "It is trending up, but most historical holding periods did not pay off. Are you buying the business or the last few months?",
  },
  {
    bull: "dividend",
    bear: "profit-growth",
    question: "The yield is attractive while earnings fall. Is the payout covered if profits keep declining?",
  },
  {
    bull: "rsi",
    bear: "revenue-growth",
    question: "Oversold, and shrinking. Is this a dislocation or a market that has understood something first?",
  },
];

/** Things worth checking that would move the view either way. */
function buildWatchItems(bull: ThesisSignal[], bear: ThesisSignal[]): string[] {
  const fired = new Set([...bull, ...bear].map((signal) => signal.key));
  const items: string[] = [];

  if (fired.has("cash-conversion") && bear.some((s) => s.key === "cash-conversion")) {
    items.push("Cash conversion returning above 1.0x for two consecutive years would remove the main quality objection.");
  }
  if (fired.has("promoter") && bear.some((s) => s.key === "promoter")) {
    items.push("Promoters halting sales, or buying back in, would materially change the ownership picture.");
  }
  if (fired.has("revenue-growth") && bear.some((s) => s.key === "revenue-growth")) {
    items.push("Two consecutive quarters of revenue growth would end the decline that caps everything else.");
  }
  if (fired.has("leverage") && bear.some((s) => s.key === "leverage")) {
    items.push("Debt-to-equity falling below 1.0 would take the balance sheet out of the argument.");
  }
  if (fired.has("pe-vs-peers") && bull.some((s) => s.key === "pe-vs-peers")) {
    items.push("The discount to peers closing without earnings improving would mean the re-rating, not the business, delivered the return.");
  }
  if (fired.has("rolling-consistency") && bear.some((s) => s.key === "rolling-consistency")) {
    items.push("A longer record of holding periods clearing a deposit rate would strengthen the case for owning it through a cycle.");
  }

  if (!items.length) {
    items.push("Next quarterly results, against the revenue and margin trend shown above, are the nearest test of this picture.");
  }
  return items;
}

/**
 * Build the two-sided case.
 *
 * Returns null when too little could be assessed to be worth showing. A card
 * headed "the case for and against" that rests on two signals invites more
 * confidence than two signals deserve.
 */
export function investmentThesis(input: ThesisInput | null | undefined): InvestmentThesis | null {
  if (!input || typeof input !== "object") return null;

  const signals = RULES.map((rule) => {
    try {
      return rule(input);
    } catch {
      // A single malformed input must not take the whole card down.
      return null;
    }
  }).filter((signal): signal is ThesisSignal => signal !== null);

  if (signals.length < MIN_SIGNALS) return null;

  const bull = signals.filter((signal) => signal.side === "bull");
  const bear = signals.filter((signal) => signal.side === "bear");

  const weight = (list: ThesisSignal[]) => list.reduce((sum, signal) => sum + signal.strength, 0);
  const bullScore = weight(bull);
  const bearScore = weight(bear);
  const total = bullScore + bearScore;
  const balance = total > 0 ? ((bullScore - bearScore) / total) * 100 : 0;

  const byKey = new Map(signals.map((signal) => [signal.key, signal]));
  const tensions: ThesisTension[] = [];
  for (const pair of TENSION_PAIRS) {
    const bullSignal = byKey.get(pair.bull);
    const bearSignal = byKey.get(pair.bear);
    if (bullSignal?.side === "bull" && bearSignal?.side === "bear") {
      tensions.push({ bull: bullSignal.claim, bear: bearSignal.claim, question: pair.question });
    }
  }

  // Strongest arguments first on each side, so the card leads with what
  // actually carries weight rather than whatever the rule order happened to be.
  const byStrength = (a: ThesisSignal, b: ThesisSignal) => b.strength - a.strength;

  return {
    bull: [...bull].sort(byStrength),
    bear: [...bear].sort(byStrength),
    bullScore,
    bearScore,
    balance,
    stance: balance >= 25 ? "constructive" : balance <= -25 ? "cautious" : "mixed",
    tensions,
    watchItems: buildWatchItems(bull, bear),
    evaluated: signals.length,
    possible: RULES.length,
  };
}
