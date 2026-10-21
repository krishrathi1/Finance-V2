/**
 * ElevenLabs Speech Synthesis integration.
 * Produces lifelike, high-clarity spoken audio with natural conversational Indian accent.
 */

export interface SynthesizeOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Converts text into natural, lifelike conversational speech using ElevenLabs.
 * Default voice: 'pFZP5JQG7iQjIQuC4Bku' (Lily - verified natural multilingual voice).
 * Default model: 'eleven_multilingual_v2' for authentic Indian English/Hindi accent and emotional cadence.
 */
export async function synthesizeSpeech(
  text: string,
  options?: SynthesizeOptions
): Promise<{ audioBase64: string; mimeType: string }> {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  // Voice ID precedence: option > env > Lily (verified working multilingual voice)
  const voiceId =
    options?.voiceId ||
    process.env.ELEVENLABS_VOICE_ID ||
    "pFZP5JQG7iQjIQuC4Bku";

  const modelId = options?.modelId || "eleven_multilingual_v2";

  // Clean markdown and non-verbal tokens for crisp, natural human speech
  const cleanedText = text
    .replace(/[*#_`~]/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/₹/g, " rupees ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedText) {
    throw new Error("Cannot synthesize empty text");
  }

  const payload = {
    text: cleanedText,
    model_id: modelId,
    voice_settings: {
      stability: options?.stability ?? 0.5,
      similarity_boost: options?.similarityBoost ?? 0.8,
      style: 0.15,
      use_speaker_boost: true,
    },
  };

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      // If primary voice is unavailable, retry with verified default Lily
      if (voiceId !== "pFZP5JQG7iQjIQuC4Bku") {
        console.warn(`[elevenlabs] voice ${voiceId} returned ${res.status}, retrying with default voice`);
        const fallbackRes = await fetch("https://api.elevenlabs.io/v1/text-to-speech/pFZP5JQG7iQjIQuC4Bku", {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify(payload),
        });

        if (fallbackRes.ok) {
          const arrayBuf = await fallbackRes.arrayBuffer();
          return {
            audioBase64: Buffer.from(arrayBuf).toString("base64"),
            mimeType: "audio/mpeg",
          };
        }
      }
      throw new Error(`ElevenLabs API error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return {
      audioBase64: Buffer.from(arrayBuf).toString("base64"),
      mimeType: "audio/mpeg",
    };
  } catch (err: any) {
    console.error("[elevenlabs] synthesizeSpeech error:", err?.message);
    throw err;
  }
}
