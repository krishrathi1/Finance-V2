import { ScreenMemoryChunk, ScreenMetric, ScreenSnapshot, ScreenStockFacts } from "./types";

interface RawScreenInput {
  sessionId: string;
  route: string;
  pageTitle: string;
  stock?: ScreenStockFacts;
  metrics?: ScreenMetric[];
  sections?: Array<{ title: string; text: string }>;
  tables?: Array<{ title: string; rows: Array<Record<string, string>> }>;
  visibleExcerpt?: string;
}

/**
 * Normalizes raw captured screen facts, sections, and tables into discrete,
 * semantic memory chunks with source tags and keyword indexes.
 */
export function buildScreenSnapshot(raw: RawScreenInput): ScreenSnapshot {
  const timestamp = Date.now();
  const chunks: ScreenMemoryChunk[] = [];
  const metrics: ScreenMetric[] = raw.metrics || [];

  let chunkSeq = 1;

  // 1. Structured Stock Fact Chunk (Highest priority)
  if (raw.stock && raw.stock.symbol) {
    const s = raw.stock;
    const facts = [
      `Active Stock: ${s.symbol}${s.companyName ? ` (${s.companyName})` : ""}`,
      s.price ? `Current CMP: ₹${s.price}` : null,
      s.changePercent ? `Day Change: ${s.changePercent}` : null,
      s.pe ? `P/E Ratio: ${s.pe}` : null,
      s.marketCap ? `Market Cap: ${s.marketCap}` : null,
      s.smartScore ? `Smart / Forensic Score: ${s.smartScore}` : null,
      s.sector ? `Sector: ${s.sector}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const keywords = [
      s.symbol.toLowerCase(),
      (s.companyName || "").toLowerCase(),
      "price",
      "cmp",
      "pe",
      "valuation",
      "stock",
      "market",
    ].filter(Boolean);

    chunks.push({
      id: `chunk_${raw.sessionId}_${chunkSeq++}`,
      type: "structured_fact",
      title: `${s.symbol} Core Facts`,
      content: facts,
      keywords,
      metadata: {
        route: raw.route,
        source: "stock_header",
        timestamp,
        symbol: s.symbol,
        section: "overview",
      },
    });
  }

  // 2. Metrics Chunks (grouped in clusters of 4-6 metrics for coherent retrieval)
  if (metrics.length > 0) {
    const clusterSize = 5;
    for (let i = 0; i < metrics.length; i += clusterSize) {
      const cluster = metrics.slice(i, i + clusterSize);
      const content = cluster.map((m) => `${m.label}: ${m.value}`).join(" | ");
      const keywords = cluster
        .map((m) => m.label.toLowerCase().split(/\s+/))
        .flat()
        .filter((k) => k.length > 2);

      chunks.push({
        id: `chunk_${raw.sessionId}_${chunkSeq++}`,
        type: "structured_fact",
        title: `Financial Metrics (${cluster.map((m) => m.label).join(", ")})`,
        content,
        keywords,
        metadata: {
          route: raw.route,
          source: "metrics_grid",
          timestamp,
          symbol: raw.stock?.symbol,
          section: "key_metrics",
        },
      });
    }
  }

  // 3. Tabular Data Chunks
  if (raw.tables && raw.tables.length > 0) {
    for (const table of raw.tables) {
      if (!table.rows || table.rows.length === 0) continue;
      // Take up to 8 rows
      const slice = table.rows.slice(0, 8);
      const rowsText = slice
        .map((row) =>
          Object.entries(row)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
        )
        .join(" \n ");

      const keywords = [
        table.title.toLowerCase(),
        ...slice.flatMap((r) => Object.keys(r).map((k) => k.toLowerCase())),
      ];

      chunks.push({
        id: `chunk_${raw.sessionId}_${chunkSeq++}`,
        type: "table_row",
        title: table.title,
        content: `Table [${table.title}]: \n${rowsText}`,
        keywords,
        metadata: {
          route: raw.route,
          source: "table",
          timestamp,
          section: table.title,
        },
      });
    }
  }

  // 4. Semantic Text Sections
  if (raw.sections && raw.sections.length > 0) {
    for (const sec of raw.sections) {
      const cleanText = sec.text.replace(/\s+/g, " ").trim();
      if (!cleanText || cleanText.length < 15) continue;

      // Chunk text into ~300 character chunks with 50 char overlap
      const maxLen = 300;
      const overlap = 50;
      let start = 0;

      while (start < cleanText.length) {
        const end = Math.min(start + maxLen, cleanText.length);
        const subText = cleanText.slice(start, end).trim();
        const keywords = [
          sec.title.toLowerCase(),
          ...subText
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 3),
        ];

        chunks.push({
          id: `chunk_${raw.sessionId}_${chunkSeq++}`,
          type: "section_text",
          title: sec.title,
          content: `${sec.title}: ${subText}`,
          keywords: Array.from(new Set(keywords)),
          metadata: {
            route: raw.route,
            source: "section_text",
            timestamp,
            section: sec.title,
          },
        });

        if (end >= cleanText.length) break;
        start += maxLen - overlap;
      }
    }
  }

  // 5. Fallback Page Excerpt if chunks are otherwise empty
  if (chunks.length === 0 && raw.visibleExcerpt) {
    const cleanExcerpt = raw.visibleExcerpt.replace(/\s+/g, " ").trim();
    if (cleanExcerpt.length > 0) {
      chunks.push({
        id: `chunk_${raw.sessionId}_${chunkSeq++}`,
        type: "section_text",
        title: raw.pageTitle || "Page Overview",
        content: cleanExcerpt,
        keywords: raw.pageTitle.toLowerCase().split(/\s+/),
        metadata: {
          route: raw.route,
          source: "visible_excerpt",
          timestamp,
        },
      });
    }
  }

  return {
    sessionId: raw.sessionId,
    route: raw.route,
    pageTitle: raw.pageTitle,
    timestamp,
    stock: raw.stock,
    metrics,
    chunks,
  };
}
