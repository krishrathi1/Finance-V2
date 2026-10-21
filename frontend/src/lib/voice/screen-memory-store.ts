import { ScreenMemoryChunk, ScreenSnapshot, ScreenStockFacts } from "./types";

interface SessionEntry {
  snapshot: ScreenSnapshot;
  lastUpdated: number;
}

/**
 * In-memory session-scoped storage for screen context snapshots.
 * Automatically manages session isolation and TTL eviction.
 */
class ScreenMemoryStore {
  private sessions = new Map<string, SessionEntry>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Save or update the active screen snapshot for a session.
   */
  public saveSnapshot(snapshot: ScreenSnapshot): void {
    this.cleanupExpired();
    this.sessions.set(snapshot.sessionId, {
      snapshot,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Retrieve the active snapshot for a session.
   */
  public getSnapshot(sessionId: string): ScreenSnapshot | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    if (Date.now() - entry.lastUpdated > this.TTL_MS) {
      this.sessions.delete(sessionId);
      return null;
    }
    return entry.snapshot;
  }

  /**
   * Retrieve the most relevant screen-memory chunks for a specific user query.
   * Ranks chunks based on semantic keyword overlap, token presence, and entity matching.
   */
  public retrieveRelevant(
    sessionId: string,
    query: string,
    maxChunks = 4
  ): {
    chunks: ScreenMemoryChunk[];
    stock?: ScreenStockFacts;
    groundingContext: string;
  } {
    const snapshot = this.getSnapshot(sessionId);
    if (!snapshot || !snapshot.chunks || snapshot.chunks.length === 0) {
      return {
        chunks: [],
        groundingContext: "No active screen memory recorded for this session.",
      };
    }

    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const queryTokens = normalizedQuery
      .split(/\s+/)
      .filter((t) => t.length > 2);

    // Score each chunk
    const scored = snapshot.chunks.map((chunk) => {
      let score = 0;
      const lowerContent = chunk.content.toLowerCase();
      const lowerTitle = chunk.title.toLowerCase();

      // Check keywords
      for (const kw of chunk.keywords) {
        if (queryTokens.includes(kw) || normalizedQuery.includes(kw)) {
          score += 4;
        }
      }

      // Check content match
      for (const token of queryTokens) {
        if (lowerTitle.includes(token)) score += 3;
        if (lowerContent.includes(token)) score += 1;
      }

      // Priority boost for structured core stock facts
      if (chunk.type === "structured_fact") {
        score += 2;
      }

      return { chunk, score };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // If query was very generic or no scores were positive, pick the top 3 chunks (structured first)
    const selected = scored
      .filter((item, idx) => item.score > 0 || idx < 2)
      .slice(0, maxChunks)
      .map((item) => item.chunk);

    // Format grounding context
    const lines: string[] = [];
    lines.push(`ACTIVE ROUTE: ${snapshot.route} | PAGE TITLE: ${snapshot.pageTitle}`);

    if (snapshot.stock && snapshot.stock.symbol) {
      const s = snapshot.stock;
      lines.push(
        `ACTIVE STOCK FACTS: Symbol=${s.symbol}, Company=${s.companyName || "N/A"}, CMP=₹${s.price || "N/A"}, Change=${s.changePercent || "N/A"}, PE=${s.pe || "N/A"}, SmartScore=${s.smartScore || "N/A"}`
      );
    }

    lines.push(`RELEVANT SCREEN MEMORY CHUNKS:`);
    for (const ch of selected) {
      lines.push(`- [${ch.title}]: ${ch.content}`);
    }

    return {
      chunks: selected,
      stock: snapshot.stock,
      groundingContext: lines.join("\n"),
    };
  }

  /**
   * Clear session on call completion or unmount.
   */
  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions.entries()) {
      if (now - entry.lastUpdated > this.TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}

// Global singleton instance
export const screenMemoryStore = new ScreenMemoryStore();
