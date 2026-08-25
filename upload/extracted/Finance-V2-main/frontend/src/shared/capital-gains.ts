/**
 * Indian capital-gains tax on the realised equity ledger.
 *
 * `portfolio-returns.ts` already matches sales against purchases FIFO and
 * classifies each lot short- or long-term, because those are the rules the
 * Income Tax Act prescribes for listed equity. It stops one step short of the
 * number the user actually wants in March, which is what they owe. This is
 * that step, and it stays pure so the arithmetic is directly testable.
 *
 * Three things make this more than "gain × rate", and getting any of them
 * wrong produces a confident, plausible, incorrect figure:
 *
 * 1. **The year is not the calendar year.** India's financial year runs
 *    1 April to 31 March. A sale on 2 April belongs to a different tax year
 *    than one on 30 March, and grouping by calendar year silently merges two
 *    assessment years and splits one.
 *
 * 2. **Rates changed mid-year.** The Finance (No. 2) Act 2024 raised STCG
 *    under s.111A from 15% to 20% and LTCG under s.112A from 10% to 12.5%,
 *    and lifted the LTCG exemption from ₹1,00,000 to ₹1,25,000 — all for
 *    transfers made on or after 23 July 2024. FY 2024-25 therefore contains
 *    both regimes, so the rate is resolved per sale date rather than per year.
 *
 * 3. **Losses set off asymmetrically.** A short-term capital loss can be set
 *    off against short-term *and* long-term gains; a long-term loss can only
 *    be set off against long-term gains. Netting everything together
 *    over-relieves a long-term loss and understates the bill.
 *
 * What this deliberately does NOT model: surcharge (income-slab dependent, and
 * this app knows nothing about the user's salary), set-off against gains from
 * assets held elsewhere, and the eight-year carry-forward of unabsorbed losses
 * into later years. Carried-forward losses are surfaced as a figure so the
 * user knows they exist, not silently applied. This is an estimate for
 * planning, not a return — see `TAX_ESTIMATE_DISCLAIMER`.
 */

import type { RealisedLot } from "@/shared/portfolio-returns";

export const TAX_ESTIMATE_DISCLAIMER =
  "Estimate only, for planning. Assumes listed equity taxed under sections 111A and 112A with STT paid, and excludes surcharge, losses carried in from earlier years, and gains held outside this portfolio. Not tax advice.";

/**
 * Health and Education Cess, levied on the tax itself rather than the gain.
 * Applies to every taxpayer regardless of slab, so leaving it out understates
 * the bill by a predictable 4% for everyone.
 */
export const CESS_PERCENT = 4;

export type TaxRegime = {
  /** First sale date, inclusive, at which this schedule applies. */
  effectiveFrom: string;
  label: string;
  /** s.111A — short-term capital gains on listed equity. */
  shortTermPercent: number;
  /** s.112A — long-term capital gains on listed equity. */
  longTermPercent: number;
  /** Annual s.112A exemption, applied to aggregate long-term gains. */
  longTermExemption: number;
};

/**
 * Rate schedules, newest first. Resolution walks this list and takes the first
 * entry whose `effectiveFrom` the sale date has reached, so a ledger holding
 * trades from either side of a Budget is taxed correctly on both.
 */
export const TAX_REGIMES: TaxRegime[] = [
  {
    effectiveFrom: "2024-07-23",
    label: "Finance (No. 2) Act 2024",
    shortTermPercent: 20,
    longTermPercent: 12.5,
    longTermExemption: 125_000,
  },
  {
    effectiveFrom: "0000-01-01",
    label: "Pre-23 July 2024",
    shortTermPercent: 15,
    longTermPercent: 10,
    longTermExemption: 100_000,
  },
];

