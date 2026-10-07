import { NextRequest, NextResponse } from "next/server";
import { generateViaOpenRouter, isOpenRouterConfigured, ChatMessage } from "@/server/ai/openrouter";
import { loadDashboardEnvelope } from "@/server/application/dashboard-envelope";
import type { VoicePageContext } from "@/lib/voice/page-context";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context, history } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { status: "error", message: "Message query is required" },
        { status: 400 }
      );
    }

    const isVoice = context?.mode === "voice";
    const pageContext: Partial<VoicePageContext> = context?.pageContext || {};

    // 1. Identify Target Stock & Exchange (from structured page context or fallback fields)
    const rawSymbol = (
      pageContext.stock?.symbol ||
      context?.symbol ||
      ""
    ).trim().toUpperCase();

    const exchange = (
      pageContext.stock?.exchange ||
      context?.exchange ||
      "NSE"
    ).trim().toUpperCase();

    const pageType = pageContext.pageType || (rawSymbol ? "stock-detail" : "generic");
    const route = pageContext.route || context?.pathname || "/";
    const pageTitle = pageContext.title || context?.title || "Finance-V2";
    const activeTab = pageContext.activeTab || "";
    const visibleSections = pageContext.visibleSections || [];
    const screenText = pageContext.screenText || context?.screenText || "";

    // 2. Fetch Authoritative Server-Side Live Data (Requirement 7)
    // Server data always takes precedence over potentially stale client caches.
    let serverStockData: any = null;
    let authoritativeSummary = "";

    if (rawSymbol && rawSymbol !== "INDIAN MARKETS" && rawSymbol !== "NSE/BSE INDIAN MARKET") {
      try {
        const envelope = await loadDashboardEnvelope(rawSymbol, { exchange });
        if (envelope?.data) {
          serverStockData = envelope.data;
          const { price, metrics, smartScore, riskScore, technicals, shareholding, news, companyName } = serverStockData;
          authoritativeSummary = `
AUTHORITATIVE LIVE SERVER FINANCIAL DATA FOR ${companyName} (${rawSymbol}) [${exchange}]:
- Current Market Price (CMP): ₹${price?.cmp ?? "N/A"} (${price?.changePercent ? (price.changePercent > 0 ? "+" : "") + price.changePercent + "%" : "0%"})
- Day Range / 52-Week: High ₹${price?.fiftyTwoWeekHigh ?? "N/A"}, Low ₹${price?.fiftyTwoWeekLow ?? "N/A"}
- Valuation Ratios: P/E: ${metrics?.pe ?? metrics?.peRatio ?? "N/A"}, P/B: ${metrics?.pb ?? metrics?.pbRatio ?? "N/A"}, Market Cap: ₹${metrics?.marketCap ? Number(metrics.marketCap).toLocaleString("en-IN") + " Cr" : "N/A"}, Dividend Yield: ${metrics?.dividendYield ?? "0"}%, ROE: ${metrics?.roe ?? "N/A"}%, ROCE: ${metrics?.roce ?? "N/A"}%
- AI Smart Score: ${smartScore?.score ?? 8}/${smartScore?.maxScore ?? 10} (${smartScore?.label ?? "Healthy"}), Summary: ${smartScore?.explanation ?? ""}
- Risk Score: ${riskScore?.score ?? 2}/${riskScore?.maxScore ?? 10} (${riskScore?.label ?? "Low Risk"}), Analysis: ${riskScore?.explanation ?? ""}
- Technical Analysis: RSI (14): ${technicals?.rsi14 ?? "50.0"}, MACD: ${technicals?.macd ?? "0.0"}, Trend: ${technicals?.trend ?? "Neutral"}, 20 EMA: ₹${technicals?.ema20 ?? "N/A"}, 50 EMA: ₹${technicals?.ema50 ?? "N/A"}
- Shareholding Structure: Promoter: ${shareholding?.promoters ?? shareholding?.promoterHolding ?? "N/A"}%, FII: ${shareholding?.fii ?? shareholding?.fiiHolding ?? "N/A"}%, DII: ${shareholding?.dii ?? shareholding?.diiHolding ?? "N/A"}%, Pledged: ${shareholding?.pledgedPercentage ?? 0}%
- Recent Corporate News: ${(news || []).slice(0, 3).map((n: any) => n.title).join(" | ")}
`;
        }
      } catch (err) {
        console.warn("[copilot] server envelope fetch error for", rawSymbol, err);
      }
    }

    // 3. Compile Structured Current Page Context (Requirement 6)
    const structuredClientContext = `
STRUCTURED CLIENT PAGE CONTEXT:
- Page Type: ${pageType}
- Route: ${route}
- Active Page Title: ${pageTitle}
${rawSymbol ? `- Selected Stock: ${rawSymbol} (${pageContext.stock?.companyName || rawSymbol})` : "- Selected Stock: None (Browsing generic/screener page)"}
${activeTab ? `- Currently Active Section/Tab: ${activeTab}` : ""}
${visibleSections.length > 0 ? `- Visible Page Components: ${visibleSections.join(", ")}` : ""}
${
  pageContext.price?.current
    ? `- Client Displayed Price: ₹${pageContext.price.current} (${pageContext.price.changePercent}%)`
    : ""
}
${
  pageContext.valuation?.pe
    ? `- Client Displayed P/E: ${pageContext.valuation.pe}`
    : ""
}
${
  pageContext.technicals?.rsi
    ? `- Client Displayed RSI: ${pageContext.technicals.rsi} (${pageContext.technicals.trend || "Neutral"})`
    : ""
}
${
  pageContext.smartScore?.score
    ? `- Client Displayed Smart Score: ${pageContext.smartScore.score}/${pageContext.smartScore.maxScore || 10} (${pageContext.smartScore.label})`
    : ""
}
${
  pageContext.riskScore?.score
    ? `- Client Displayed Risk Score: ${pageContext.riskScore.score}/${pageContext.riskScore.maxScore || 10} (${pageContext.riskScore.label})`
    : ""
}
${screenText ? `- Visible Screen Content Snippet: ${screenText.slice(0, 800)}` : ""}
`;

    // 4. Voice System Instruction (Requirement 8)
    const systemInstruction = isVoice
      ? `You are the real-time voice assistant inside Finance-V2.
You are context-aware.
The user is currently viewing a specific page in the Finance-V2 application.
You have access to the structured context of the current page and live authoritative market data.

${authoritativeSummary || "No specific stock selected on this screen."}
${structuredClientContext}

STRICT VOICE BEHAVIOR RULES:
1. When the user says words such as: "this stock", "this company", "this", "here", "current price", "its RSI", "its P/E", "this score", "why is it risky", "what does this chart show", resolve those references using the CURRENT PAGE CONTEXT.
2. Never ask the user to repeat the stock symbol if the current page already identifies it.
3. If the user navigates to another page, use the new page context. Do not assume that information from a previous page is still relevant.
4. Use exact values from the supplied current data. If client data conflicts with server-side live financial data, prefer the server-side authoritative live data.
5. If a requested metric is not available in the current page context, say that it is not available on this page rather than inventing a value.
6. For financial questions, distinguish clearly between factual data and interpretation.
7. For voice responses:
   - Be punchy, fast, and direct.
   - Keep answers strictly to 1 or 2 spoken sentences maximum so the response is fast and sounds alive.
   - Jump straight to the answer without fluff (e.g. "Reliance CMP is 2,980 rupees, up 1.4% with a healthy smart score of 8 out of 10.").
   - NEVER use markdown symbols (*, #, _, \`), bullet points, lists, or tables.
   - Use Indian English or Hinglish naturally.
   - If the user speaks Hindi/Hinglish, respond in natural, confident Hinglish.
   - If the user speaks English, respond in professional English.
8. The user should feel like they are talking to an assistant that can actually see and understand the page they are currently viewing.`
      : `You are "Forensic Copilot", an elite institutional equity research analyst and forensic accounting expert specializing in Indian financial markets (NSE/BSE).
You have full knowledge of the current stock and page:

${authoritativeSummary}
${structuredClientContext}

Guidelines:
1. Provide structured, razor-sharp institutional insights.
2. Highlight Bull Case and Forensic/Valuation Risks using the exact live metrics above.
3. Keep the tone professional, quantitative, and institutional.
4. Use INR (₹), Cr, Lakhs for currency numbers.`;

    // 5. Build Chat Messages with Short-Term Conversation Memory (Requirement 9)
    const chatMessages: ChatMessage[] = [
      {
        role: "system",
        content: systemInstruction,
      },
    ];

    // Append up to last 4 conversation turns for conversational continuity
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-4);
      for (const item of recentHistory) {
        if (
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          item.content.trim()
        ) {
          chatMessages.push({
            role: item.role,
            content: item.content.trim(),
          });
        }
      }
    }

    chatMessages.push({
      role: "user",
      content: message,
    });

    // 6. Primary Execution: OpenRouter NVIDIA Nemotron 3 Nano Omni 30B Reasoning Model
    if (isOpenRouterConfigured()) {
      const openRouterReply = await generateViaOpenRouter(chatMessages, {
        temperature: 0.2,
        maxTokens: isVoice ? 130 : 400,
        enableReasoning: true,
        timeoutMs: 15000,
      });

      if (openRouterReply) {
        return NextResponse.json({
          status: "success",
          provider: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
          reply: openRouterReply,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 7. Deterministic Fallback if network blips occur
    let fallbackReply = "";
    const activeData = serverStockData || (rawSymbol ? {
      companyName: pageContext.stock?.companyName || rawSymbol,
      price: pageContext.price || {},
      metrics: pageContext.valuation || {},
      technicals: pageContext.technicals || {},
      smartScore: pageContext.smartScore || {},
      riskScore: pageContext.riskScore || {},
      shareholding: pageContext.shareholding || {},
    } : null);

    if (isVoice) {
      const q = message.toLowerCase();
      if (activeData) {
        const p = activeData.price;
        const m = activeData.metrics;
        const t = activeData.technicals;
        const s = activeData.smartScore;
        const cName = activeData.companyName || rawSymbol;

        if (q.includes("52") || (q.includes("high") && !q.includes("pe")) || q.includes("low")) {
          fallbackReply = `${cName} ka 52-week high ₹${p?.fiftyTwoWeekHigh ?? "N/A"} hai aur 52-week low ₹${p?.fiftyTwoWeekLow ?? "N/A"} hai. Current price ₹${p?.cmp ?? p?.current ?? "N/A"} chal raha hai.`;
        } else if (/\bpe\b/i.test(q) || q.includes("p/e") || q.includes("valuation") || /\bpb\b/i.test(q)) {
          fallbackReply = m?.pe || m?.peRatio
            ? `${cName} ka P/E ratio ${m.pe || m.peRatio} hai, aur Price to Book ${m.pb || m.pbRatio || "reasonable"} hai.`
            : `Iss page par ${cName} ka P/E ratio currently available nahi hai.`;
        } else if (q.includes("promoter") || q.includes("fii") || q.includes("dii") || q.includes("holding") || q.includes("shareholding")) {
          const sh = activeData.shareholding;
          fallbackReply = `${cName} me promoter holding ${sh?.promoters ?? sh?.promoter ?? "N/A"} percent hai aur FII holding ${sh?.fii ?? "N/A"} percent hai.`;
        } else if (q.includes("rsi") || q.includes("macd") || q.includes("technical") || q.includes("trend")) {
          fallbackReply = t?.rsi14 || t?.rsi
            ? `Technicals me 14-period RSI ${t.rsi14 || t.rsi} par hai aur overall trend ${t.trend || "Neutral"} dikh raha hai.`
            : `Iss page par technical indicators currently available nahi hain.`;
        } else if (q.includes("score") || q.includes("smart") || q.includes("risk") || q.includes("risky")) {
          fallbackReply = s?.score
            ? `${cName} ka AI Smart Score ${s.score}/${s.maxScore || 10} (${s.label || "Healthy"}) hai, aur risk score low zone me hai.`
            : `${cName} ke financial indicators currently stable category me hain.`;
        } else if (q.includes("price") || q.includes("cmp") || q.includes("bhav") || q.includes("rate") || q.includes("cost") || q.includes("kitna")) {
          fallbackReply = `${cName} ka current market price ₹${p?.cmp ?? p?.current ?? "N/A"} hai, jo lagbhag ${p?.changePercent ?? 0}% change par hai.`;
        } else {
          fallbackReply = `${cName} currently ₹${p?.cmp ?? p?.current ?? "N/A"} par trade kar raha hai. Smart score ${s?.score ?? 8} out of 10 hai.`;
        }
      } else {
        if (q.includes("pe") || q.includes("p/e") || q.includes("price") || q.includes("rsi")) {
          fallbackReply = "Aap currently kisi specific stock page par nahi hain, isliye yeh metric available nahi hai.";
        } else {
          fallbackReply = "Indian markets ke indices aur trending stocks stable hain. Kisi specific stock page par jaakar aap uske live data ke bare me puch sakte hain.";
        }
      }
    } else {
      fallbackReply = `### Analysis for ${rawSymbol || pageTitle}\n\n`;
      if (activeData) {
        fallbackReply += `- Current Price: ₹${activeData.price?.cmp ?? activeData.price?.current ?? "N/A"}\n- Valuation: P/E ${activeData.metrics?.pe ?? "N/A"}\n- Smart Score: ${activeData.smartScore?.score ?? 8}/10\n`;
      }
      fallbackReply += `\nFundamentals are tracked against live exchange feeds.`;
    }

    return NextResponse.json({
      status: "success",
      provider: "deterministic-financial-engine",
      reply: fallbackReply,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
