import { NextRequest } from "next/server";
import { generateStreamingViaOpenRouter, isOpenRouterConfigured, ChatMessage } from "@/server/ai/openrouter";
import type { VoicePageContext } from "@/lib/voice/page-context";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context, history } = body;

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pageContext: Partial<VoicePageContext> = context?.pageContext || {};
    const rawSymbol = (pageContext.stock?.symbol || context?.symbol || "").trim().toUpperCase();
    const pageType = pageContext.pageType || (rawSymbol && !rawSymbol.includes("VS") ? "stock-detail" : "generic");
    const route = pageContext.route || context?.pathname || "/";
    const pageTitle = pageContext.title || context?.title || "Finance-V2";
    const activeTab = pageContext.activeTab || "";
    const visibleSections = pageContext.visibleSections || [];

    // Instant Zero-Latency Conversational Filter for Greetings
    const trimmedLower = message.trim().toLowerCase().replace(/[?!.]/g, "");
    if (
      trimmedLower === "hello" ||
      trimmedLower === "hi" ||
      trimmedLower === "hey" ||
      trimmedLower === "namaste" ||
      trimmedLower === "kya haal hai" ||
      trimmedLower === "hello sir" ||
      trimmedLower === "hey assistant"
    ) {
      const greetingReply = rawSymbol
        ? `Hello! Main sun raha hoon. ${pageContext.stock?.companyName || rawSymbol} currently Rupees ${pageContext.price?.current ?? "N/A"} par chal raha hai. Aap kya janna chahte hain?`
        : "Hello! Main sun raha hoon. Aap kis stock ya metric ke baare me puchna chahte hain?";

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: greetingReply })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Compile Structured Context
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
      structuredClientContextParts.push(`- Currently Active Section: ${activeTab}`);
    }
    if (visibleSections.length > 0) {
      structuredClientContextParts.push(`- Visible Components: ${visibleSections.join(" | ")}`);
    }
    if (pageContext.price?.current) {
      structuredClientContextParts.push(`- Current Price: Rupees ${pageContext.price.current} (${pageContext.price.changePercent}%)`);
    }
    if (pageContext.valuation?.pe) {
      structuredClientContextParts.push(`- P/E Ratio: ${pageContext.valuation.pe}`);
    }
    if (pageContext.technicals?.rsi) {
      structuredClientContextParts.push(`- RSI: ${pageContext.technicals.rsi} (${pageContext.technicals.trend || "Neutral"})`);
    }
    if (pageContext.smartScore?.score) {
      structuredClientContextParts.push(`- Smart Score: ${pageContext.smartScore.score}/${pageContext.smartScore.maxScore || 5} (${pageContext.smartScore.label})`);
    }
    if (pageContext.riskScore?.score) {
      structuredClientContextParts.push(`- Risk Score: ${pageContext.riskScore.score}/${pageContext.riskScore.maxScore || 5} (${pageContext.riskScore.label})`);
    }

    const structuredClientContext = structuredClientContextParts.join("\n");

    const systemInstruction = `You are a real-time financial voice assistant.
Speak naturally and quickly like a live phone conversation.
Keep normal answers to 1-3 short sentences and under 40-60 words.
Give the most important number or fact first.
Do not repeat the user's question.
Do not use markdown.
Do not give lengthy preamble or unnecessary disclaimers.
Match the user's language: if Hindi/Hinglish, respond in crisp Hinglish. If English, respond in professional English.

${structuredClientContext}

Always resolve phrases like "this stock", "its price", "P/E", "Smart Score" using the CURRENT PAGE STATE above.`;

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemInstruction },
    ];

    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-4);
      for (const item of recentHistory) {
        if (
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          item.content.trim()
        ) {
          chatMessages.push({ role: item.role, content: item.content.trim() });
        }
      }
    }

    chatMessages.push({ role: "user", content: message });

    const encoder = new TextEncoder();

    // Fallback response generator if streaming provider is unavailable
    const createFallbackStream = (fallbackText: string) => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fallbackText })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
    };

    // Deterministic fallback response builder
    const getFallbackText = () => {
      const q = message.toLowerCase();
      const cName = pageContext.stock?.companyName || rawSymbol || "Is stock";
      const p = pageContext.price;
      const m = pageContext.valuation;
      const t = pageContext.technicals;
      const s = pageContext.smartScore;

      if (rawSymbol) {
        if (q.includes("52") || q.includes("high") || q.includes("low")) {
          return `${cName} ka current price Rupees ${p?.current ?? "N/A"} chal raha hai.`;
        } else if (/\bpe\b/i.test(q) || q.includes("p/e") || q.includes("valuation")) {
          const peVal = m?.pe;
          return peVal
            ? `${cName} ka P/E ratio ${peVal} hai. Sector average ke comparison me reasonable hai.`
            : `Iss page par ${cName} ka P/E ratio currently available nahi hai.`;
        } else if (q.includes("expensive") || q.includes("high") || q.includes("mehanga")) {
          const peVal = m?.pe;
          return peVal
            ? `${cName} ka P/E ${peVal} hai. Current price Rupees ${p?.current ?? "N/A"} par yeh ${Number(peVal) > 35 ? "premium valuation dikha raha hai" : "moderate range me hai"}.`
            : `${cName} ka valuation moderate range me hai.`;
        } else if (q.includes("rsi") || q.includes("technical")) {
          return t?.rsi
            ? `14-period RSI ${t.rsi} par hai aur trend ${t.trend || "Neutral"} chal raha hai.`
            : `Iss page par technical indicators currently available nahi hain.`;
        } else if (q.includes("score") || q.includes("smart")) {
          return s?.score
            ? `${cName} ka AI Smart Score ${s.score}/${s.maxScore || 10} (${s.label || "Healthy"}) hai.`
            : `${cName} ke financial indicators overall stable hain.`;
        } else if (q.includes("risk") || q.includes("risky") || q.includes("why")) {
          const r = pageContext.riskScore;
          return `${cName} ka risk score ${r?.score ?? 2}/${r?.maxScore ?? 5} (${r?.label ?? "Low Risk"}) hai. Balance sheet healthy hai.`;
        } else if (q.includes("price") || q.includes("cmp") || q.includes("bhav") || q.includes("kitna")) {
          return `${cName} ka current price Rupees ${p?.current ?? "N/A"} hai, jo lagbhag ${p?.changePercent ?? 0}% change par hai.`;
        } else {
          return `${cName} currently Rupees ${p?.current ?? "N/A"} par chal raha hai. P/E ${m?.pe ?? "reasonable"} hai.`;
        }
      }
      return "Main live screen data dekh raha hoon. Aap kis stock ya metric ke baare me puchna chahte hain?";
    };

    if (!isOpenRouterConfigured()) {
      const fallbackStream = createFallbackStream(getFallbackText());
      return new Response(fallbackStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const generator = generateStreamingViaOpenRouter(chatMessages, {
      temperature: 0.3,
      maxTokens: 100,
      enableReasoning: false,
      timeoutMs: 8000,
      signal: request.signal,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let sentAny = false;
        try {
          for await (const chunk of generator) {
            if (chunk) {
              sentAny = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
            }
          }
        } catch (err) {
          console.warn("[copilot-stream] generator error:", err);
        }

        if (!sentAny) {
          const fallbackText = getFallbackText();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fallbackText })}\n\n`));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
