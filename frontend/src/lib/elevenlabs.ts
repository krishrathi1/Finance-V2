import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/**
 * ElevenLabs Client instance.
 * Automatically reads ELEVENLABS_API_KEY from process.env.
 */
export const elevenlabs = new ElevenLabsClient();

export interface SynthesizeOptions {
  voiceId?: string;
  modelId?: string;
}

/**
 * Converts text into natural, lifelike conversational speech using ElevenLabs.
 * Default voice: Indian Female accent ('2F1KINpxsttim2WfMbVs' or 'pFZP5JQG7iQjIQuC4Bku' / Lily).
 * Default model: 'eleven_multilingual_v2' for authentic Indian English/Hindi accent and emotional cadence.
 */
export async function synthesizeSpeech(
  text: string,
  options?: SynthesizeOptions
): Promise<{ audioBase64: string; mimeType: string }> {
  // Indian female voice with natural Desi / Hindi conversational accent
  // Can be overridden via ELEVENLABS_VOICE_ID env variable
  const voiceId =
    options?.voiceId ||
    process.env.ELEVENLABS_VOICE_ID ||
    "2F1KINpxsttim2WfMbVs"; // DB - Indian Hindi / Desi Voice (Female)

  // eleven_multilingual_v2 delivers the most authentic human accent for Indian English and Hindi
  const modelId = options?.modelId || "eleven_multilingual_v2";

  // Strip markdown formatting symbols so ElevenLabs speaks cleanly like a human
  const cleanedText = text
    .replace(/[*#_`~]/g, "")
    .replace(/\[.*?\]/g, "")
    .trim();

  if (!cleanedText) {
    throw new Error("Cannot synthesize empty text");
  }

  // Convert to natural speech
  let audioStream: any = null;
  try {
    audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: cleanedText,
      modelId,
      outputFormat: "mp3_44100_128",
      voiceSettings: {
        stability: 0.45,
        similarityBoost: 0.85,
        style: 0.2,
        useSpeakerBoost: true,
      },
    });
  } catch (err: any) {
    // If the primary voice is unavailable, try the popular multilingual fallback voice
    console.warn(`[elevenlabs] voice ${voiceId} failed, trying fallback:`, err?.message);
    const fallbackVoice = "pFZP5JQG7iQjIQuC4Bku"; // Lily / Florence
    audioStream = await elevenlabs.textToSpeech.convert(fallbackVoice, {
      text: cleanedText,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });
  }

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
