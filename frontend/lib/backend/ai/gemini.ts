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
// Tried in order. The env-configured model is preferred; the rest are robust
// fallbacks so the layer keeps working even if the configured id is wrong/retired.
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

/** The configured API key, or empty string if unset. */
function apiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim();
}

/** Ordered, de-duped list of model ids to try (configured first). */
function modelCandidates(): string[] {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  return Array.from(new Set([configured, ...FALLBACK_MODELS].filter(Boolean)));
}

/** The first model id confirmed working this process, to skip dead candidates. */
let workingModel: string | null = null;

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
    const candidates = workingModel ? [workingModel, ...modelCandidates().filter((m) => m !== workingModel)] : modelCandidates();
    let lastErr: unknown = null;
    for (const id of candidates) {
      try {
        const model = client.getGenerativeModel({ model: id });
        const result = await model.generateContent(prompt);
        const text = (result.response.text() || "").trim();
        if (text.length > 0) {
          workingModel = id; // cache the first model that works for this process
          return text;
        }
      } catch (err) {
        lastErr = err;
        // Try the next candidate (model-not-found / invalid-model errors fail fast).
      }
    }
    if (lastErr) console.warn(`[gemini] all models failed: ${String(lastErr)}`);
    return null;
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
