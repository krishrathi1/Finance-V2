import { NextRequest } from "next/server";
import { screenMemoryStore } from "@/lib/voice/screen-memory-store";

export const dynamic = "force-dynamic";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message, history, screenSnapshot } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message query is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Gemini API key is missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (screenSnapshot) {
      screenMemoryStore.saveSnapshot(screenSnapshot);
    }

    // Retrieve screen memory grounding
    const retrieved = sessionId
      ? screenMemoryStore.retrieveRelevant(sessionId, message, 3)
      : { groundingContext: "No active screen memory recorded." };

    let systemInstruction = `You are Priya, a real-time conversational financial voice co-pilot for Indian markets (NSE/BSE).
Guidelines:
1. Speak naturally like a sharp, friendly financial expert in a voice call.
2. Keep replies strictly to 1-2 short sentences (under 30-40 words).
3. Ground your answer in the verified screen context provided below:

=== SCREEN CONTEXT ===
${retrieved.groundingContext}
=== END OF CONTEXT ===`;

    // Format conversation history
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
    contents.push({ role: "user", parts: [{ text: message }] });

    // Stream with gemini-flash-lite-latest / gemini-3-flash-preview
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 120,
        },
      }),
    });

    if (!geminiRes.ok || !geminiRes.body) {
      const errText = await geminiRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Gemini error: ${errText.slice(0, 100)}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
              if (!jsonStr) continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (chunkText) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`)
                  );
                }
              } catch {
                // ignore SSE boundary parsing
              }
            }
          }
        } catch (err) {
          console.error("[gemini-stream] streaming error:", err);
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
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
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
