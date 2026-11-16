import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { screenMemoryStore } from "@/lib/voice/screen-memory-store";
import { VoiceTalkRequest, VoiceTalkResponse } from "@/lib/voice/types";
import { getLiveTickerRows } from "@/lib/market/indian-market";

export const dynamic = "force-dynamic";

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
    const isChatMode = !audioData;

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
          formData.append("model", "whisper-large-v3");

          const groqStt = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}` },
            body: formData,
            signal: AbortSignal.timeout(3500),
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

    // 3. Retrieve relevant screen-memory chunks for the user's query
    const retrieved = screenMemoryStore.retrieveRelevant(sessionId, userQuery, 6);

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

      const liveRows = await Promise.race([
        getLiveTickerRows(symbolsToFetch),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500)),
      ]).catch(() => []);

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

    if (isStockPage) {
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

CORE INSTRUCTIONS:
1. Ground your analysis directly in this active stock's live metrics: CMP, Day Change, Valuation (P/E, Market Cap, ROCE, ROE), Smart Score (0-5 quantitative scale), Risk ratings, Quarterly results, Shareholding pattern, and Technical momentum.
2. If asked about overall markets (Nifty 50, Sensex, Bank Nifty), use the LIVE REAL-TIME NSE / BSE MARKET DATA section above. NEVER claim you do not have live data.
3. If asked for an opinion or whether the stock is safe / good to buy: provide a balanced, forensic evaluation based on fundamental quality, debt levels, earnings growth, and valuation.
4. Professional persona: Sharp, articulate, objective, and friendly Indian financial market specialist.
${
  isChatMode
    ? `5. FORMATTING (Chatbot Mode): Use clean, professional markdown with bold headings, markdown tables, key metric highlights, bullet points, and crisp takeaways.`
    : `5. FORMATTING (Voice Mode): Keep spoken reply strictly under 35 words (1-2 punchy sentences) with NO markdown or asterisks, so speech synthesis sounds natural.`
}`;
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
3. HOW TO ANSWER INDEX / STOCK QUERIES (e.g. "what is todays nifty rate", "sensex today", "reliance rate"):
   - Direct opening: State the current price, point change, and percentage move immediately.
   - Clean Markdown Table: Always format index and stock quotes using a clean Markdown Table:
     | Index / Security | CMP (₹) | Today's Change | Movement |
     |---|---|---|---|
   - Market Perspective: Add 1-2 crisp lines explaining the key drivers (e.g. heavyweights, banking/IT support, global cues).
4. COMPREHENSIVE DALAL STREET DOMAIN MASTERY:
   - **Indian Markets & Macro**: Nifty 50, Bank Nifty, Sensex, FII/DII institutional flows, RBI repo rates, CPI inflation, GDP growth.
   - **Stock Universe**: Master-level familiarity with all NSE/BSE companies across sectors (IT, Banking, Auto, Energy, Defense, Pharma, Metals, FMCG).
   - **Valuation & Forensics**: ROCE (>15%), ROE, Trailing/Forward P/E, PEG, EV/EBITDA, Debt-to-Equity, Promoter pledging, Forensic Smart Score (0-5 scale).
   - **Indian Taxation (FY 2024-2026)**:
     * Section 112A: Equity LTCG taxed at 12.5% for gains exceeding ₹1.25 Lakh per financial year.
     * Section 111A: Equity STCG taxed at 20%.
   - **Platform Features**: Screener, Watchlist, Compare, Portfolio Doctor, IPO Tracker, Price Alerts.
5. Language: If the user asks in Hinglish or Hindi, answer naturally in clear, professional Hinglish.

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
      const groqModels = [
        (process.env.GROQ_MODEL || "").trim(),
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
      ].filter(Boolean);

      for (const model of groqModels) {
        try {
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
              max_tokens: isChatMode ? 800 : 140,
              temperature: 0.35,
            }),
            signal: AbortSignal.timeout(6000),
          });

          if (groqRes.ok) {
            const groqJson = await groqRes.json();
            textReply = groqJson?.choices?.[0]?.message?.content?.trim() || "";
            if (textReply) break;
          } else {
            const errTxt = await groqRes.text();
            console.warn(`[voice/talk] Groq model ${model} error (${groqRes.status}):`, errTxt.slice(0, 150));
          }
        } catch {
          // try next groq model
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
                  maxOutputTokens: isChatMode ? 800 : 140,
                },
              }),
              signal: AbortSignal.timeout(5000),
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

    // Never substitute a hardcoded greeting for a failed model response
    if (!textReply.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "AI model could not formulate a response. Please rephrase or try again in a moment.",
        },
        { status: 502 }
      );
    }

    // In voice mode, clean markdown formatting symbols before speech synthesis
    if (!isChatMode) {
      textReply = textReply.replace(/[*#_`~]/g, "").replace(/₹/g, " rupees ").trim();
    }

    // 7. Synthesize speech if voice mode OR for test harness compatibility
    let audioBase64: string | null = null;
    let audioMimeType = "audio/mpeg";

    try {
      const speech = await synthesizeSpeech(textReply);
      audioBase64 = speech.audioBase64;
      audioMimeType = speech.mimeType;
    } catch {
      // Speech synthesis fallback handled client-side if not configured
    }

    const response: VoiceTalkResponse = {
      success: true,
      sessionId,
      userQuery,
      textReply,
      provider: GROQ_API_KEY ? "groq" as any : audioBase64 ? "elevenlabs" : "fallback",
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
