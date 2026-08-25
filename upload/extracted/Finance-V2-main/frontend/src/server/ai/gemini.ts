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

/**
 * Race a promise against a hard timeout. Resolves null on timeout.
 * `fn` receives an AbortSignal that fires when the timeout wins the race, so
 * callers that forward it to the Gemini SDK's `requestOptions.signal` get
 * their in-flight HTTP request cancelled immediately instead of it continuing
 * to run in the background after this has already resolved to null.
 */
async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    return await Promise.race([
      (async () => {
      try {
        return await fn(controller.signal);
      } catch (err) {
        console.warn(`[gemini] generation failed: ${String(err)}`);
        return null;
      }
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  return withTimeout(async (signal) => {
    const client = new GoogleGenerativeAI(apiKey());
    const candidates = workingModel ? [workingModel, ...modelCandidates().filter((m) => m !== workingModel)] : modelCandidates();
    let lastErr: unknown = null;
    for (const id of candidates) {
      if (signal.aborted) break;
      try {
        const model = client.getGenerativeModel({ model: id });
        let result;
        try {
          result = await model.generateContent(prompt, { signal });
        } catch (firstError) {
          if (!/429|quota|rate.?limit/i.test(String(firstError))) throw firstError;
          await new Promise((resolve) => setTimeout(resolve, 500));
          result = await model.generateContent(prompt, { signal });
        }
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
 * Pull the JSON value out of a model response.
 *
 * The prompt asks for JSON and nothing else, and the fence stripper handles the
 * well-behaved answer. Models routinely disregard both — "Here is the
 * analysis:" ahead of a fenced block, or "Hope this helps!" after it — and
 * anchored fence-stripping leaves that prose in place, so `JSON.parse` throws
 * and a perfectly good response is discarded. Every AI feature here has a
 * rule-based fallback, so the visible symptom was not an error but the AI
 * quietly not working.
 *
 * Slicing between the outermost braces is what survives that. Scanning for a
 * balanced close (rather than the last brace in the string) means trailing
 * prose containing a brace can't extend the slice past the value.
 */
export function extractJson(text: string): string | null {
  const cleaned = stripJsonFences(text);
  if (!cleaned) return null;

  const start = cleaned.search(/[{[]/);
  if (start === -1) return null;

  const opener = cleaned[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    // Braces inside a string literal are data, not structure.
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }

  return null;
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
  const candidate = extractJson(raw);
  if (!candidate) {
    console.warn("[gemini] no JSON value found in response");
    return null;
  }
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    console.warn(`[gemini] JSON parse failed: ${String(err)}`);
    return null;
  }
}
