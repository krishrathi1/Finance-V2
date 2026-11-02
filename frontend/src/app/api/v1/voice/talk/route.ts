import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { screenMemoryStore } from "@/lib/voice/screen-memory-store";
import { transcribeWithGroq } from "@/server/ai/groq-whisper";
import { VoiceTalkRequest, VoiceTalkResponse } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

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

    // 2. Prefer Groq Whisper for every recorded utterance. Browser speech
    // recognition text remains a fallback if Whisper is unavailable.
    if (audioData) {
      try {
        const transcript = await transcribeWithGroq(audioData, mimeType || "audio/webm");
        if (transcript) userQuery = transcript;
      } catch (error) {
        console.warn("[voice/talk] Groq transcription failed; using browser transcript if available:", String(error));
        if (!userQuery) {
          const errorText = String(error);
          let userMessage = "Could not transcribe that recording. Please try speaking again.";
          if (/GROQ_API_KEY is not configured|\(401\)|\(403\)/i.test(errorText)) {
            userMessage = "Groq speech transcription is not configured correctly.";
          } else if (/\(429\)/i.test(errorText)) {
            userMessage = "Speech transcription is temporarily rate limited. Please try again shortly.";
          } else if (/invalid_media_file|could not process file|\(400\)/i.test(errorText)) {
            userMessage = "The microphone recording was incomplete. Please speak after the mic starts, then pause or tap Done.";
          }
          return NextResponse.json(
            { success: false, error: userMessage },
            { status: 502 }
          );
        }
      }
    }

    if (!userQuery) {
      return NextResponse.json(
        { success: false, error: "No audible speech was detected. Please ask your financial question again." },
        { status: 400 }
      );
    }

    // 3. Retrieve relevant screen-memory chunks for the user's query
    const retrieved = screenMemoryStore.retrieveRelevant(sessionId, userQuery, 6);

    // 4. Construct grounded system instruction
    const systemInstruction = `You are Priya, an elite Indian financial voice co-pilot for Indian stock markets (NSE/BSE).
Tone, Style & Spoken Persona:
1. Speak naturally like a sharp, friendly Indian market specialist on a live phone call.
2. Keep spoken replies strictly to 1-2 punchy sentences (under 35 words) so listening feels effortless and immediate.
3. Incorporate conversational Indian English and natural Hinglish terms when suitable (CMP, levels, breakout, theek hai, bilkul, pakka).
4. NEVER use markdown symbols (*, #, _, brackets) or bullet points, as this text is read aloud by ElevenLabs voice AI. Replace ₹ with rupees.
5. CRITICAL INSTRUCTION - ANSWER WHAT WAS ASKED:
- The context below describes the page currently open for the user. It may be a stock, portfolio, watchlist, screener, calculator, or another page.
- For page-specific questions, use only facts present in that context. Do not invent values or claim that a value is live if it is not shown there.
- If the requested detail is not present, say it is not visible in the captured page and ask what the user wants to inspect.
- If the user asks for stock price / CMP, state the current price only when it appears in the screen facts.
- If the user asks about a non-stock page, explain the visible page data directly instead of assuming they are on a stock page.
- Never repeat a static greeting. Address the user's exact question in the opening words.

=== CURRENT PAGE SCREEN CONTEXT ===
${retrieved.groundingContext}
=== END OF CURRENT PAGE CONTEXT ===`;

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

    // 6. Generate answer via Gemini Flash
    let textReply = "";
    if (GEMINI_API_KEY) {
      const candidateModels = ["gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-3-flash-preview"];
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
                  maxOutputTokens: 140,
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

    // Clean any markdown formatting symbols before speech synthesis
    textReply = textReply.replace(/[*#_`~]/g, "").replace(/₹/g, " rupees ").trim();

    // 7. Synthesize lifelike human speech using ElevenLabs
    let audioBase64: string | null = null;
    let audioMimeType = "audio/mpeg";

    try {
      const speech = await synthesizeSpeech(textReply);
      audioBase64 = speech.audioBase64;
      audioMimeType = speech.mimeType;
    } catch (err: any) {
      console.warn("[voice/talk] ElevenLabs synthesis failed, using client fallback:", err?.message);
    }

    const response: VoiceTalkResponse = {
      success: true,
      sessionId,
      userQuery,
      textReply,
      provider: audioBase64 ? "elevenlabs" : "fallback",
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
