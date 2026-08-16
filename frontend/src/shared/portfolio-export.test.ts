import { describe, expect, it } from "vitest";

import {
  buildCsv,
  capitalGainsCsv,
  csvEscape,
  holdingsCsv,
  transactionsCsv,
} from "@/shared/portfolio-export";
import type { HoldingWithValue } from "@/lib/portfolio";
import type { RealisedLot, Transaction } from "@/shared/portfolio-returns";
import type { CapitalGainsBreakdown } from "@/shared/capital-gains";

const BOM = String.fromCharCode(0xfeff);

const HOLDINGS_HEADER =
  "Symbol,Company,Quantity,Avg Buy Price,Invested Value,Current Price,Current Value,P&L,P&L %,Buy Date,Target Price,Notes";
const TRANSACTIONS_HEADER =
  "Date,Symbol,Company,Side,Quantity,Price,Fees,Gross Value,Notes";
const SUMMARY_HEADER =
  "FY,Short-term gain,Long-term gain,Taxable STCG,Taxable LTCG,Exemption used,STCG tax,LTCG tax,Cess,Total tax,Loss carried forward";
const LOTS_HEADER =
  "Financial Year,Symbol,Quantity,Buy Date,Buy Price,Sell Date,Sell Price,Cost Basis,Proceeds,Realised P&L,Term,Holding Days";

/**
 * Records of a document: BOM and final terminator stripped, split on CRLF.
 * Only valid for fixtures without embedded newlines inside cells — tests that
 * exercise embedded newlines assert on the raw string instead.
 */
function records(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  const body = csv.slice(1);
  if (body === "") return [];
  expect(body.endsWith("\r\n")).toBe(true);
  return body.slice(0, -2).split("\r\n");
}

function holding(overrides: Partial<HoldingWithValue> = {}): HoldingWithValue {
  return {
    id: "TCS_1",
    symbol: "TCS",
    companyName: "Tata Consultancy Services",
    quantity: 10,
    buyPrice: 3500,
    buyDate: "2024-01-05",
    currentPrice: 4000,
    currentValue: 40000,
    investedValue: 35000,
    pnl: 5000,
    pnlPercent: 14.285714,
    ...overrides,
  };
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    symbol: "INFY",
    side: "buy",
    quantity: 5,
    price: 1500,
    fees: 20,
    tradedOn: "2024-06-01",
    ...overrides,
  };
}

function lot(overrides: Partial<RealisedLot> = {}): RealisedLot {
  return {
    symbol: "TCS",
    quantity: 10,
    buyPrice: 100,
    sellPrice: 150,
    buyDate: "2024-01-01",
    sellDate: "2025-06-01",
    costBasis: 1000,
    proceeds: 1500,
    realisedPnl: 500,
    realisedPnlPercent: 50,
    holdingDays: 517,
    term: "long",
    ...overrides,
  };
}

function breakdown(
  overrides: Partial<CapitalGainsBreakdown> & Pick<CapitalGainsBreakdown, "financialYear">
): CapitalGainsBreakdown {
  const startYear = Number(overrides.financialYear.slice(0, 4));
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    shortTermGain: 0,
    longTermGain: 0,
    taxableShortTerm: 0,
    taxableLongTerm: 0,
    exemptionUsed: 0,
    exemptionRemaining: 125_000,
    exemptionLimit: 125_000,
    shortTermTax: 0,
    longTermTax: 0,
    cess: 0,
    totalTax: 0,
    carriedForwardLoss: 0,
    lossSetOff: 0,
    realisedLots: 0,
    regimeLabels: [],
    totalProceeds: 0,
    totalCostBasis: 0,
    ...overrides,
  };
}

