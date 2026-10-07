/**
 * OpenRouter AI Client for NVIDIA Nemotron 3 Nano Omni 30B reasoning model.
 * Model: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
 * Used exclusively for real-time voice and financial copilot responses.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

function getApiKey(): string {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getApiKey());
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function generateViaOpenRouter(
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    enableReasoning?: boolean;
  } = {}
): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = options.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Finance-V2 Voice Agent",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 350,
        reasoning: {
          enabled: options.enableReasoning ?? true,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[openrouter] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    console.log("[openrouter] response data:", JSON.stringify(data).slice(0, 300));
    const rawContent = data.choices?.[0]?.message?.content;

    if (typeof rawContent !== "string") {
      console.warn("[openrouter] rawContent is not string:", data.choices?.[0]);
      return null;
    }

    // Clean any residual reasoning tags (<think>...</think>)
    let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return cleaned || null;
  } catch (err: any) {
    clearTimeout(timer);
    console.warn(`[openrouter] inference failed: ${err?.message || err}`);
    return null;
  }
}