/** The schedule in force on a given sale date. */
export function regimeForDate(isoDate: string): TaxRegime {
  const date = String(isoDate ?? "");
  for (const regime of TAX_REGIMES) {
    if (date >= regime.effectiveFrom) return regime;
  }
  // Unreachable while the list ends with an open-ended entry, but a missing
  // regime must not become `undefined` propagating into the arithmetic.
  return TAX_REGIMES[TAX_REGIMES.length - 1];
}

/**
 * The Indian financial year containing a date, labelled "2025-26".
 *
 * April starts the year, so January to March belong to the year that began the
 * previous April — the off-by-one that makes calendar-year grouping wrong.
 * Returns null for an unparseable date rather than bucketing it somewhere.
 */
export function indianFinancialYear(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** First and last day of a financial year label, for display and filtering. */
export function financialYearRange(label: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(label ?? "").trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

/** The financial year a date falls in — the one currently open, for "today". */
export function currentFinancialYear(today: string): string | null {
  return indianFinancialYear(today);
}

/** One rate regime's share of a financial year's long-term gains. */
type LongTermSlice = {
  regime: TaxRegime;
  gain: number;
};

export type CapitalGainsBreakdown = {
  /** "2025-26". */
  financialYear: string;
  start: string;
  end: string;
  /** Net short-term result before any cross-bucket set-off. Can be negative. */
  shortTermGain: number;
  /** Net long-term result before exemption or set-off. Can be negative. */
  longTermGain: number;
  /** Short-term amount actually charged, after a short-term loss set-off. */
  taxableShortTerm: number;
  /** Long-term amount charged, after set-off and the s.112A exemption. */
  taxableLongTerm: number;
  /** Exemption consumed this year. */
  exemptionUsed: number;
  /** Exemption still available — the harvesting headroom before 31 March. */
  exemptionRemaining: number;
  /** Headline exemption for the year, from the regime in force. */
  exemptionLimit: number;
  shortTermTax: number;
  longTermTax: number;
  cess: number;
  totalTax: number;
  /**
   * Loss with nothing left to absorb it this year. Carries forward up to eight
   * assessment years if the return is filed on time — reported, not applied.
   */
  carriedForwardLoss: number;
  /** Loss actually used to reduce this year's charge. */
  lossSetOff: number;
  realisedLots: number;
  /** Distinct rate schedules that applied to sales in this year. */
  regimeLabels: string[];
  /** Proceeds and cost across every lot, for a sanity line in the UI. */
  totalProceeds: number;
  totalCostBasis: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Tax on one financial year's realised lots.
 *
 * Exported for direct testing; `capitalGainsByYear` is the usual entry point.
 */
export function taxForLots(financialYear: string, lots: RealisedLot[]): CapitalGainsBreakdown | null {
  const range = financialYearRange(financialYear);
  if (!range) return null;

  let shortTermGain = 0;
  let longTermGain = 0;
  let totalProceeds = 0;
  let totalCostBasis = 0;
  const regimeLabels = new Set<string>();

  // Long-term gains are kept split by rate regime rather than summed, because
  // FY 2024-25 spans a rate change and a single total could only be taxed at
  // one of the two rates.
  const longTermSlices = new Map<string, LongTermSlice>();

  for (const lot of lots) {
    if (!Number.isFinite(lot.realisedPnl)) continue;
    const regime = regimeForDate(lot.sellDate);
    regimeLabels.add(regime.label);
    totalProceeds += Number.isFinite(lot.proceeds) ? lot.proceeds : 0;
    totalCostBasis += Number.isFinite(lot.costBasis) ? lot.costBasis : 0;

    if (lot.term === "long") {
      longTermGain += lot.realisedPnl;
      const slice = longTermSlices.get(regime.effectiveFrom);
      if (slice) slice.gain += lot.realisedPnl;
      else longTermSlices.set(regime.effectiveFrom, { regime, gain: lot.realisedPnl });
    } else {
      shortTermGain += lot.realisedPnl;
    }
  }

  if (lots.length === 0) return null;

  // The exemption limit follows the regime in force at the year's end, which is
  // the one the return is filed under.
  const closingRegime = regimeForDate(range.end);
  const exemptionLimit = closingRegime.longTermExemption;

  // --- Set-off -------------------------------------------------------------
  // A short-term loss may be set off against long-term gains; a long-term loss
  // may not be set off against short-term ones. Applying the relief in one
  // direction only is the whole point.
  const taxableShortTerm = Math.max(0, shortTermGain);
  let shortTermLossRemaining = Math.max(0, -shortTermGain);
  let lossSetOff = 0;

  // Working copy of the gaining slices; relief is deducted from these in place.
  const workingSlices = [...longTermSlices.values()]
    .filter((slice) => slice.gain > 0)
    .map((slice) => ({ regime: slice.regime, gain: slice.gain }));
  let grossPositiveLongTerm = workingSlices.reduce((sum, slice) => sum + slice.gain, 0);
  const longTermLoss = [...longTermSlices.values()]
    .filter((slice) => slice.gain < 0)
    .reduce((sum, slice) => sum - slice.gain, 0);

  /**
   * Spread relief across the gaining slices in proportion to their size, so a
   * loss isn't arbitrarily charged against whichever rate happened to sort
   * first — that choice would change the bill in a year spanning a rate change.
   */
  const applyRelief = (available: number): number => {
    if (available <= 0 || grossPositiveLongTerm <= 0) return 0;
    const absorbed = Math.min(grossPositiveLongTerm, available);
    for (const slice of workingSlices) {
      slice.gain -= absorbed * (slice.gain / grossPositiveLongTerm);
    }
    grossPositiveLongTerm -= absorbed;
    lossSetOff += absorbed;
    return absorbed;
  };

  // Long-term losses net within their own bucket first...
  const longTermLossUsed = applyRelief(longTermLoss);
  // ...then a short-term loss may reduce whatever long-term gain survives.
  shortTermLossRemaining -= applyRelief(shortTermLossRemaining);

  const netLongTerm = grossPositiveLongTerm;
  // A long-term loss with no long-term gain left to absorb it is stranded: it
  // cannot touch short-term gains, so it can only be carried forward.
  const unusedLongTermLoss = longTermLoss - longTermLossUsed;

  // --- Exemption -----------------------------------------------------------
  // Consumed against the highest-taxed slice first. The Act sets one annual
  // limit on aggregate s.112A gains without dictating an order, so the
  // taxpayer-favourable allocation is the one to show — anything else would
  // quote a bill higher than the one they can legitimately file.
  const exemptionUsed = Math.min(exemptionLimit, Math.max(0, netLongTerm));
  let exemptionLeft = exemptionUsed;
  const orderedSlices = [...workingSlices].sort(
    (a, b) => b.regime.longTermPercent - a.regime.longTermPercent
  );

  let longTermTax = 0;
  let taxableLongTerm = 0;
  for (const slice of orderedSlices) {
    if (slice.gain <= 0) continue;
    const relieved = Math.min(slice.gain, exemptionLeft);
    exemptionLeft -= relieved;
    const charged = slice.gain - relieved;
    taxableLongTerm += charged;
    longTermTax += (charged * slice.regime.longTermPercent) / 100;
  }

  // --- Short-term charge ---------------------------------------------------
  // Short-term gains can straddle the rate change too, so they are charged per
  // lot at the rate in force on that sale date.
  let shortTermTax = 0;
  if (taxableShortTerm > 0) {
    const shortTermLots = lots.filter((lot) => lot.term !== "long" && lot.realisedPnl > 0);
    const grossShortTermGains = shortTermLots.reduce((sum, lot) => sum + lot.realisedPnl, 0);
    if (grossShortTermGains > 0) {
      // taxableShortTerm is net of same-bucket losses; apportion it across the
      // gaining lots so each keeps its own rate.
      const scale = taxableShortTerm / grossShortTermGains;
      for (const lot of shortTermLots) {
        const regime = regimeForDate(lot.sellDate);
        shortTermTax += (lot.realisedPnl * scale * regime.shortTermPercent) / 100;
      }
    }
  }

  const cess = ((shortTermTax + longTermTax) * CESS_PERCENT) / 100;

  // Everything no gain could absorb: leftover short-term loss (which could have
  // gone against either bucket) plus long-term loss stranded by the one-way
  // set-off rule.
  const carriedForwardLoss = shortTermLossRemaining + unusedLongTermLoss;

  return {
    financialYear,
    start: range.start,
    end: range.end,
    shortTermGain: round2(shortTermGain),
    longTermGain: round2(longTermGain),
    taxableShortTerm: round2(taxableShortTerm),
    taxableLongTerm: round2(taxableLongTerm),
    exemptionUsed: round2(exemptionUsed),
    exemptionRemaining: round2(Math.max(0, exemptionLimit - exemptionUsed)),
    exemptionLimit,
    shortTermTax: round2(shortTermTax),
    longTermTax: round2(longTermTax),
    cess: round2(cess),
    totalTax: round2(shortTermTax + longTermTax + cess),
    carriedForwardLoss: round2(carriedForwardLoss),
    lossSetOff: round2(lossSetOff),
    realisedLots: lots.length,
    regimeLabels: [...regimeLabels],
    totalProceeds: round2(totalProceeds),
    totalCostBasis: round2(totalCostBasis),
  };
}

/**
 * Every financial year present in the realised ledger, newest first.
 *
 * Years are derived from the data rather than generated from a range, so a
 * ledger with a gap year doesn't render an empty card for it.
 */
export function capitalGainsByYear(lots: RealisedLot[]): CapitalGainsBreakdown[] {
  const byYear = new Map<string, RealisedLot[]>();

  for (const lot of Array.isArray(lots) ? lots : []) {
    const financialYear = indianFinancialYear(lot?.sellDate);
    if (!financialYear) continue;
    const bucket = byYear.get(financialYear);
    if (bucket) bucket.push(lot);
    else byYear.set(financialYear, [lot]);
  }

  return [...byYear.entries()]
    .map(([financialYear, yearLots]) => taxForLots(financialYear, yearLots))
    .filter((breakdown): breakdown is CapitalGainsBreakdown => breakdown !== null)
    .sort((a, b) => b.financialYear.localeCompare(a.financialYear));
}

export type HarvestOpportunity = {
  /** Exemption left in the open year — gains up to this are tax-free. */
  exemptionRemaining: number;
  financialYear: string;
  /** Days left to act, counting the 31 March deadline itself. */
  daysRemaining: number;
};

/**
 * Unused s.112A exemption in the financial year currently open.
 *
 * This is the one genuinely actionable number in the whole calculation: an
 * exemption is per-year and does not carry over, so long-term gains left
 * unrealised by 31 March lose that shelter permanently. Returns null once the
 * allowance is exhausted, so the UI has nothing to nag about.
 */
export function harvestHeadroom(
  breakdowns: CapitalGainsBreakdown[],
  today: string
): HarvestOpportunity | null {
  const financialYear = currentFinancialYear(today);
  if (!financialYear) return null;

  const range = financialYearRange(financialYear);
  if (!range) return null;

  const current = breakdowns.find((entry) => entry.financialYear === financialYear);
  const closingRegime = regimeForDate(range.end);
  const exemptionRemaining = current
    ? current.exemptionRemaining
    : closingRegime.longTermExemption;
  if (exemptionRemaining <= 0) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const endTime = Date.parse(`${range.end}T00:00:00Z`);
  if (Number.isNaN(todayTime) || Number.isNaN(endTime)) return null;

  return {
    exemptionRemaining,
    financialYear,
    daysRemaining: Math.max(0, Math.round((endTime - todayTime) / msPerDay) + 1),
  };
}
