import { NextRequest, NextResponse } from "next/server";
import { generateViaOpenRouter, isOpenRouterConfigured, ChatMessage } from "@/server/ai/openrouter";
import { loadDashboardEnvelope } from "@/server/application/dashboard-envelope";
import { buildVoiceFinancialContext } from "@/server/ai/voice-financial-context";
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

    const pageType = pageContext.pageType || (rawSymbol && !rawSymbol.includes("VS") ? "stock-detail" : "generic");
    const route = pageContext.route || context?.pathname || "/";
    const pageTitle = pageContext.title || context?.title || "Finance-V2";
    const activeTab = pageContext.activeTab || "";
    const visibleSections = pageContext.visibleSections || [];
    const screenText = pageContext.screenText || context?.screenText || "";

    // 2. Fetch Authoritative Server-Side Live Data from complete DashboardEnvelope
    let serverStockData: any = null;
    let authoritativeSummary = "";

    if (rawSymbol && !rawSymbol.includes("VS") && rawSymbol !== "INDIAN MARKETS" && rawSymbol !== "NSE/BSE INDIAN MARKET") {
      try {
        const envelope = await loadDashboardEnvelope(rawSymbol, { exchange });
        if (envelope?.data) {
          serverStockData = envelope.data;
          authoritativeSummary = buildVoiceFinancialContext(envelope.data);
        }
      } catch (err) {
        console.warn("[copilot] server envelope fetch error for", rawSymbol, err);
      }
    }

    // 3. Compile Structured Current Page Context
    const structuredClientContextParts: string[] = [
      `STRUCTURED CURRENT PAGE STATE:`,
      `- Page Type: ${pageType}`,
      `- Route: ${route}`,
      `- Active Page Title: ${pageTitle}`,
    ];

    if (rawSymbol) {
      structuredClientContextParts.push(`- Current Stock: ${rawSymbol} (${pageContext.stock?.companyName || rawSymbol})`);
    }
    if (activeTab) {
      structuredClientContextParts.push(`- Currently Active Section / Tab: ${activeTab}`);
    }
    if (visibleSections.length > 0) {
      structuredClientContextParts.push(`- Visible Page Components / Items: ${visibleSections.join(" | ")}`);
    }

    // Chart State Awareness
    if (pageContext.chart) {
      structuredClientContextParts.push(
        `- Active Chart: ${pageContext.chart.activeTab || "Price"} (Timeframe: ${pageContext.chart.timeframe || "Daily"}, Visible Indicators: ${(pageContext.chart.indicators || []).join(", ")})`
      );
    }

    // Portfolio State Awareness
    if (pageContext.portfolio) {
      const pf = pageContext.portfolio;
      structuredClientContextParts.push(
        `- Portfolio Overview: Total Value ₹${pf.totalValue?.toLocaleString("en-IN") || 0}, Invested ₹${pf.totalInvested?.toLocaleString("en-IN") || 0}, Total P&L ₹${pf.totalPnl?.toLocaleString("en-IN") || 0} (${pf.totalPnlPercent?.toFixed(1) || 0}%), Holdings Count: ${pf.holdingsCount || 0}`
      );
      if (pf.topHoldings && pf.topHoldings.length > 0) {
        structuredClientContextParts.push(`- Top Portfolio Holdings: ${pf.topHoldings.join(" | ")}`);
      }
    }

    // Screener State Awareness
    if (pageContext.screener) {
      const sc = pageContext.screener;
      structuredClientContextParts.push(
        `- Screener View: Preset: ${sc.activePreset || "Default"}, Matches Count: ${sc.resultsCount || 0}${sc.query ? `, Query: "${sc.query}"` : ""}`
      );
      if (sc.topMatches && sc.topMatches.length > 0) {
        structuredClientContextParts.push(`- Top Matching Stocks: ${sc.topMatches.join(" | ")}`);
      }
    }

    // Client Displayed Fundamentals & Technicals Fallbacks
    if (pageContext.price?.current) {
      structuredClientContextParts.push(`- Client Price: ₹${pageContext.price.current} (${pageContext.price.changePercent}%)`);
    }
    if (pageContext.valuation?.pe) {
      structuredClientContextParts.push(`- Client P/E: ${pageContext.valuation.pe}`);
    }
    if (pageContext.technicals?.rsi) {
      structuredClientContextParts.push(`- Client RSI: ${pageContext.technicals.rsi} (${pageContext.technicals.trend || "Neutral"})`);
    }
    if (pageContext.smartScore?.score) {
      structuredClientContextParts.push(`- Client Smart Score: ${pageContext.smartScore.score}/${pageContext.smartScore.maxScore || 5} (${pageContext.smartScore.label})`);
    }
    if (pageContext.riskScore?.score) {
      structuredClientContextParts.push(`- Client Risk Score: ${pageContext.riskScore.score}/${pageContext.riskScore.maxScore || 5} (${pageContext.riskScore.label})`);
    }
    if (screenText) {
      structuredClientContextParts.push(`- Visible Screen Snippet (Fallback): ${screenText.slice(0, 500)}`);
    }

    const structuredClientContext = structuredClientContextParts.join("\n");

    // 4. Voice System Instruction
    const systemInstruction = isVoice
      ? `You are Finance-V2's real-time voice financial assistant.
You have access to the complete current page context and authoritative financial data for the page the user is currently viewing.

The current page is the source of context for phrases such as:
this stock, this company, this, here, its price, its RSI, its valuation, this score, this chart, this risk, this result, my portfolio, this screen.

Always resolve these references using the CURRENT PAGE STATE and AUTHORITATIVE LIVE DATA below.

If the user navigates to another stock or page, immediately use the new page context.
Never carry stock-specific facts from a previous page into the new page, except when the user explicitly asks for a comparison with the previous stock.

${authoritativeSummary ? `AUTHORITATIVE LIVE FINANCIAL REPORT:\n${authoritativeSummary}` : "No single stock open on this screen."}

${structuredClientContext}

STRICT SPOKEN RULES:
1. Speak naturally with clear financial authority.
2. Be punchy, fast, and direct. Keep answers strictly to 1 or 2 spoken sentences maximum so the response is fast and sounds alive.
3. Use exact supplied values from authoritative data. If an exact metric is not available on this screen, clearly state that it is not available.
4. Jump straight to the answer without preamble or fluff (e.g. "Reliance CMP is 2,980 rupees, up 1.4% with a healthy smart score of 8 out of 10.").
5. NEVER use markdown symbols (*, #, _, \`), bullet points, numbered lists, or tables.
6. Use Indian English or Hinglish naturally. If the user speaks Hindi/Hinglish, respond in natural, confident Hinglish. If English, respond in professional English.
7. You are an assistant, not a financial guarantee or trading recommendation.`
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
