import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

export async function POST(req: NextRequest) {
  try {
    const { message, history, pageContext } = await req.json();

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

    // Instant Zero-Latency Conversational Filter for common greetings
    const trimmedLower = message.trim().toLowerCase().replace(/[?!.]/g, "");
    const greetings: Record<string, string> = {
      hello: "Hello! Main sun raha hoon. Aap market ya kisi stock ke baare me kya janna chahte hain?",
      hi: "Hey! Main sun raha hoon. Aap kis stock ya company ke baare me puchna chahte hain?",
      hey: "Hello! Aap bataiye, aaj market ya aapke portfolio me kya check karna hai?",
      namaste: "Namaste! Main aapka financial AI copilot hoon. Kaise madad kar sakta hoon?",
      "kya haal hai": "Sab badiya! Market live updates ke sath taiyaar hoon. Aap bataiye?",
      "hello sir": "Hello! Main sun raha hoon. Kis stock ka price ya analysis dekhna hai?",
    };

    if (greetings[trimmedLower]) {
      const instantReply = greetings[trimmedLower];
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: instantReply })}\n\n`));
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

    // Context & System Instruction
    let systemInstruction = `You are a real-time financial voice copilot for Indian markets (NSE/BSE).
Speak naturally and quickly like a phone conversation.
Keep replies strictly to 1-2 short sentences and under 30-40 words.
Give the main number or verdict immediately.
Do not use markdown (*, #, bullet points).
If the user speaks in Hindi or Hinglish, reply naturally in conversational Hinglish. If English, reply in crisp English.`;

    if (pageContext) {
      systemInstruction += `\nScreen Context: ${pageContext.title || ""} (${pageContext.route || "/"})`;
    }

    // Format conversation history
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-4)) {
        if (turn.role && turn.text) {
          contents.push({
            role: turn.role === "assistant" || turn.role === "model" ? "model" : "user",
            parts: [{ text: turn.text }],
          });
        }
      }
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    // Call Gemini Stream with gemini-3.1-flash-lite (fastest sub-300ms model)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 80,
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
                // Ignore parse errors on SSE boundary
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
