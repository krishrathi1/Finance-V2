import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

let elevenlabs: ElevenLabsClient | null = null;

function getElevenLabsClient(): ElevenLabsClient {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  if (!elevenlabs) {
    elevenlabs = new ElevenLabsClient({ apiKey });
  }

  return elevenlabs;
}

export interface SynthesizeOptions {
  voiceId?: string;
  modelId?: string;
}

/**
 * Converts text into natural, lifelike conversational speech using ElevenLabs.
 * Default model: 'eleven_flash_v2_5' (~75ms low latency, multilingual).
 * Default voice: 'JBFqnCBsd6RMkjVDRZzb' (clear, friendly conversational voice).
 */
export async function synthesizeSpeech(
  text: string,
  options?: SynthesizeOptions
): Promise<{ audioBase64: string; mimeType: string }> {
  const voiceId =
    options?.voiceId ||
    process.env.ELEVENLABS_VOICE_ID ||
    "JBFqnCBsd6RMkjVDRZzb";

  const modelId = options?.modelId || "eleven_flash_v2_5";

  // Strip markdown formatting symbols so ElevenLabs speaks cleanly
  const cleanedText = text
    .replace(/[*#_`~]/g, "")
    .replace(/\[.*?\]/g, "")
    .trim();

  if (!cleanedText) {
    throw new Error("Cannot synthesize empty text");
  }

  const audioStream = await getElevenLabsClient().textToSpeech.convert(voiceId, {
    text: cleanedText,
    modelId,
    outputFormat: "mp3_44100_128",
  });

  const reader = audioStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(typeof value === "string" ? Buffer.from(value) : value);
    }
  }

  const audioBuffer = Buffer.concat(chunks);
  return {
    audioBase64: audioBuffer.toString("base64"),
    mimeType: "audio/mpeg",
  };
}
