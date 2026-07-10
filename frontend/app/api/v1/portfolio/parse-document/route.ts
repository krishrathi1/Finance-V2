import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ParsedHolding = {
  symbol: string;
  quantity: number;
  buyPrice: number;
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACTED_TEXT = 200_000;
const PARSE_TIMEOUT_MS = 20_000;

/** PDF files start with the literal bytes "%PDF". */
function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

/** DOCX is a ZIP container; real ZIPs start with a PK local-file-header signature. */
function hasZipMagicBytes(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

/**
 * Bounds how long the request waits on parsing. Doesn't truly cancel a
 * CPU-bound parse (Node is single-threaded — full isolation would need a
 * worker thread), but caps wall-clock exposure for the common case and
 * combines with the rate limit + size cap to bound repeated abuse.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Document parsing timed out")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Extract raw text from a PDF buffer using pdf-parse v2 (PDFParse class API).
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v2 exposes a `PDFParse` class; constructor takes { data } and
  // getText() returns a TextResult with a concatenated `.text` string.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return String(result?.text || "");
  } finally {
    // Release pdfjs worker / document resources.
    try {
      await parser.destroy();
    } catch {
      /* noop */
    }
  }
}

/**
 * Extract raw text from a DOCX buffer using mammoth.
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return String(result?.value || "");
}

const STOP_WORDS = new Set([
  "QTY",
  "QUANTITY",
  "AVG",
  "AVERAGE",
  "BUY",
  "PRICE",
  "COST",
  "TOTAL",
  "VALUE",
  "PORTFOLIO",
  "HOLDING",
  "HOLDINGS",
  "STATEMENT",
  "SYMBOL",
  "STOCK",
  "SHARES",
  "INVESTMENT",
  "CURRENT",
  "MARKET",
  "LTP",
  "CMP",
  "PNL",
  "GAIN",
  "LOSS",
  "DATE",
  "NSE",
  "BSE",
  "INR",
  "RS",
  "ISIN",
  "SR",
  "NO",
  "AMOUNT",
  "NET",
  "SUMMARY",
  "ACCOUNT",
]);

function toNumber(raw: string): number {
  // Strip currency symbols, commas and whitespace; keep digits, dot and minus.
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function isLikelySymbol(token: string): boolean {
  if (!token) return false;
  const upper = token.toUpperCase();
  if (STOP_WORDS.has(upper)) return false;
  // Stock symbols: 1-15 chars, letters/digits/&-., must contain at least one letter.
  if (!/^[A-Z][A-Z0-9&.\-]{0,14}$/.test(upper)) return false;
  if (!/[A-Z]/.test(upper)) return false;
  return true;
}

/**
 * Heuristic extraction of holdings from extracted statement text.
 *
 * Looks for lines that contain a stock symbol followed by a quantity and an
 * average/buy price. Handles a few common layouts:
 *   SYMBOL  QTY  AVGPRICE  [extra columns...]
 *   SYMBOL  QTY  @ AVGPRICE
 *   1  SYMBOL  Some Name  QTY  AVGPRICE  ...
 */
function extractHoldings(text: string): ParsedHolding[] {
  if (!text) return [];

  const holdings: ParsedHolding[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Tokenize on whitespace; collapse multiple spaces.
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) continue;

    // Find the first token that looks like a stock symbol.
    let symbolIdx = -1;
    for (let i = 0; i < tokens.length; i += 1) {
      if (isLikelySymbol(tokens[i])) {
        symbolIdx = i;
        break;
      }
    }
    if (symbolIdx === -1) continue;

    const symbol = tokens[symbolIdx].toUpperCase().replace(/[.\-]+$/, "");
    if (!symbol || seen.has(symbol)) continue;

    // Collect the numeric tokens that appear after the symbol. We skip pure
    // text tokens (e.g. a company name) and pick the numbers.
    const numbers: number[] = [];
    for (let i = symbolIdx + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      // Token that contains at least one digit -> candidate number.
      if (/\d/.test(token) && /^[0-9.,\-@₹Rs$%]+$/i.test(token.replace(/@/g, ""))) {
        const num = toNumber(token);
        if (Number.isFinite(num)) {
          numbers.push(num);
        }
      }
    }

    if (numbers.length < 2) continue;

    // First number after the symbol is treated as quantity, second as buy/avg price.
    const quantity = numbers[0];
    const buyPrice = numbers[1];

    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) continue;

    holdings.push({
      symbol,
      quantity,
      buyPrice,
    });
    seen.add(symbol);
  }

  return holdings;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ holdings: [] });
    }

    const blob = file as File;
    const contentType = String(blob.type || "").toLowerCase();
    const fileName = String(blob.name || "").toLowerCase();
    const isPdf = contentType.includes("application/pdf") || fileName.endsWith(".pdf");
    const isDocx =
      contentType.includes("officedocument.wordprocessingml") ||
      fileName.endsWith(".docx");
    // The import modal's copy/accept attribute advertises TXT support; this
    // used to 415 on it (accepted extension the API silently didn't handle).
    const isTxt = contentType.includes("text/plain") || fileName.endsWith(".txt");

    if (blob.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { holdings: [], detail: "File must be 5 MB or smaller" },
        { status: 413 }
      );
    }
    if (!isPdf && !isDocx && !isTxt) {
      return NextResponse.json(
        { holdings: [], detail: "Only PDF, DOCX, and TXT files are supported" },
        { status: 415 }
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Don't trust the client-supplied extension/MIME type to pick the parser
    // — verify the file's actual magic bytes match what it claims to be.
    if (isPdf && !hasPdfMagicBytes(buffer)) {
      return NextResponse.json(
        { holdings: [], detail: "File does not look like a valid PDF" },
        { status: 415 }
      );
    }
    if (isDocx && !hasZipMagicBytes(buffer)) {
      return NextResponse.json(
        { holdings: [], detail: "File does not look like a valid DOCX" },
        { status: 415 }
      );
    }

    let text = "";
    if (isPdf) {
      text = await withTimeout(extractPdfText(buffer), PARSE_TIMEOUT_MS);
    } else if (isDocx) {
      text = await withTimeout(extractDocxText(buffer), PARSE_TIMEOUT_MS);
    } else if (isTxt) {
      text = buffer.toString("utf-8");
    }

    const holdings = extractHoldings(text.slice(0, MAX_EXTRACTED_TEXT));
    return NextResponse.json({ holdings });
  } catch (error) {
    console.error("Portfolio parse-document error:", error);
    // Golden rule: never 500 on a parse failure; the client expects { holdings }.
    return NextResponse.json({ holdings: [] });
  }
}
