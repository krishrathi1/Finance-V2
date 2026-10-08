import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

export async function POST(req: NextRequest) {
  try {
    const { message, audioData, mimeType, history, pageContext } = await req.json();

    if (!message && !audioData) {
      return NextResponse.json({ error: "Either message or audioData is required" }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key is not configured" }, { status: 500 });
    }

    // Prepare system instructions and financial context
    let systemInstruction = `You are an elite, crisp, and intelligent financial voice assistant for Indian stock markets (NSE/BSE).
Guidelines:
1. Speak naturally, concisely, and helpfully like a live voice call.
2. Keep spoken replies to 1-3 short sentences (under 40-50 words) unless detailed explanation is asked.
3. Prioritize key financial numbers (CMP, P/E, 52W High/Low, Smart Score).
4. Do not use markdown symbols like *, #, or bullets in your speech.
5. If the user speaks in Hindi or Hinglish, reply naturally in conversational Hinglish. If in English, reply in crisp English.`;

    if (pageContext) {
      systemInstruction += `\n\nCURRENT USER SCREEN / STOCK CONTEXT:
- Route: ${pageContext.route || "/"}
- Title: ${pageContext.title || "Finance Dashboard"}
${pageContext.symbol ? `- Active Stock: ${pageContext.symbol} (${pageContext.companyName || ""})` : ""}
${pageContext.price ? `- Current CMP: ₹${pageContext.price}` : ""}
${pageContext.pe ? `- P/E Ratio: ${pageContext.pe}` : ""}
${pageContext.smartScore ? `- AI Score: ${pageContext.smartScore}` : ""}`;
    }

    // Format contents for Gemini
    const contents: any[] = [];

    // History (last 4 turns)
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

    // 1. Try Gemini 3.8 Flash TTS / 3.8 Flash
    const primaryModel = process.env.GEMINI_MODEL || "gemini-3.8-flash-tts";
    const fallbackModel = "gemini-3.1-flash-lite";

    async function callGemini(modelName: string, isAudioModel: boolean) {
      const payload: any = {
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: isAudioModel ? 2048 : 200,
        },
      };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Model ${modelName} failed with ${res.status}: ${errText.slice(0, 200)}`);
      }

      return await res.json();
    }

    let resultJson: any = null;
    let audioBase64: string | null = null;
    let audioMimeType: string | null = null;
    let textReply: string = "";

    try {
      // First attempt with 3.8 Flash TTS
      resultJson = await callGemini(primaryModel, true);
      const cand = resultJson?.candidates?.[0]?.content?.parts || [];
      for (const p of cand) {
        if (p.inlineData?.data) {
          audioBase64 = p.inlineData.data;
          audioMimeType = p.inlineData.mimeType || "audio/wav";
        }
        if (p.text) {
          textReply += p.text;
        }
      }
    } catch (e: any) {
      console.warn("[gemini-voice] primary model failed, falling back to 3.1-flash-lite:", e?.message);
      // Fallback to text model
      resultJson = await callGemini(fallbackModel, false);
      textReply = resultJson?.candidates?.[0]?.content?.parts?.[0]?.text || "Main aapki awaaz sun raha hoon. Aap market ke baare me kya janna chahte hain?";
    }

    return NextResponse.json({
      success: true,
      audioBase64,
      audioMimeType,
      textReply: textReply.trim(),
    });
  } catch (err: any) {
    console.error("[gemini-voice] error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
