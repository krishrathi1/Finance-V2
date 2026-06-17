/**
 * Thin server-side client over the installed `@google/generative-ai` SDK.
 *
 * Reads GEMINI_API_KEY and GEMINI_MODEL from the environment. Provides text and
 * JSON helpers with a hard timeout. Following the GOLDEN RULE for this backend,
 * none of these functions ever throw — they return `null` on any failure,
 * timeout, missing key, or parse error.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MODEL = "gemini-2.0-flash";

/** The configured API key, or empty string if unset. */
function apiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim();
}

/** The configured model name, defaulting to gemini-2.0-flash when unset/empty. */
function modelName(): string {
  const m = (process.env.GEMINI_MODEL || "").trim();
  return m || DEFAULT_MODEL;
}

/** Whether a Gemini API key is present in the environment. */
export function isGeminiConfigured(): boolean {
  return apiKey().length > 0;
}

/** Race a promise against a hard timeout. Resolves null on timeout. */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    (async () => {
      try {
        return await fn();
      } catch (err) {
        console.warn(`[gemini] generation failed: ${String(err)}`);
        return null;
      }
    })(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * Generate plain text from a prompt. Returns the trimmed model output, or null
 * on missing key / timeout / any failure. Never throws.
 */
export async function generateText(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  if (!isGeminiConfigured()) return null;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return withTimeout(async () => {
    const client = new GoogleGenerativeAI(apiKey());
    const model = client.getGenerativeModel({ model: modelName() });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const trimmed = (text || "").trim();
    return trimmed.length > 0 ? trimmed : null;
  }, timeoutMs);
}

/** Strip markdown ```json / ``` code fences from a model response. */
function stripJsonFences(text: string): string {
  let t = text.trim();
  // Remove a leading fence like ```json or ``` (optionally with a language tag).
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, "");
  // Remove a trailing fence ```.
  t = t.replace(/\n?```\s*$/, "");
  return t.trim();
}

/**
 * Generate JSON from a prompt. Appends a JSON-only instruction, strips markdown
 * code fences, and JSON.parses the result. Returns null on any failure. Never
 * throws.
 */
export async function generateJson<T>(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<T | null> {
  const jsonPrompt = `${prompt}\n\nReturn ONLY valid JSON. No markdown, no code fences, no commentary.`;
  const raw = await generateText(jsonPrompt, opts);
  if (!raw) return null;
  try {
    const cleaned = stripJsonFences(raw);
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn(`[gemini] JSON parse failed: ${String(err)}`);
    return null;
  }
}
