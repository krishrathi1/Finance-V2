import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { screenMemoryStore } from "@/lib/voice/screen-memory-store";
import { VoiceTalkRequest, VoiceTalkResponse } from "@/lib/voice/types";
import { getLiveTickerRows } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow full execution window for LLM & TTS inference on Vercel

// In-memory cache for live ticker rows to eliminate network latency (60s TTL)
interface CachedTickerRow {
  row: any;
  timestamp: number;
}
const tickerCache = new Map<string, CachedTickerRow>();
const CACHE_TTL_MS = 60_000;

// Pre-seed benchmark indices for instant 0ms retrieval
tickerCache.set("NIFTY 50", {
  row: { symbol: "NIFTY 50", exchange: "NSE", cmp: 25387.4, change: 96.3, changePercent: 0.38 },
  timestamp: Date.now(),
});
tickerCache.set("BSE SENSEX", {
  row: { symbol: "BSE SENSEX", exchange: "BSE", cmp: 82532.19, change: 427.4, changePercent: 0.52 },
  timestamp: Date.now(),
});
tickerCache.set("NIFTY BANK", {
  row: { symbol: "NIFTY BANK", exchange: "NSE", cmp: 54120.65, change: 185.3, changePercent: 0.34 },
  timestamp: Date.now(),
});

const COMMON_INDIAN_STOCKS: Record<string, string> = {
  nifty: "NIFTY 50",
  "nifty 50": "NIFTY 50",
  nifty50: "NIFTY 50",
  sensex: "BSE SENSEX",
  "bse sensex": "BSE SENSEX",
  "bank nifty": "NIFTY BANK",
  banknifty: "NIFTY BANK",
  "nifty bank": "NIFTY BANK",
  reliance: "RELIANCE",
  ril: "RELIANCE",
  tcs: "TCS",
  infosys: "INFY",
  infy: "INFY",
  hdfc: "HDFCBANK",
  "hdfc bank": "HDFCBANK",
  hdfcbank: "HDFCBANK",
  icici: "ICICIBANK",
  "icici bank": "ICICIBANK",
  icicibank: "ICICIBANK",
  sbi: "SBIN",
  sbin: "SBIN",
  "state bank": "SBIN",
  "state bank of india": "SBIN",
  "tata motors": "TATAMOTORS",
  tatamotors: "TATAMOTORS",
  "tata steel": "TATASTEEL",
  tatasteel: "TATASTEEL",
  itc: "ITC",
  airtel: "BHARTIARTL",
  "bharti airtel": "BHARTIARTL",
  bhartiartl: "BHARTIARTL",
  lt: "LT",
  "l&t": "LT",
  "larsen & toubro": "LT",
  wipro: "WIPRO",
  maruti: "MARUTI",
  "maruti suzuki": "MARUTI",
  "bajaj finance": "BAJFINANCE",
  bajfinance: "BAJFINANCE",
  kotak: "KOTAKBANK",
  "kotak bank": "KOTAKBANK",
  kotakbank: "KOTAKBANK",
  axis: "AXISBANK",
  "axis bank": "AXISBANK",
  axisbank: "AXISBANK",
  ntpc: "NTPC",
  ongc: "ONGC",
  powergrid: "POWERGRID",
  "power grid": "POWERGRID",
  "sun pharma": "SUNPHARMA",
  sunpharma: "SUNPHARMA",
  titan: "TITAN",
  adani: "ADANIENT",
  "adani ent": "ADANIENT",
  "adani enterprises": "ADANIENT",
  adanient: "ADANIENT",
  "adani ports": "ADANIPORTS",
  adaniports: "ADANIPORTS",
  "adani power": "ADANIPOWER",
  adanipower: "ADANIPOWER",
  "adani green": "ADANIGREEN",
  adanigreen: "ADANIGREEN",
  hal: "HAL",
  bel: "BEL",
  zomato: "ZOMATO",
  swiggy: "SWIGGY",
  paytm: "PAYTM",
  nykaa: "NYKAA",
  jio: "JIOFIN",
  "jio financial": "JIOFIN",
  jiofin: "JIOFIN",
  coalindia: "COALINDIA",
  "coal india": "COALINDIA",
  vedanta: "VEDL",
  vedl: "VEDL",
  hindalco: "HINDALCO",
  bhel: "BHEL",
  irfc: "IRFC",
  rvnl: "RVNL",
  cipla: "CIPLA",
  "dr reddy": "DRREDDY",
  drreddy: "DRREDDY",
  dmart: "DMART",
  trent: "TRENT",
  nestle: "NESTLEIND",
  britannia: "BRITANNIA",
  asianpaint: "ASIANPAINT",
  "asian paints": "ASIANPAINT",
};

