import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

export async function POST(req: NextRequest) {
  try {
    const { message, audioData, mimeType, history, pageContext } = await req.json();

    if (!message && !audioData) {
      return NextResponse.json(
        { error: "Either message or audioData is required" },
        { status: 400 }
      );
    }

    // Persona: Indian Financial Voice Expert with natural human Indian accent & screen awareness
    let systemInstruction = `You are Priya, a friendly, sharp, and expert Indian financial copilot for Indian stock markets (NSE/BSE).
Tone, Accent & Style:
1. Speak warmly and naturally like an intelligent Indian colleague on a phone call.
2. Use conversational Indian English with natural Hindi/Hinglish touches (e.g. "CMP", "levels", "breakout", "theek hai", "bilkul") when appropriate.
3. Keep spoken replies strictly to 1-2 punchy sentences (under 30-40 words) so it feels like a real human voice call.
4. You have live vision of the user's current screen data. Refer to numbers directly from what's displayed on their screen.
5. Never use markdown symbols like *, #, bullet points or brackets because this text is read aloud by ElevenLabs voice AI.
6. If the user asks in Hindi, reply in warm conversational Hinglish. If in English, reply in natural Indian English.`;

    if (pageContext) {
      systemInstruction += `\n\nCURRENT USER SCREEN CONTEXT:
- Route: ${pageContext.route || "/"}
- Page Title: ${pageContext.title || "Finance Platform"}
${pageContext.symbol ? `- Active Stock Ticker: ${pageContext.symbol}` : ""}
${pageContext.companyName ? `- Company Name: ${pageContext.companyName}` : ""}
${pageContext.price ? `- Current CMP: ₹${pageContext.price}` : ""}
${pageContext.change ? `- Day Change: ${pageContext.change}` : ""}
${pageContext.pe ? `- P/E Ratio: ${pageContext.pe}` : ""}
${pageContext.smartScore ? `- Smart Score: ${pageContext.smartScore}` : ""}
${pageContext.headings ? `- Page Headings: ${pageContext.headings}` : ""}
${pageContext.visibleExcerpt ? `- Visible Content: ${pageContext.visibleExcerpt}` : ""}`;
    }

    // Format conversation history
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-4);
      for (const turn of recent) {
        if (turn.role && turn.text) {
          contents.push({
            role: turn.role === "assistant" || turn.role === "model" ? "model" : "user",
            parts: [{ text: turn.text }],
          });
        }
      }
    }

    // Current turn parts
    const currentParts: any[] = [];
    if (audioData) {
      currentParts.push({
        inlineData: {
          mimeType: mimeType || "audio/webm;codecs=opus",
          data: audioData,
        },
      });
    }
    if (message) {
      currentParts.push({ text: message });
    }

    contents.push({
      role: "user",
      parts: currentParts,
    });

    // 1. Generate text response with Gemini Flash
    let textReply = "";
    if (GEMINI_API_KEY) {
      const candidateModels = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-1.5-flash"];
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
                  temperature: 0.45,
                  maxOutputTokens: 160,
                },
              }),
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

    if (!textReply.trim()) {
      if (pageContext?.symbol) {
        textReply = `Aap abhi ${pageContext.symbol} dekh rahe hain, jiska CMP ₹${pageContext.price || "screen par visible"} hai. Iske levels ya fundamentals me kya check karna hai?`;
      } else {
        textReply = "Hello! Main aapki screen dekh rahi hoon. Aap kis stock ya market trend ke baare me puchna chahte hain?";
      }
    }

    // Clean text reply of any symbols for voice synthesis
    textReply = textReply.replace(/[*#_`~]/g, "").trim();

    // 2. Synthesize lifelike speech via ElevenLabs with Indian accent
    let audioBase64: string | null = null;
    let audioMimeType: string = "audio/mpeg";

    try {
      const speech = await synthesizeSpeech(textReply);
      audioBase64 = speech.audioBase64;
      audioMimeType = speech.mimeType;
    } catch (err: any) {
      console.warn("[voice/talk] ElevenLabs synthesis fallback:", err?.message);
    }

    return NextResponse.json({
      success: true,
      provider: audioBase64 ? "elevenlabs" : "fallback",
      audioBase64,
      audioMimeType,
      textReply,
    });
  } catch (err: any) {
    console.error("[voice/talk] error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
