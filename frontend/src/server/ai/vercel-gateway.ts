/**
 * Server-side client for Vercel AI Gateway.
 * Connects directly to https://ai-gateway.vercel.sh/v1 using AI_GATEWAY_API_KEY (vck_...).
 * Supports streaming and fast real-time voice inference.
 */

const VERCEL_AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const VERCEL_RESPONSES_URL = "https://ai-gateway.vercel.sh/v1/responses";

function getApiKey(): string {
  return (process.env.AI_GATEWAY_API_KEY || "").trim();
}

export function isVercelGatewayConfigured(): boolean {
  return getApiKey().startsWith("vck_");
}

export async function generateViaVercelGateway(
  prompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {}
): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = options.model || process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash";
  const timeoutMs = options.timeoutMs || 10000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(VERCEL_AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[vercel-ai-gateway] HTTP ${res.status}: ${errText.slice(0, 160)}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  } catch (err: any) {
    clearTimeout(timer);
    console.warn(`[vercel-ai-gateway] request failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * Generate speech audio using Fish Audio models via Vercel AI Gateway.
 * Supported models from dashboard:
 * - fish-audio/s2.1-pro
 * - fish-audio/s2-pro
 * - fish-audio/s1
 */
export async function generateFishAudioSpeech(
  text: string,
  options: {
    model?: "fish-audio/s2.1-pro" | "fish-audio/s2-pro" | "fish-audio/s1" | "s2.1-pro-free" | string;
    timeoutMs?: number;
  } = {}
): Promise<ArrayBuffer | null> {
  const directApiKey = (process.env.FISH_AUDIO_API_KEY || "").trim();
  const vercelApiKey = getApiKey();

  const timeoutMs = options.timeoutMs || 12000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 1. Direct Fish Audio API (Free model: s2.1-pro-free)
  if (directApiKey) {
    try {
      const res = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${directApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          format: "mp3",
          model: options.model?.replace("fish-audio/", "") || "s2.1-pro-free",
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        clearTimeout(timer);
        return await res.arrayBuffer();
      }
    } catch (err: any) {
      console.warn(`[fish-audio-direct] speech generation failed: ${err?.message || err}`);
    }
  }

  // 2. Vercel AI Gateway (fish-audio/s2.1-pro)
  if (vercelApiKey) {
    try {
      const res = await fetch(VERCEL_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model || "fish-audio/s2.1-pro",
          input: text,
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        clearTimeout(timer);
        return await res.arrayBuffer();
      } else {
        const errText = await res.text();
        console.warn(`[vercel-fish-audio] HTTP ${res.status}: ${errText.slice(0, 160)}`);
      }
    } catch (err: any) {
      console.warn(`[vercel-fish-audio] speech generation failed: ${err?.message || err}`);
    }
  }

  clearTimeout(timer);
  return null;
}