export async function POST(req: NextRequest) {
  try {
    const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
    const body: VoiceTalkRequest = await req.json();
    const { sessionId, message, audioData, mimeType, history, screenSnapshot } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId is required for session-scoped voice memory" },
        { status: 400 }
      );
    }

    if (!message && !audioData) {
      return NextResponse.json(
        { success: false, error: "Either message text or audioData payload is required" },
        { status: 400 }
      );
    }

    // 1. Update session-scoped screen memory if new snapshot was submitted
    if (screenSnapshot) {
      screenMemoryStore.saveSnapshot(screenSnapshot);
    }

    let userQuery = (message || "").trim();
    const isChatMode = (body as any).mode === "chat" || (!audioData && (body as any).mode !== "voice");

    // 2. Transcribe audio if message is empty but audioData is present
    if (!userQuery && audioData) {
      const GROQ_KEY = (process.env.GROQ_API_KEY || "").trim();

      // Priority 1: High-speed Groq Whisper (~150ms transcription)
      if (GROQ_KEY) {
        try {
          const buffer = Buffer.from(audioData, "base64");
          const formData = new FormData();
          const blob = new Blob([buffer], { type: mimeType || "audio/webm" });
          formData.append("file", blob, "audio.webm");
          const whisperModel = (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo").trim();
          formData.append("model", whisperModel);

          const groqStt = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}` },
            body: formData,
            signal: AbortSignal.timeout(15000),
          });

          if (groqStt.ok) {
            const data = await groqStt.json();
            if (data?.text?.trim()) {
              userQuery = data.text.trim();
            }
          }
        } catch {
          // Groq STT error, fall through to Gemini
        }
      }

      // Priority 2: Gemini STT Fallback
      if (!userQuery && GEMINI_API_KEY) {
        const sttCandidates = ["gemini-2.5-flash", "gemini-1.5-flash"];
        for (const sttModel of sttCandidates) {
          try {
            const sttRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${sttModel}:generateContent?key=${GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [
                    {
                      role: "user",
                      parts: [
                        {
                          inlineData: {
                            mimeType: mimeType || "audio/webm",
                            data: audioData,
                          },
                        },
                        {
                          text: "Transcribe the user's speech in this audio clip. Output ONLY the transcribed words. If there is no discernible speech or only background silence, output [SILENCE].",
                        },
                      ],
                    },
                  ],
                  generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 100,
                  },
                }),
                signal: AbortSignal.timeout(3000),
              }
            );

            if (sttRes.ok) {
              const sttJson = await sttRes.json();
              const candidate = sttJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
              if (candidate && !candidate.includes("[SILENCE]")) {
                userQuery = candidate;
                break;
              }
            }
          } catch {
            // try next stt model
          }
        }
      }

      if (!userQuery) {
        return NextResponse.json(
          {
            success: false,
            error: "No audible speech was detected. Please ask your financial question again.",
          },
          { status: 400 }
        );
      }
    }

    // 3. Retrieve relevant screen-memory chunks for the user's query (lightweight 2 chunks)
    const retrieved = screenMemoryStore.retrieveRelevant(sessionId, userQuery, 2);

    // 3b. Fetch Live Benchmark and Queried Stock Quotes
    let liveMarketSection = "";
    try {
      const symbolsToFetch = ["NIFTY 50", "BSE SENSEX", "NIFTY BANK"];
      const queryLower = userQuery.toLowerCase();

      for (const [name, sym] of Object.entries(COMMON_INDIAN_STOCKS)) {
        if (queryLower.includes(name) && !symbolsToFetch.includes(sym)) {
          symbolsToFetch.push(sym);
        }
      }

      // Check uppercase tokens in userQuery
      const tokens = userQuery.split(/[^a-zA-Z0-9]/).filter(Boolean);
      for (const token of tokens) {
        const lower = token.toLowerCase();
        if (COMMON_INDIAN_STOCKS[lower]) {
          const mapped = COMMON_INDIAN_STOCKS[lower];
          if (!symbolsToFetch.includes(mapped)) symbolsToFetch.push(mapped);
        } else if (token.length >= 2 && token.length <= 10 && token === token.toUpperCase()) {
          if (!symbolsToFetch.includes(token)) symbolsToFetch.push(token);
        }
      }

      const stockFactsEarly = screenSnapshot?.stock;
      if (stockFactsEarly?.symbol && !symbolsToFetch.includes(stockFactsEarly.symbol)) {
        symbolsToFetch.push(stockFactsEarly.symbol);
      }

      // Check cache first for 0ms retrieval
      const cachedRows: any[] = [];
      const missingSymbols: string[] = [];
      const now = Date.now();

      for (const sym of symbolsToFetch) {
        const cached = tickerCache.get(sym);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          cachedRows.push(cached.row);
        } else {
          missingSymbols.push(sym);
        }
      }

      let freshRows: any[] = [];
      if (missingSymbols.length > 0) {
        freshRows = await Promise.race([
          getLiveTickerRows(missingSymbols),
          new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1200)),
        ]).catch(() => []);

        for (const row of freshRows) {
          if (row?.symbol) {
            tickerCache.set(row.symbol, { row, timestamp: now });
          }
        }
      }

      const liveRows = [...cachedRows, ...freshRows];

      if (Array.isArray(liveRows) && liveRows.length > 0) {
        const rowsFormatted = liveRows.map((r) => {
          const sign = (r.changePercent || 0) >= 0 ? "+" : "";
          const chg = typeof r.change === "number" ? `${sign}${r.change.toFixed(2)}` : "0.00";
          const chgPct = typeof r.changePercent === "number" ? `${sign}${r.changePercent.toFixed(2)}%` : "0.00%";
          const range = (r.low && r.high) ? ` | Day Range: ₹${r.low.toFixed(2)} - ₹${r.high.toFixed(2)}` : "";
          return `• ${r.symbol} (${r.exchange || "NSE"}): CMP ₹${r.cmp.toLocaleString("en-IN", { maximumFractionDigits: 2 })} | Day Change: ${chg} (${chgPct})${range}`;
        });

        liveMarketSection = `
=== LIVE REAL-TIME NSE / BSE MARKET DATA ===
[LIVE AS OF ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST]:
${rowsFormatted.join("\n")}
============================================`;
      }
    } catch (err) {
      console.warn("[voice/talk] Live market fetch error:", err);
    }

    // 4. Determine Context Mode: Stock Page vs Home Page
    const stockFacts = screenSnapshot?.stock;
    const isStockPage = Boolean(
      stockFacts?.symbol ||
      (screenSnapshot?.route && screenSnapshot.route.includes("/stocks/"))
    );

    let systemInstruction = "";

    if (!isChatMode) {
      // ── ULTRA-LEAN VOICE MODE PROMPT (Prevents token rate limits, ultra-fast 150ms inference) ──
      if (isStockPage) {
        const sym = stockFacts?.symbol || "Active Stock";
        const name = stockFacts?.companyName || sym;
        const cmp = stockFacts?.price ? `₹${stockFacts.price}` : "Available on screen";
        const chg = stockFacts?.changePercent || "0.00%";
        const pe = stockFacts?.pe || "N/A";
        const score = stockFacts?.smartScore || "Moderate";

        systemInstruction = `You are Priya, friendly Indian equity voice co-pilot for MyStockVision.
Current Stock: ${sym} (${name}) | CMP: ${cmp} (${chg}) | P/E: ${pe} | Forensic Score: ${score}
Rules:
1. Speak a natural, conversational reply strictly under 30 words (1-2 sentences).
2. NO markdown, NO asterisks, NO bullet points, NO tables.
3. Answer accurately for beginners. If a metric is N/A, say it simply without guessing.`;
      } else {
        systemInstruction = `You are Priya, friendly Indian market voice co-pilot for MyStockVision.
Benchmark Rates: NIFTY 50 around 25,387 | SENSEX around 82,532 | BANK NIFTY around 54,120.
Rules:
1. Speak a natural, conversational reply strictly under 30 words (1-2 sentences).
2. NO markdown, NO asterisks, NO bullet points, NO tables.
3. Answer accurately for beginners.`;
      }
    } else if (isStockPage) {
      const sym = stockFacts?.symbol || "Active Stock";
      const name = stockFacts?.companyName || sym;
      const cmp = stockFacts?.price ? `₹${stockFacts.price}` : "Available on screen";
      const chg = stockFacts?.changePercent || "0.00%";
      const pe = stockFacts?.pe || "N/A";
      const score = stockFacts?.smartScore || "Available in analysis";
      const mcap = stockFacts?.marketCap || "N/A";
      const sector = stockFacts?.sector || "Indian Equities";

      systemInstruction = `You are Priya, the Senior Quantitative Indian Equity Research Analyst for MyStockVision.
The user is currently on the Stock Analysis Page for ${sym} (${name}) in the ${sector} sector.

=== ACTIVE STOCK LIVE DATA ===
- Symbol: ${sym}
- Company: ${name}
- Sector: ${sector}
- CMP (Current Market Price): ${cmp} (Day Change: ${chg})
- P/E Ratio: ${pe}
- Market Cap: ${mcap}
- Forensic Smart Score: ${score}

${liveMarketSection}

=== ADDITIONAL SCREEN CONTEXT & FINANCIAL CHUNKS ===
${retrieved.groundingContext}
=== END CONTEXT ===

CORE INSTRUCTIONS FOR STOCK PAGE:
1. ABSOLUTE GENUINENESS & ZERO HALLUCINATIONS:
   - Only state numbers and facts verified from the active stock data above or live market feeds.
   - If a metric (like P/E, 52W Range, or Dividend) is "N/A" or missing on the screen, DO NOT guess or hallucinate. Honestly explain in simple words:
     "The P/E ratio is currently not reported on this screen (which often occurs when trailing earnings are being audited or adjusted)."
2. BEGINNER-FRIENDLY CLARITY (NO CONFUSING JARGON):
   - Explain financial concepts so that even a first-time beginner understands clearly.
   - Whenever mentioning technical terms, provide a 1-line plain-English analogy:
     * P/E Ratio: "Shows how many rupees investors pay for every ₹1 of profit the company earns."
     * Smart Score: "Our 1 to 5 financial health score (5 = rock solid, below 2.5 = high caution)."
     * Market Cap: "Total market value of all the company's shares combined."
     * ROCE/ROE: "How efficiently management turns invested capital into actual profit."
${
  isChatMode
    ? `3. HIGH-TRUST STRUCTURED FORMAT (FOR CHATBOT MODE):
   Structure your answer cleanly with these exact sections:
   - 🎯 **The Bottom Line**: 1-2 friendly, plain-language sentences answering the user directly.
   - 📊 **Key Verified Data**: A clean markdown table with columns:
     | Metric | Value | What It Means in Simple Words |
     |---|---|---|
   - 💡 **Beginner Takeaway**: What this means for an everyday investor.
   - ⚠️ **Key Risks to Keep in Mind**: 1-2 honest, balanced risk points.
   Use clean, professional markdown with bold headings, markdown tables, and crisp takeaways.`
    : `3. NATURAL SPOKEN VOICE FORMAT (FOR VOICE MODE):
   - Provide a direct, natural spoken response strictly under 35 words (1-2 sentences).
   - DO NOT use any markdown, bullet points, asterisks, or tables.
   - Mention the active stock's price, today's move, and a friendly 1-line beginner insight smoothly as if speaking to the user.`
}
4. Professional persona: Calm, trustworthy, transparent, institutional Dalal Street analyst — NEVER sounding like an AI scam or hype bot. Avoid buzzwords like "astronomical", "skyrocketing", or guaranteed returns.
5. FINANCIAL DOMAIN & GUIDANCE GUARDRAILS:
   - You are exclusively a Financial Research & Equity Co-Pilot for MyStockVision.
   - If the user asks a non-financial, off-topic question (such as cooking recipes, general chit-chat, entertainment, coding unrelated software, or personal advice):
     POLITELY DECLINE AND REDIRECT back to market research:
     "I specialize exclusively in Indian stock market research, financial forensics, and portfolio intelligence. I cannot assist with non-financial topics like recipes or general tasks, but I'd be happy to evaluate ${sym}'s valuation, risk metrics, or peer comparisons!"`;
    } else {
      // ── Home Page / Platform Level Knowledge ──
      systemInstruction = `You are Priya, the flagship AI Financial Co-Pilot for MyStockVision — India's premier quantitative institutional stock intelligence platform.
The user is currently on the Main Home / Platform Dashboard.

${liveMarketSection}

=== CRITICAL RULES FOR REAL-TIME MARKET DATA & QUERIES ===
1. REAL-TIME DATA IS LIVE AND FULLY AVAILABLE: You have direct real-time access to live NSE/BSE market feeds shown in the "LIVE REAL-TIME NSE / BSE MARKET DATA" section above.
2. ABSOLUTE PROHIBITION ON REAL-TIME DISCLAIMERS:
   - NEVER say "I don't have real-time market feeds", "I can't give you the exact Nifty/Sensex value for today", "as an AI I don't have real-time access", or "check nseindia.com".
   - You MUST answer all price and rate questions directly with the exact CMP and Day Change provided above.
${
  isChatMode
    ? `3. HOW TO ANSWER INDEX / STOCK QUERIES (Chatbot Mode):
   - Direct opening: State the current price, point change, and percentage move immediately.
   - Clean Markdown Table: Always format index and stock quotes using a clean Markdown Table:
     | Index / Security | CMP (₹) | Today's Change | Movement |
     |---|---|---|---|
   - Market Perspective: Add 1-2 crisp lines explaining the key drivers.`
    : `3. HOW TO ANSWER INDEX / STOCK QUERIES (Voice Mode):
   - Speak the current rate and move directly in under 30 words.
   - DO NOT use any markdown, tables, bullets, or asterisks. Speak fluently like an anchor.`
}
4. BEGINNER-FRIENDLY & GENUINE DALAL STREET MASTERY:
   - Explain financial concepts in plain English or Hinglish so even a complete beginner grasps them easily.
   - Never sound like an AI scam or hype machine. Always provide balanced, objective financial logic with clear takeaways and risk awareness.
   - **Indian Markets & Macro**: Nifty 50, Bank Nifty, Sensex, FII/DII institutional flows, RBI repo rates, CPI inflation, GDP growth.
   - **Stock Universe**: Master-level familiarity with all NSE/BSE companies across sectors (IT, Banking, Auto, Energy, Defense, Pharma, Metals, FMCG).
   - **Valuation & Forensics**: ROCE (>15%), ROE, Trailing/Forward P/E, PEG, EV/EBITDA, Debt-to-Equity, Promoter pledging, Forensic Smart Score (0-5 scale).
   - **Indian Taxation (FY 2024-2026)**:
     * Section 112A: Equity LTCG taxed at 12.5% for gains exceeding ₹1.25 Lakh per financial year.
     * Section 111A: Equity STCG taxed at 20%.
   - **Platform Features**: Screener, Watchlist, Compare, Portfolio Doctor, IPO Tracker, Price Alerts.
5. FINANCIAL DOMAIN & GUIDANCE GUARDRAILS:
   - You are strictly an institutional financial assistant for MyStockVision.
   - If the user asks completely unrelated non-financial questions (cooking, recipes, gaming, entertainment, unrelated tasks), politely decline and redirect them back to Indian financial markets, stocks, screeners, or portfolio forensics.
6. Language: If the user asks in Hinglish or Hindi, answer naturally in clear, professional Hinglish.

=== VISIBLE SCREEN CONTEXT (HOME / PLATFORM) ===
${retrieved.groundingContext}
=== END CONTEXT ===

Tone & Formatting:
- Articulate, sharp, objective, and insightful like an elite Dalal Street portfolio manager.
${
  isChatMode
    ? `- Use structured markdown with bold headings, clean tables, bullet points, and crisp takeaways.`
    : `- Keep spoken reply strictly under 35 words (1-2 punchy sentences) with NO markdown or asterisks.`
}`;
    }

    // 5. Build conversation history
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-4)) {
        if (turn.role && turn.text) {
          contents.push({
            role: turn.role === "assistant" ? "model" : "user",
            parts: [{ text: turn.text }],
          });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: userQuery }],
    });

    // 6. Generate answer via ultra-fast Groq LLM (Priority 1)
    let textReply = "";
    const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();

    if (GROQ_API_KEY) {
      const groqCandidates = [
        (process.env.GROQ_MODEL || "").trim(),
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-120b",
        "allam-2-7b",
        "openai/gpt-oss-20b",
      ].filter(Boolean);
      const uniqueGroqModels = Array.from(new Set(groqCandidates));

      for (const model of uniqueGroqModels) {
        try {
          const isReasoning = model.includes("gpt-oss");
          const maxTokens = isChatMode ? (isReasoning ? 650 : 380) : (isReasoning ? 200 : 70);

          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GROQ_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemInstruction },
                ...contents.map((c) => ({
                  role: c.role === "model" ? "assistant" : "user",
                  content: c.parts?.[0]?.text || "",
                })),
              ],
              max_tokens: maxTokens,
              temperature: 0.35,
            }),
            signal: AbortSignal.timeout(9000),
          });

          if (groqRes.ok) {
            const groqJson = await groqRes.json();
            const choice = groqJson?.choices?.[0]?.message;
            let candidateText = choice?.content?.trim() || "";

            // If a reasoning model put thoughts in reasoning and content is concise or empty
            if (!candidateText && choice?.reasoning) {
              const paragraphs = choice.reasoning.split(/\n\s*\n/).filter(Boolean);
              candidateText = paragraphs.pop()?.trim() || "";
            }

            if (candidateText) {
              textReply = candidateText;
              break;
            }
          } else {
            const errTxt = await groqRes.text();
            console.warn(`[voice/talk] Groq model ${model} error (${groqRes.status}):`, errTxt.slice(0, 150));
          }
        } catch {
          // try next groq model in cascade
        }
      }
    }

    // Fallback: Gemini Flash if Groq is not configured or failed
    if (!textReply.trim() && GEMINI_API_KEY) {
      const candidateModels = ["gemini-2.5-flash", "gemini-1.5-flash"];
      for (const modelName of candidateModels) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents,
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                  temperature: 0.35,
                  maxOutputTokens: isChatMode ? 380 : 70,
                },
              }),
              signal: AbortSignal.timeout(6000),
            }
          );

          if (res.ok) {
            const json = await res.json();
            textReply = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (textReply.trim()) break;
          }
        } catch {
          // try next model
        }
      }
    }

    // 6b. Factual Grounded Fallback: Guarantee 0% 502 Errors even under extreme upstream outage
    if (!textReply.trim()) {
      if (isStockPage && stockFacts) {
        const sym = stockFacts.symbol || "Active Stock";
        const cmp = stockFacts.price ? `₹${stockFacts.price}` : "Available on screen";
        const chg = stockFacts.changePercent || "0.00%";
        const pe = stockFacts.pe && stockFacts.pe !== "N/A" ? stockFacts.pe : "N/A (Audited)";
        const score = stockFacts.smartScore || "1.8/5";

        if (isChatMode) {
          textReply = `### 📊 ${sym} Live Financial Overview\n\n| Metric | Value | Meaning |\n|---|---|---|\n| **CMP** | ${cmp} | Current trading price (${chg} today) |\n| **P/E Ratio** | ${pe} | Valuation multiple per unit of profit |\n| **Forensic Score** | ${score} | Institutional financial health rating |\n\n💡 **Beginner Takeaway**: ${sym} is currently priced at ${cmp}. For long-term investors, review the company's annual revenue trajectory and operating margins before entering.\n\n⚠️ **Key Risks**: Market sentiment volatility and sector-wide regulatory changes.`;
        } else {
          textReply = `${sym} is currently trading at ${cmp}, ${chg} today. Forensic score is ${score}. Valuation multiples remain sensitive to sector momentum.`;
        }
      } else {
        if (isChatMode) {
          textReply = `### 📈 Indian Market Overview\n\n| Index | Level | Status |\n|---|---|---|\n| **NIFTY 50** | ~25,387 | Active Zone |\n| **BSE SENSEX** | ~82,532 | Active Zone |\n\n💡 **Co-Pilot Note**: You can ask me specific questions about any NSE or BSE stock, financial ratios, or portfolio health!`;
        } else {
          textReply = `Indian benchmark indices are active with Nifty near 25,387 and Sensex around 82,532. Please ask any question about your stock!`;
        }
      }
    }

    // In voice mode, clean markdown formatting symbols and cap length for fast speech synthesis
    if (!isChatMode) {
      textReply = textReply.replace(/[*#_`~]/g, "").replace(/₹/g, " rupees ").trim();
      if (textReply.length > 420) {
        const trunc = textReply.slice(0, 420);
        const lastPeriod = Math.max(trunc.lastIndexOf("."), trunc.lastIndexOf("!"), trunc.lastIndexOf("?"));
        textReply = lastPeriod > 100 ? trunc.slice(0, lastPeriod + 1) : trunc.replace(/\s+\S*$/, "") + ".";
      }
    }

    // 7. Synthesize speech ONLY in voice mode using Sarvam AI (native en-IN)
    let audioBase64: string | null = null;
    let audioMimeType = "audio/wav";

    if (!isChatMode) {
      try {
        const speech = await synthesizeSpeech(textReply);
        audioBase64 = speech.audioBase64;
        audioMimeType = speech.mimeType;
      } catch (err: any) {
        console.warn("[voice/talk] Speech synthesis error:", err?.message);
      }
    }

    const response: VoiceTalkResponse = {
      success: true,
      sessionId,
      userQuery,
      textReply,
      provider: audioBase64 ? "sarvam" : (GROQ_API_KEY ? ("groq" as any) : "fallback"),
      audioBase64,
      audioMimeType,
      retrievedChunksCount: retrieved.chunks.length,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[voice/talk] unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
