/**
 * Dividend track record from the corporate-actions feed.
 *
 * The dashboard already receives every declared dividend with its amount and
 * ex-date, and renders them as a table of rows. A table answers "what was
 * declared"; it does not answer the questions an income investor is actually
 * asking — has this company paid every year, is the payout growing, and what
 * does it yield at today's price. Those need the rows grouped by financial
 * year and compared, which is what this does.
 *
 * Grouped by the Indian financial year (1 April - 31 March) rather than the
 * calendar year, because that is the year a company declares against: a final
 * dividend paid in June and an interim paid the following February belong to
 * the same financial year, and calendar grouping splits them.
 *
 * Pure and dependency-free.
 */

import { indianFinancialYear } from "@/shared/capital-gains";

export type DividendRecord = {
  /** "05-Jun-2026" from the corporate-actions feed. */
  exDate?: string | null;
  date?: string | null;
  /** Rupees per share. */
  dividendAmount?: number | null;
  type?: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Normalise a corporate-actions date to ISO.
 *
 * The feed uses "05-Jun-2026", which `Date.parse` handles inconsistently
 * across engines, so it is parsed explicitly. ISO input passes through, since
 * some providers already send it that way.
 */
export function toIsoDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (!month) return null;
    return `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  return null;
}

export type DividendYear = {
  /** "2025-26". */
  financialYear: string;
  /** Rupees per share declared across the year. */
  total: number;
  /** Number of separate declarations (interim + final, etc.). */
  payouts: number;
};

export type DividendTrackRecord = {
  /** Newest financial year first. */
  years: DividendYear[];
  /** Financial years with at least one payout. */
  yearsPaid: number;
  /**
   * Unbroken run of paying years ending at the most recent one on record.
   * A gap resets it — that gap is the single most informative thing in an
   * income stock's history, and a plain count of paying years hides it.
   */
  consecutiveYears: number;
  /** Rupees per share over the last 365 days. */
  trailingTwelveMonths: number;
  /** TTM payout as a percentage of the current price. */
  yieldPercent: number | null;
  /** Annual growth in the per-year total across the record. */
  growthCagrPercent: number | null;
  direction: "rising" | "steady" | "falling" | null;
  latestPayout: { date: string; amount: number } | null;
  /** Highest and lowest full-year totals, for the range. */
  bestYear: DividendYear | null;
  leanestYear: DividendYear | null;
};

/** A financial year label's ordering key ("2025-26" -> 2025). */
function fyStart(label: string): number {
  return Number(label.slice(0, 4));
}

/**
 * Build the dividend track record.
 *
 * `asOf` is a parameter rather than `new Date()` so the trailing-twelve-month
 * figure is deterministic and directly testable.
 *
 * Returns null when nothing usable is present. A company that has never paid a
 * dividend should show no card at all — a track record of zero rendered as
 * "₹0.00, 0 years" reads as a data failure rather than as a growth company
 * that reinvests everything.
 */
export function dividendTrackRecord(
  records: DividendRecord[] | null | undefined,
  currentPrice: number | null | undefined,
  asOf: string
): DividendTrackRecord | null {
  const usable: Array<{ date: string; amount: number }> = [];

  for (const record of Array.isArray(records) ? records : []) {
    // Prefer the ex-date: it is the date that decides entitlement, and the
    // generic `date` column is sometimes the announcement instead.
    const date = toIsoDate(record?.exDate) ?? toIsoDate(record?.date);
    const amount = Number(record?.dividendAmount);
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    usable.push({ date, amount });
  }

  if (!usable.length) return null;

  usable.sort((a, b) => b.date.localeCompare(a.date));

  const byYear = new Map<string, DividendYear>();
  for (const payout of usable) {
    const financialYear = indianFinancialYear(payout.date);
    if (!financialYear) continue;
    const existing = byYear.get(financialYear);
    if (existing) {
      existing.total += payout.amount;
      existing.payouts += 1;
    } else {
      byYear.set(financialYear, { financialYear, total: payout.amount, payouts: 1 });
    }
  }

  const years = [...byYear.values()]
    .map((year) => ({ ...year, total: Math.round(year.total * 1e4) / 1e4 }))
    .sort((a, b) => fyStart(b.financialYear) - fyStart(a.financialYear));
  if (!years.length) return null;

  // Walk back from the most recent paying year; a missing year breaks the run.
  let consecutiveYears = 1;
  for (let index = 1; index < years.length; index += 1) {
    if (fyStart(years[index - 1].financialYear) - fyStart(years[index].financialYear) !== 1) break;
    consecutiveYears += 1;
  }

  const cutoff = new Date(Date.parse(`${asOf}T00:00:00Z`) - 365 * 24 * 60 * 60 * 1000);
  const cutoffIso = Number.isNaN(cutoff.getTime()) ? null : cutoff.toISOString().slice(0, 10);
  const trailingTwelveMonths = cutoffIso
    ? usable
        .filter((payout) => payout.date > cutoffIso && payout.date <= asOf)
        .reduce((sum, payout) => sum + payout.amount, 0)
    : 0;

  const price = Number(currentPrice);
  const yieldPercent =
    Number.isFinite(price) && price > 0 && trailingTwelveMonths > 0
      ? (trailingTwelveMonths / price) * 100
      : null;

  // Growth is measured across complete years only. The most recent financial
  // year is usually still open, so including it would compare a part-year
  // against full ones and report a collapse that hasn't happened.
  const complete = years.filter((year) => year.financialYear !== indianFinancialYear(asOf));
  let growthCagrPercent: number | null = null;
  if (complete.length >= 2) {
    const newest = complete[0];
    const oldest = complete[complete.length - 1];
    const span = fyStart(newest.financialYear) - fyStart(oldest.financialYear);
    if (span > 0 && oldest.total > 0 && newest.total > 0) {
      const cagr = (Math.pow(newest.total / oldest.total, 1 / span) - 1) * 100;
      if (Number.isFinite(cagr)) growthCagrPercent = cagr;
    }
  }

  const direction: DividendTrackRecord["direction"] =
    growthCagrPercent === null
      ? null
      : growthCagrPercent > 2
      ? "rising"
      : growthCagrPercent < -2
      ? "falling"
      : "steady";

  const ranked = [...complete].sort((a, b) => b.total - a.total);

  return {
    years,
    yearsPaid: years.length,
    consecutiveYears,
    trailingTwelveMonths: Math.round(trailingTwelveMonths * 1e4) / 1e4,
    yieldPercent,
    growthCagrPercent,
    direction,
    latestPayout: { date: usable[0].date, amount: usable[0].amount },
    bestYear: ranked[0] ?? null,
    leanestYear: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}
