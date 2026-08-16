/**
 * CSV builders for the portfolio's exports.
 *
 * Pure string assembly, no browser APIs: triggering the actual download (Blob,
 * object URL, anchor click) is UI plumbing and lives with the button that
 * starts it. Keeping the builders pure means the exact bytes a user's
 * spreadsheet will open can be asserted in tests, character by character.
 *
 * Two Excel-driven conventions apply to every file built here:
 *
 * - **UTF-8 BOM prefix.** Excel on Windows sniffs a BOM-less file as the local
 *   ANSI codepage, which turns every rupee sign into "â‚¹" mojibake. The BOM
 *   is the one in-band encoding signal Excel respects, so each document starts
 *   with exactly one.
 * - **CRLF line endings.** RFC 4180 specifies CRLF, and it is the ending every
 *   consumer — Excel, Sheets, csv parsers — agrees on; bare LF files open
 *   fine in most tools and then as one long row in the one that matters.
 *
 * Cells carry numbers plain: two decimals, no currency symbol, no thousands
 * separators. "₹1,23,456.00" reads nicely and parses as *text*, which silently
 * breaks every SUM the user builds on the column.
 */

import type { HoldingWithValue } from "@/lib/portfolio";
import type { RealisedLot, Transaction } from "@/shared/portfolio-returns";
import type { CapitalGainsBreakdown } from "@/shared/capital-gains";
import { indianFinancialYear } from "@/shared/capital-gains";

/**
 * Escape one cell per RFC 4180.
 *
 * Quotes are added only when the value forces them (comma, quote, CR or LF),
 * not unconditionally — bare cells keep the file human-readable and
 * diff-friendly. Embedded quotes are doubled, because that, not a backslash,
 * is the CSV escape. null/undefined become an empty cell; everything else is
 * stringified as-is, so deciding that a NaN should render blank is the row
 * builders' job — an escaper that also edits values would hide data in a
 * document whose whole purpose is disclosure.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * The byte-order mark, U+FEFF, built from its code point rather than written
 * as a literal: an invisible character in source text survives neither
 * editors nor code review.
 */
const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * Assemble rows of raw cell values into a complete CSV document.
 *
 * Prefixed with a single UTF-8 BOM and joined with CRLF — see the module
 * comment for why both are Excel requirements rather than taste. Every
 * record, the last included, gets a terminator: RFC 4180 makes the final one
 * optional, but a file ending mid-line concatenates wrongly and makes
 * record-counting tools lie by one.
 */
export function buildCsv(rows: Array<Array<unknown>>): string {
  const safeRows = Array.isArray(rows) ? rows : [];
  const body = safeRows
    .map((row) => (Array.isArray(row) ? row : []).map(csvEscape).join(","))
    .join("\r\n");
  return UTF8_BOM + body + (safeRows.length > 0 ? "\r\n" : "");
}

/**
 * A numeric cell at fixed two decimals — or empty when there is no number.
 *
 * Empty, never "0": spreadsheet aggregates skip blank cells but count zeros,
 * so an unknown value exported as 0 corrupts every SUM and AVERAGE built on
 * the column while looking perfectly plausible.
 */
function cell2dp(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "";
}

/**
 * A count-like cell (quantities, day counts) kept at natural precision.
 * Forcing "10.00" onto a share count implies a precision the ledger doesn't
 * have; forcing "0.50" onto a fractional unit is merely redundant.
 */
