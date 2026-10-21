import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { screenMemoryStore } from "@/lib/voice/screen-memory-store";
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

    // 2. Transcribe audio if message is empty but audioData is present
    if (!userQuery && audioData) {
      if (!GEMINI_API_KEY) {
        return NextResponse.json(
          { success: false, error: "Speech-to-text requires configured GEMINI_API_KEY" },
          { status: 500 }
        );
      }

      const sttRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
        }
      );

      if (sttRes.ok) {
        const sttJson = await sttRes.json();
        const candidate = sttJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (candidate && !candidate.includes("[SILENCE]")) {
          userQuery = candidate;
        }
      }

      if (!userQuery) {
        return NextResponse.json(
          {
            success: false,
            error: "No audible speech was detected. Please tap and speak your financial question.",
          },
          { status: 400 }
        );
      }
    }

    // 3. Retrieve relevant screen-memory chunks for the user's query
    const retrieved = screenMemoryStore.retrieveRelevant(sessionId, userQuery, 4);

    // 4. Construct grounded system instruction
    const systemInstruction = `You are Priya, an elite Indian financial co-pilot for Indian stock markets (NSE/BSE).
Tone, Style & Spoken Persona:
1. Speak naturally like a sharp, friendly Indian market specialist on a quick voice call.
2. Keep spoken replies strictly to 1-2 punchy sentences (under 35-40 words) so listening feels effortless.
3. Incorporate conversational Indian English and natural Hinglish terms when suitable (CMP, levels, breakout, theek hai, bilkul).
4. NEVER use markdown symbols (*, #, _, brackets) or bullet lists, as this text will be read aloud by ElevenLabs voice AI.
5. GROUNDING RULE: You have live vision of the user's active screen data below. Answer the user's specific question using these verified facts. Never fabricate numbers not on the screen.

=== LIVE GROUNDED SCREEN CONTEXT ===
${retrieved.groundingContext}
=== END OF CONTEXT ===`;

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
    textReply = textReply.replace(/[*#_`~]/g, "").trim();

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
