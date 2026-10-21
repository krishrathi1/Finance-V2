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

    // System instruction: Human conversational financial copilot with page sight
    let systemInstruction = `You are a real-time conversational financial voice assistant for Indian stock markets (NSE/BSE).
Tone & Personality:
1. Speak naturally like a sharp, friendly human financial expert in a live voice conversation.
2. Keep spoken replies strictly to 1-3 short, punchy sentences (under 35-45 words) so it sounds like natural speech.
3. You have live vision of the user's current webpage/screen.
4. If the user asks "What am I looking at?", "Explain this", or asks about this stock/page, reference their current screen directly.
5. Do NOT use markdown symbols (*, #, _, backticks) or bullet lists, as this text will be spoken aloud by ElevenLabs voice AI.
6. If the user speaks in Hindi or Hinglish, reply naturally in conversational Hinglish. If English, reply in crisp, clear English.`;

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
                  temperature: 0.4,
                  maxOutputTokens: 180,
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
        textReply = `Aap ${pageContext.symbol} ka page dekh rahe hain. Current market price lagbhag ${pageContext.price || "screen par visible"} hai. Iske baare me aapko kya detail chahiye?`;
      } else {
        textReply = "Hello! Main aapki screen dekh raha hoon. Aap market ya kisi stock ke baare me kya janna chahte hain?";
      }
    }

    // Clean text reply of any symbols for voice synthesis
    textReply = textReply.replace(/[*#_`~]/g, "").trim();

    // 2. Synthesize lifelike speech via ElevenLabs
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
