/**
 * ElevenLabs & Sarvam AI Speech Synthesis integration.
 * Produces lifelike, high-clarity spoken audio with natural conversational Indian accent.
 */

export interface SynthesizeOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Converts text into natural, lifelike conversational speech.
 * Primary: Sarvam AI Indian Text-to-Speech (native en-IN, speaker 'priya').
 * Fallback: ElevenLabs ('eleven_multilingual_v2', Lily / custom voice).
 */
export async function synthesizeSpeech(
  text: string,
  options?: SynthesizeOptions
): Promise<{ audioBase64: string; mimeType: string }> {
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

  const sarvamKey = (process.env.SARVAM_API_KEY || "").trim();
  const elevenlabsKey = (process.env.ELEVENLABS_API_KEY || "").trim();

  // 1. Try Sarvam AI Indian Text-to-Speech if configured
  if (sarvamKey) {
    try {
      const speaker = process.env.SARVAM_SPEAKER || "priya";
      const model = process.env.SARVAM_MODEL || "bulbul:v3";

      // Enforce Sarvam AI's strict 500-character limit per input item
      let sarvamInput = cleanedText;
      if (sarvamInput.length > 480) {
        const truncated = sarvamInput.slice(0, 480);
        const lastPunct = Math.max(
          truncated.lastIndexOf("."),
          truncated.lastIndexOf("!"),
          truncated.lastIndexOf("?")
        );
        sarvamInput = lastPunct > 120
          ? truncated.slice(0, lastPunct + 1)
          : truncated.replace(/\s+\S*$/, "") + ".";
      }

      const res = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "api-subscription-key": sarvamKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [sarvamInput],
          target_language_code: "en-IN",
          speaker,
          model,
          pace: 1.05,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.ok) {
        const data = await res.json();
        const audioBase64 = data.audios?.[0];
        if (audioBase64) {
          return {
            audioBase64,
            mimeType: "audio/wav",
          };
        }
      } else {
        const errText = await res.text();
        console.warn(`[sarvam-tts] API error (${res.status}): ${errText.slice(0, 150)}`);
      }
    } catch (err: any) {
      console.warn("[sarvam-tts] request failed:", err?.message);
    }
  }

  // 2. Try ElevenLabs if configured
  if (elevenlabsKey) {
    // Voice ID precedence: option > env > Lily (verified working multilingual voice)
    const voiceId =
      options?.voiceId ||
      process.env.ELEVENLABS_VOICE_ID ||
      "pFZP5JQG7iQjIQuC4Bku";

    const modelId = options?.modelId || "eleven_multilingual_v2";

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
          "xi-api-key": elevenlabsKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4500),
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return {
          audioBase64: Buffer.from(arrayBuf).toString("base64"),
          mimeType: "audio/mpeg",
        };
      } else {
        const errText = await res.text();
        console.warn(`[elevenlabs] API error (${res.status}): ${errText.slice(0, 150)}`);
      }
    } catch (err: any) {
      console.warn("[elevenlabs] request failed:", err?.message);
    }
  }

  throw new Error("Neither SARVAM_API_KEY nor ELEVENLABS_API_KEY is configured or reachable for speech synthesis");
}