describe("csvEscape", () => {
  it("leaves plain values bare", () => {
    expect(csvEscape("TCS")).toBe("TCS");
    expect(csvEscape("Tata Consultancy")).toBe("Tata Consultancy");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(0)).toBe("0");
    expect(csvEscape(-5.5)).toBe("-5.5");
  });

  it("quotes a value containing a comma", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("₹1,23,456")).toBe('"₹1,23,456"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    // A single quote character: wrapped and doubled, four quotes total.
    expect(csvEscape('"')).toBe('""""');
    expect(csvEscape('a"b,c')).toBe('"a""b,c"');
  });

  it("quotes newlines and carriage returns so a cell cannot break its row", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\rline2")).toBe('"line1\rline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("passes the rupee sign through without quoting", () => {
    // Non-ASCII alone never forces quotes — encoding is the BOM's job.
    expect(csvEscape("₹100")).toBe("₹100");
  });

  it("renders null and undefined as an empty cell", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape("")).toBe("");
  });

  it("stringifies without editing — blanking bad numbers is the builders' job", () => {
    expect(csvEscape(Number.NaN)).toBe("NaN");
    expect(csvEscape(true)).toBe("true");
  });
});

describe("buildCsv", () => {
  it("prefixes exactly one BOM, at position zero", () => {
    const csv = buildCsv([["a"], ["b"]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.split(BOM).length - 1).toBe(1);
  });

  it("joins records with CRLF and terminates the last one", () => {
    expect(buildCsv([["a", "b"], ["c"]])).toBe(`${BOM}a,b\r\nc\r\n`);
  });

  it("escapes every cell", () => {
    expect(buildCsv([["a,b", 'q"q']])).toBe(`${BOM}"a,b","q""q"\r\n`);
  });

  it("keeps an embedded newline inside its quoted cell", () => {
    expect(buildCsv([["a\nb", "c"]])).toBe(`${BOM}"a\nb",c\r\n`);
  });

  it("renders null and undefined cells as empty", () => {
    expect(buildCsv([[null, undefined, 1]])).toBe(`${BOM},,1\r\n`);
  });

  it("produces just the BOM for zero rows", () => {
    expect(buildCsv([])).toBe(BOM);
  });
});

describe("holdingsCsv", () => {
  it("emits the exact header", () => {
    expect(records(holdingsCsv([]))).toEqual([HOLDINGS_HEADER]);
  });

  it("formats a priced holding with money at two decimals", () => {
    const rows = records(holdingsCsv([holding()]));
    expect(rows[1]).toBe(
      "TCS,Tata Consultancy Services,10,3500.00,35000.00,4000.00,40000.00,5000.00,14.29,2024-01-05,,"
    );
  });

  it("leaves unpriced columns empty, never 0", () => {
    const rows = records(
      holdingsCsv([
        holding({ currentPrice: null, currentValue: null, pnl: null, pnlPercent: null }),
      ])
    );
    // Blank cells are skipped by spreadsheet SUMs; zeros would be counted and
    // silently understate the portfolio.
    expect(rows[1]).toBe(
      "TCS,Tata Consultancy Services,10,3500.00,35000.00,,,,,2024-01-05,,"
    );
    expect(rows[1]).not.toContain("0.00,0.00,0.00,0.00");
  });

  it("blanks NaN and Infinity rather than exporting them as text", () => {
    const rows = records(
      holdingsCsv([
        holding({
          buyPrice: Number.NaN,
          investedValue: Number.POSITIVE_INFINITY,
          currentPrice: null,
          currentValue: null,
          pnl: null,
          pnlPercent: null,
        }),
      ])
    );
    expect(rows[1]).toBe("TCS,Tata Consultancy Services,10,,,,,,,2024-01-05,,");
  });

  it("fills the optional target price and notes when present", () => {
    const rows = records(holdingsCsv([holding({ targetPrice: 4500, notes: "swing trade" })]));
    expect(rows[1].endsWith("2024-01-05,4500.00,swing trade")).toBe(true);
  });

  it("quotes company names and notes containing commas or quotes", () => {
    const csv = holdingsCsv([
      holding({
        companyName: "Tata, Consultancy",
        notes: 'target was "conservative", raised at ₹3,800',
      }),
    ]);
    expect(csv).toContain('"Tata, Consultancy"');
    expect(csv).toContain('"target was ""conservative"", raised at ₹3,800"');
  });

  it("keeps a multi-line note inside one cell", () => {
    const csv = holdingsCsv([holding({ notes: "first line\nsecond line" })]);
    expect(csv).toContain('"first line\nsecond line"');
  });

  it("keeps fractional quantities and writes huge values without separators", () => {
    const rows = records(
      holdingsCsv([
        holding({ quantity: 0.5, buyPrice: 1e15, investedValue: 5e14, pnl: -5000 }),
      ])
    );
    expect(rows[1]).toContain(",0.5,1000000000000000.00,500000000000000.00,");
    expect(rows[1]).toContain(",-5000.00,");
  });

  it("carries exactly one BOM regardless of row count", () => {
    const csv = holdingsCsv([holding(), holding({ id: "TCS_2" }), holding({ id: "TCS_3" })]);
    expect(csv.split(BOM).length - 1).toBe(1);
  });
});

describe("transactionsCsv", () => {
  it("emits the exact header", () => {
    expect(records(transactionsCsv([]))).toEqual([TRANSACTIONS_HEADER]);
  });

  it("formats a trade with gross value derived from quantity and price", () => {
    const rows = records(transactionsCsv([txn()]));
    expect(rows[1]).toBe("2024-06-01,INFY,,buy,5,1500.00,20.00,7500.00,");
  });

  it("sorts oldest first no matter the input order", () => {
    const rows = records(
      transactionsCsv([
        txn({ id: "a", tradedOn: "2025-01-10" }),
        txn({ id: "b", tradedOn: "2023-04-01" }),
        txn({ id: "c", tradedOn: "2024-12-31" }),
      ])
    );
    expect(rows.slice(1).map((row) => row.slice(0, 10))).toEqual([
      "2023-04-01",
      "2024-12-31",
      "2025-01-10",
    ]);
  });

  it("keeps entry order on same-day trades", () => {
    const rows = records(
      transactionsCsv([
        txn({ tradedOn: "2024-06-01", notes: "first" }),
        txn({ tradedOn: "2024-06-01", notes: "second" }),
      ])
    );
    expect(rows[1].endsWith("first")).toBe(true);
    expect(rows[2].endsWith("second")).toBe(true);
  });

  it("includes sell-side rows and optional fields", () => {
    const rows = records(
      transactionsCsv([
        txn({ side: "sell", companyName: "Infosys", quantity: 2.5, price: 1600.505, notes: "partial exit" }),
      ])
    );
    expect(rows[1]).toBe("2024-06-01,INFY,Infosys,sell,2.5,1600.51,20.00,4001.26,partial exit");
  });

  it("blanks a NaN price and the gross value it would poison", () => {
    const rows = records(transactionsCsv([txn({ price: Number.NaN })]));
    expect(rows[1]).toBe("2024-06-01,INFY,,buy,5,,20.00,,");
  });
});

describe("capitalGainsCsv", () => {
  it("emits both section titles and headers for empty inputs", () => {
    expect(records(capitalGainsCsv([], []))).toEqual([
      "Summary by financial year",
      SUMMARY_HEADER,
      "",
      "Realised lots",
      LOTS_HEADER,
    ]);
  });

  it("writes summary numbers at two decimals with no separators or symbols", () => {
    const rows = records(
      capitalGainsCsv(
        [
          breakdown({
            financialYear: "2025-26",
            shortTermGain: 1234567.891,
            longTermGain: 250000,
            taxableShortTerm: 1234567.891,
            taxableLongTerm: 125000,
            exemptionUsed: 125000,
            shortTermTax: 246913.5782,
            longTermTax: 15625,
            cess: 10501.543,
            totalTax: 273040.12,
            carriedForwardLoss: 0,
          }),
        ],
        []
      )
    );
    expect(rows[2]).toBe(
      "2025-26,1234567.89,250000.00,1234567.89,125000.00,125000.00,246913.58,15625.00,10501.54,273040.12,0.00"
    );
  });

  it("separates the sections with exactly one blank record", () => {
    const rows = records(capitalGainsCsv([breakdown({ financialYear: "2025-26" })], [lot()]));
    expect(rows[3]).toBe("");
    expect(rows.filter((row) => row === "").length).toBe(1);
  });

  it("formats a lot row from the matched ledger fields", () => {
    const rows = records(capitalGainsCsv([breakdown({ financialYear: "2025-26" })], [lot()]));
    expect(rows[6]).toBe(
      "2025-26,TCS,10,2024-01-01,100.00,2025-06-01,150.00,1000.00,1500.00,500.00,long,517"
    );
  });

  it("places lots under their sell-date financial year across the April boundary", () => {
    // Three days apart, different assessment years — the off-by-one that
    // calendar-year grouping gets wrong.
    const rows = records(
      capitalGainsCsv(
        [breakdown({ financialYear: "2026-27" }), breakdown({ financialYear: "2025-26" })],
        [
          lot({ symbol: "OLD", sellDate: "2026-03-30" }),
          lot({ symbol: "NEW", sellDate: "2026-04-02" }),
        ]
      )
    );
    // Two summary rows shift the lots section: title, header, 2 rows, blank,
    // section title, lots header — data starts at index 7.
    const lotRows = rows.slice(7);
    expect(lotRows[0].startsWith("2026-27,NEW,")).toBe(true);
    expect(lotRows[1].startsWith("2025-26,OLD,")).toBe(true);
  });

  it("orders lots oldest first within a year", () => {
    const rows = records(
      capitalGainsCsv(
        [breakdown({ financialYear: "2025-26" })],
        [
          lot({ symbol: "LATER", sellDate: "2026-01-15" }),
          lot({ symbol: "EARLIER", sellDate: "2025-05-01" }),
        ]
      )
    );
    const lotRows = rows.slice(6);
    expect(lotRows[0].startsWith("2025-26,EARLIER,")).toBe(true);
    expect(lotRows[1].startsWith("2025-26,LATER,")).toBe(true);
  });

  it("still exports a lot whose year has no summary row", () => {
    const rows = records(
      capitalGainsCsv(
        [breakdown({ financialYear: "2025-26" })],
        [lot({ symbol: "COVERED", sellDate: "2025-06-01" }), lot({ symbol: "ORPHAN", sellDate: "2023-06-01" })]
      )
    );
    const lotRows = rows.slice(6);
    expect(lotRows[0].startsWith("2025-26,COVERED,")).toBe(true);
    expect(lotRows[1].startsWith("2023-24,ORPHAN,")).toBe(true);
  });

  it("keeps a lot with an unparseable sell date, last and with a blank year", () => {
    const rows = records(
      capitalGainsCsv(
        [breakdown({ financialYear: "2025-26" })],
        [lot({ symbol: "BAD", sellDate: "not-a-date" }), lot({ symbol: "GOOD", sellDate: "2025-06-01" })]
      )
    );
    const lotRows = rows.slice(6);
    expect(lotRows[0].startsWith("2025-26,GOOD,")).toBe(true);
    // Dropping the row would silently under-report; a blank year flags it.
    expect(lotRows[1]).toBe(",BAD,10,2024-01-01,100.00,not-a-date,150.00,1000.00,1500.00,500.00,long,517");
  });

  it("blanks non-finite figures instead of writing NaN into a filing document", () => {
    const rows = records(
      capitalGainsCsv(
        [breakdown({ financialYear: "2025-26", totalTax: Number.NaN, cess: Number.POSITIVE_INFINITY })],
        []
      )
    );
    expect(rows[2]).toBe("2025-26,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,0.00");
  });

  it("carries exactly one BOM", () => {
    const csv = capitalGainsCsv([breakdown({ financialYear: "2025-26" })], [lot(), lot()]);
    expect(csv.split(BOM).length - 1).toBe(1);
  });
});
