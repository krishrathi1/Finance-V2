const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function audioFileDetails(mimeType: string) {
  const contentType = mimeType.split(";")[0].trim().toLowerCase() || "audio/webm";
  const extensionByType: Record<string, string> = {
    "audio/flac": "flac",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mpga": "mpga",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-flac": "flac",
    "audio/x-wav": "wav",
  };
  return { contentType, extension: extensionByType[contentType] || "webm" };
}

/** Transcribe browser-recorded audio with Groq Whisper. Never logs credentials. */
export async function transcribeWithGroq(audioData: string, mimeType = "audio/webm"): Promise<string> {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const encodedAudio = audioData.replace(/^data:[^,]*,/, "").trim();
  const audioBuffer = Buffer.from(encodedAudio, "base64");
  if (audioBuffer.length === 0) throw new Error("Audio payload is empty");
  if (audioBuffer.length > MAX_AUDIO_BYTES) throw new Error("Audio payload exceeds the 25 MB limit");

  const { contentType, extension } = audioFileDetails(mimeType);
  const file = new Blob([new Uint8Array(audioBuffer)], { type: contentType });
  const form = new FormData();
  form.append("file", file, `voice.${extension}`);
  form.append("model", process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3-turbo");
  form.append("response_format", "json");
  form.append("temperature", "0");

  const response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`Groq transcription failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  const result = await response.json() as { text?: unknown };
  return typeof result.text === "string" ? result.text.trim() : "";
}