function cellPlain(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

/**
 * ISO "YYYY-MM-DD" strings sort lexicographically in date order, so ordering
 * needs no Date parsing — and an unparseable date still gets a deterministic
 * position instead of a NaN comparator, whose sort order is engine-defined.
 */
function compareIsoDates(a: string | undefined, b: string | undefined): number {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The current holdings as a spreadsheet.
 *
 * Price-derived columns (current price/value, P&L) are blank when the quote
 * is missing — deliberately not 0. A holding the price feed couldn't value
 * exported as ₹0 would flow straight into whatever totals the user builds on
 * the sheet and understate their portfolio by the whole position.
 */
export function holdingsCsv(holdings: HoldingWithValue[]): string {
  const rows: unknown[][] = [
    [
      "Symbol",
      "Company",
      "Quantity",
      "Avg Buy Price",
      "Invested Value",
      "Current Price",
      "Current Value",
      "P&L",
      "P&L %",
      "Buy Date",
      "Target Price",
      "Notes",
    ],
  ];

  for (const holding of Array.isArray(holdings) ? holdings : []) {
    rows.push([
      holding.symbol,
      holding.companyName,
      cellPlain(holding.quantity),
      cell2dp(holding.buyPrice),
      cell2dp(holding.investedValue),
      cell2dp(holding.currentPrice),
      cell2dp(holding.currentValue),
      cell2dp(holding.pnl),
      cell2dp(holding.pnlPercent),
      holding.buyDate,
      cell2dp(holding.targetPrice),
      holding.notes,
    ]);
  }

  return buildCsv(rows);
}

/**
 * The trade ledger as a spreadsheet, oldest trade first.
 *
 * The UI defaults to newest-first because "what did I just do" is the common
 * question on screen; a ledger document reads forward in time, the way a bank
 * statement or a broker's contract-note register does. Ties on a date keep
 * the order the user entered them.
 */
export function transactionsCsv(transactions: Transaction[]): string {
  const rows: unknown[][] = [
    ["Date", "Symbol", "Company", "Side", "Quantity", "Price", "Fees", "Gross Value", "Notes"],
  ];

  const ordered = [...(Array.isArray(transactions) ? transactions : [])].sort((a, b) =>
    compareIsoDates(a?.tradedOn, b?.tradedOn)
  );

  for (const transaction of ordered) {
    rows.push([
      transaction.tradedOn,
      transaction.symbol,
      transaction.companyName,
      transaction.side,
      cellPlain(transaction.quantity),
      cell2dp(transaction.price),
      cell2dp(transaction.fees),
      // NaN in either factor blanks the cell rather than exporting a fake 0.
      cell2dp(transaction.quantity * transaction.price),
      transaction.notes,
    ]);
  }

  return buildCsv(rows);
}

/**
 * A filing-ready capital-gains statement: the per-year summary a return is
 * filled in from, then every realised lot as the working behind it.
 *
 * One document rather than two, because the lots are the evidence for the
 * summary — an assessee (or their CA) checking a year's figure needs the rows
 * it came from in the same file. Each lot is keyed to a financial year by its
 * *sell* date, since the transfer date is what fixes the assessment year, and
 * the lots section follows the summary's year order so the detail sits under
 * the figure it substantiates. Lots whose sell date cannot be parsed are kept
 * at the end with a blank year — an export that silently dropped a trade
 * would under-report exactly where accuracy matters most.
 */
export function capitalGainsCsv(
  breakdowns: CapitalGainsBreakdown[],
  lots: RealisedLot[]
): string {
  const safeBreakdowns = Array.isArray(breakdowns) ? breakdowns : [];
  const safeLots = Array.isArray(lots) ? lots : [];

  const rows: unknown[][] = [];

  rows.push(["Summary by financial year"]);
  rows.push([
    "FY",
    "Short-term gain",
    "Long-term gain",
    "Taxable STCG",
    "Taxable LTCG",
    "Exemption used",
    "STCG tax",
    "LTCG tax",
    "Cess",
    "Total tax",
    "Loss carried forward",
  ]);

  for (const breakdown of safeBreakdowns) {
    rows.push([
      breakdown.financialYear,
      cell2dp(breakdown.shortTermGain),
      cell2dp(breakdown.longTermGain),
      cell2dp(breakdown.taxableShortTerm),
      cell2dp(breakdown.taxableLongTerm),
      cell2dp(breakdown.exemptionUsed),
      cell2dp(breakdown.shortTermTax),
      cell2dp(breakdown.longTermTax),
      cell2dp(breakdown.cess),
      cell2dp(breakdown.totalTax),
      cell2dp(breakdown.carriedForwardLoss),
    ]);
  }

  // Blank record between the sections so the file visibly reads as two tables
  // instead of one table with a mid-stream header change.
  rows.push([]);

  rows.push(["Realised lots"]);
  rows.push([
    "Financial Year",
    "Symbol",
    "Quantity",
    "Buy Date",
    "Buy Price",
    "Sell Date",
    "Sell Price",
    "Cost Basis",
    "Proceeds",
    "Realised P&L",
    "Term",
    "Holding Days",
  ]);

  const byYear = new Map<string, RealisedLot[]>();
  const undated: RealisedLot[] = [];
  for (const lot of safeLots) {
    const financialYear = indianFinancialYear(lot?.sellDate);
    if (!financialYear) {
      undated.push(lot);
      continue;
    }
    const bucket = byYear.get(financialYear);
    if (bucket) bucket.push(lot);
    else byYear.set(financialYear, [lot]);
  }

  // Years appear in the summary's order first, then any years the summary
  // doesn't cover (newest first, matching the summary's own direction).
  const orderedYears: string[] = [];
  for (const breakdown of safeBreakdowns) {
    if (byYear.has(breakdown.financialYear) && !orderedYears.includes(breakdown.financialYear)) {
      orderedYears.push(breakdown.financialYear);
    }
  }
  const uncoveredYears = [...byYear.keys()]
    .filter((year) => !orderedYears.includes(year))
    .sort((a, b) => compareIsoDates(b, a));
  orderedYears.push(...uncoveredYears);

  const lotRow = (financialYear: string, lot: RealisedLot): unknown[] => [
    financialYear,
    lot.symbol,
    cellPlain(lot.quantity),
    lot.buyDate,
    cell2dp(lot.buyPrice),
    lot.sellDate,
    cell2dp(lot.sellPrice),
    cell2dp(lot.costBasis),
    cell2dp(lot.proceeds),
    cell2dp(lot.realisedPnl),
    lot.term,
    cellPlain(lot.holdingDays),
  ];

  for (const year of orderedYears) {
    // Within a year the statement reads forward in time, like the ledger.
    const yearLots = [...(byYear.get(year) ?? [])].sort((a, b) =>
      compareIsoDates(a?.sellDate, b?.sellDate)
    );
    for (const lot of yearLots) rows.push(lotRow(year, lot));
  }
  for (const lot of undated) rows.push(lotRow("", lot));

  return buildCsv(rows);
}
