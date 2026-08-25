/**
 * Broker Statement CSV Parser
 * 
 * Supports:
 * 1. Zerodha Tradebook / Holdings CSV
 * 2. Groww Stocks P&L / Order Book CSV
 * 3. Angel One Trade History CSV
 * 4. Generic CSV (Symbol, Quantity, Price, Date)
 */

export interface ParsedTradeRow {
  symbol: string;
  companyName: string;
  quantity: number;
  buyPrice: number;
  buyDate: string; // YYYY-MM-DD
  brokerDetected: "Zerodha" | "Groww" | "AngelOne" | "Generic CSV";
  status: "Valid" | "Invalid";
  error?: string;
}

export interface BrokerImportResult {
  trades: ParsedTradeRow[];
  brokerName: string;
  totalValid: number;
  totalErrors: number;
}

/** Cleans and normalizes Indian stock symbols (e.g. TATAMOTORS-EQ -> TATAMOTORS, RELIANCE.NS -> RELIANCE) */
export function cleanStockSymbol(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim().toUpperCase();
  // Strip BOM if present
  clean = clean.replace(/^\uFEFF/, "");
  clean = clean.replace(/\.NS$/, "").replace(/\.BO$/, "");
  clean = clean.replace(/-EQ$/, "").replace(/-BE$/, "").replace(/-SM$/, "").replace(/-BZ$/, "");
  clean = clean.replace(/[^A-Z0-9&]/g, "");
  return clean;
}

/** Parses standard date formats into YYYY-MM-DD */
export function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().split("T")[0];
  const str = raw.trim().replace(/^\uFEFF/, "");

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(str)) {
    const parts = str.split(/[-/]/);
    const y = parts[0];
    const m = parts[1].padStart(2, "0");
    const d = parts[2].split(" ")[0].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(str)) {
    const parts = str.split(/[-/]/);
    const d = parts[0].padStart(2, "0");
    const m = parts[1].padStart(2, "0");
    const y = parts[2].split(" ")[0];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return new Date().toISOString().split("T")[0];
}

/** Clean numeric string with commas, currency symbols, and whitespace */
export function parseCleanNumber(raw: string | undefined): number {
  if (!raw) return 0;
  // Remove currency signs (₹, $, Rs), commas, and spaces
  const cleaned = raw.replace(/[₹$Rs,\s]/gi, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/** Parse CSV rows taking care of quotes */
export function parseCsvRows(text: string): string[][] {
  // Strip UTF-8 BOM
  const sanitized = text.replace(/^\uFEFF/, "");
  const lines = sanitized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let insideQuotes = false;
    let currentVal = "";

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        insideQuotes = !insideQuotes;
      } else if (char === "," && !insideQuotes) {
        row.push(currentVal.trim().replace(/^["']|["']$/g, ""));
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
    row.push(currentVal.trim().replace(/^["']|["']$/g, ""));
    rows.push(row);
  }

  return rows;
}

/**
 * Main parser detecting broker format from headers and content.
 */
export function parseBrokerCsv(csvContent: string): BrokerImportResult {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) {
    return { trades: [], brokerName: "Unknown", totalValid: 0, totalErrors: 0 };
  }

  // Find header index
  let headerIndex = 0;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = rows[i].join(" ").toLowerCase();
    if (
      rowStr.includes("symbol") ||
      rowStr.includes("instrument") ||
      rowStr.includes("stock") ||
      rowStr.includes("scrip")
    ) {
      headerIndex = i;
      headers = rows[i].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
      break;
    }
  }

  if (headers.length === 0) {
    headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  }

  // Detect broker
  const headerCombined = headers.join(" ");
  let brokerDetected: ParsedTradeRow["brokerDetected"] = "Generic CSV";

  if (headerCombined.includes("tradetype") || headerCombined.includes("exchangeorderid") || headerCombined.includes("isin")) {
    brokerDetected = "Zerodha";
  } else if (headerCombined.includes("groww") || headerCombined.includes("stockname") || headerCombined.includes("settlementid")) {
    brokerDetected = "Groww";
  } else if (headerCombined.includes("angel") || headerCombined.includes("clientscriptcode")) {
    brokerDetected = "AngelOne";
  }

  // Identify column mapping
  const symbolIdx = headers.findIndex((h) =>
    h.includes("symbol") || h.includes("instrument") || h.includes("stockname") || h.includes("scrip") || h.includes("name")
  );
  const qtyIdx = headers.findIndex((h) =>
    h.includes("quantity") || h.includes("qty") || h.includes("shares") || h.includes("units")
  );
  const priceIdx = headers.findIndex((h) =>
    h.includes("price") || h.includes("rate") || h.includes("buyavg") || h.includes("avgprice") || h.includes("cost")
  );
  const dateIdx = headers.findIndex((h) =>
    h.includes("date") || h.includes("tradedate") || h.includes("time") || h.includes("orderdate")
  );
  const tradeTypeIdx = headers.findIndex((h) =>
    h.includes("type") || h.includes("action") || h.includes("tradetype") || h.includes("buysell")
  );

  const trades: ParsedTradeRow[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const rawSym = symbolIdx >= 0 ? row[symbolIdx] : row[0];
    const rawQty = qtyIdx >= 0 ? row[qtyIdx] : row[1];
    const rawPrice = priceIdx >= 0 ? row[priceIdx] : row[2];
    const rawDate = dateIdx >= 0 ? row[dateIdx] : row[3];
    const rawType = tradeTypeIdx >= 0 ? row[tradeTypeIdx]?.toLowerCase() : "buy";

    // Ignore SELL orders if we are importing current buy lots
    if (rawType && (rawType.includes("sell") || rawType.includes("s"))) {
      continue;
    }

    const symbol = cleanStockSymbol(rawSym);
    const quantity = parseCleanNumber(rawQty);
    const buyPrice = parseCleanNumber(rawPrice);
    const buyDate = normalizeDate(rawDate);

    let status: ParsedTradeRow["status"] = "Valid";
    let error: string | undefined;

    if (!symbol || symbol.length < 2) {
      status = "Invalid";
      error = "Missing or unrecognized stock symbol";
    } else if (isNaN(quantity) || quantity <= 0) {
      status = "Invalid";
      error = "Invalid quantity (must be > 0)";
    } else if (isNaN(buyPrice) || buyPrice <= 0) {
      status = "Invalid";
      error = "Invalid buy price (must be > 0)";
    }

    trades.push({
      symbol,
      companyName: symbol,
      quantity,
      buyPrice,
      buyDate,
      brokerDetected,
      status,
      error,
    });
  }

  const totalValid = trades.filter((t) => t.status === "Valid").length;
  const totalErrors = trades.filter((t) => t.status === "Invalid").length;

  return {
    trades,
    brokerName: brokerDetected,
    totalValid,
    totalErrors,
  };
}
