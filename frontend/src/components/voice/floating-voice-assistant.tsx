"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Mic, X } from "lucide-react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export function FloatingVoiceAssistant() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [errorText, setErrorText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const lastTranscriptRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const isMutedRef = useRef(false);

  // Initialize SpeechRecognition & cache voices on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-IN";

        recognition.onresult = (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript;
          if (transcript) {
            lastTranscriptRef.current = transcript;
          }
        };

        speechRecognitionRef.current = recognition;
      }

      // Pre-warm browser speech synthesis voices if fallback is needed
      if ("speechSynthesis" in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }, []);

  const gatherPageContext = () => {
    if (typeof window === "undefined") return {};
    const path = window.location.pathname;
    const title = document.title;

    let symbol = "";
    let companyName = "";
    let price = "";
    let change = "";
    let pe = "";
    let smartScore = "";

    // Check if on a stock page
    if (path.includes("/stocks/")) {
      const parts = path.split("/stocks/")[1]?.split("/") || [];
      symbol = (parts[0] || "").toUpperCase();

      const h1 = document.querySelector("h1");
      if (h1) companyName = h1.textContent?.trim() || "";

      // Extract price from visible DOM
      const priceCandidates = Array.from(
        document.querySelectorAll("[data-price], [class*='text-2xl'], [class*='text-3xl']")
      );
      for (const el of priceCandidates) {
        const txt = el.textContent?.trim() || "";
        if (txt.includes("₹") || /^[0-9,]+(\.[0-9]{1,2})?$/.test(txt)) {
          price = txt.replace("₹", "").trim();
          break;
        }
      }

      // Extract PE or score
      const bodyText = document.body.innerText || "";
      const peMatch = bodyText.match(/P\/E\s*[:\s]*([0-9.]+)/i);
      if (peMatch) pe = peMatch[1];
      const scoreMatch = bodyText.match(/(?:Smart|Forensic)\s*Score\s*[:\s]*([0-9.]+)/i);
      if (scoreMatch) smartScore = scoreMatch[1];
    }

    // Scrape visible headings and content preview
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 4)
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join(" | ");

    const mainEl = document.querySelector("main") || document.body;
    const visibleExcerpt = (mainEl?.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);

    return {
      route: path,
      title,
      symbol,
      companyName,
      price,
      change,
      pe,
      smartScore,
      headings,
      visibleExcerpt,
    };
  };

  // Find best natural Indian Female voice for browser fallback
  const getIndianFemaleVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    return (
      // Natural / Neural Indian voices (Edge / Chrome)
      voices.find((v) => (v.name.includes("Neerja") || v.name.includes("Swara")) && v.lang.includes("IN")) ||
      voices.find((v) => v.name.includes("Natural") && (v.lang.includes("en-IN") || v.lang.includes("hi-IN"))) ||
      voices.find((v) => v.lang === "hi-IN" || v.lang === "hi_IN") ||
      voices.find((v) => v.lang === "en-IN" || v.lang === "en_IN") ||
      voices.find((v) => v.lang.includes("IN") || v.lang.includes("hi")) ||
      null
    );
  };

  const playAudio = useCallback((base64Data: string, mimeType = "audio/mpeg", fallbackText?: string) => {
    if (isMutedRef.current) return;

    if (base64Data) {
      try {
        const audioUrl = `data:${mimeType};base64,${base64Data}`;
        if (!audioPlayerRef.current) {
          audioPlayerRef.current = new Audio();
        }
        const audio = audioPlayerRef.current;
        audio.src = audioUrl;
        audio.currentTime = 0;
        setVoiceState("speaking");

        audio.onended = () => {
          if (isMutedRef.current) return;
          setVoiceState("listening");
          startRecording();
        };

        audio.onerror = () => {
          if (isMutedRef.current) return;
          fallbackSpeechSynthesis(fallbackText);
        };

        audio.play().catch(() => {
          if (isMutedRef.current) return;
          fallbackSpeechSynthesis(fallbackText);
        });
        return;
      } catch {
        // fallback
      }
    }

    if (fallbackText) {
      fallbackSpeechSynthesis(fallbackText);
    } else {
      if (isMutedRef.current) return;
      setVoiceState("listening");
      startRecording();
    }
  }, []);

  const fallbackSpeechSynthesis = (text?: string) => {
    if (isMutedRef.current || !text || typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (!isMutedRef.current) {
        setVoiceState("listening");
        startRecording();
      }
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    const indVoice = getIndianFemaleVoice();
    if (indVoice) {
      utterance.voice = indVoice;
    }

    setVoiceState("speaking");

    utterance.onend = () => {
      if (isMutedRef.current) return;
      setVoiceState("listening");
      startRecording();
    };

    utterance.onerror = () => {
      if (isMutedRef.current) return;
      setVoiceState("listening");
      startRecording();
    };

    window.speechSynthesis.speak(utterance);
  };

  const sendAudioToBackend = async (audioBlob: Blob, transcribedText?: string) => {
    if (isMutedRef.current) return;
    setVoiceState("thinking");

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);

    reader.onloadend = async () => {
      if (isMutedRef.current) return;

      try {
        const base64Data = (reader.result as string)?.split(",")[1];
        const textQuery = transcribedText || lastTranscriptRef.current || "";

        abortControllerRef.current = new AbortController();

        const res = await fetch("/api/v1/voice/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            audioData: base64Data,
            mimeType: audioBlob.type || "audio/webm",
            message: textQuery,
            history: historyRef.current,
            pageContext: gatherPageContext(),
          }),
        });

        if (isMutedRef.current) return;

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (isMutedRef.current) return;

        if (textQuery) {
          historyRef.current.push({ role: "user", text: textQuery });
        }
        if (data.textReply) {
          historyRef.current.push({ role: "assistant", text: data.textReply });
        }

        playAudio(data.audioBase64, data.audioMimeType || "audio/mpeg", data.textReply);
      } catch (err: any) {
        if (err.name === "AbortError" || isMutedRef.current) {
          return;
        }
        console.error("[voice] process error:", err);
        setErrorText("Voice connection error");
        setVoiceState("error");
      }
    };
  };

  const startRecording = useCallback(async () => {
    if (isMutedRef.current) return;

    try {
      lastTranscriptRef.current = "";
      try {
        speechRecognitionRef.current?.start();
      } catch {
        // already started
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (isMutedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        try {
          speechRecognitionRef.current?.stop();
        } catch {}

        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        if (isMutedRef.current) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 1000) {
          sendAudioToBackend(audioBlob, lastTranscriptRef.current);
        } else {
          setVoiceState("listening");
          startRecording();
        }
      };

      recorder.start();
      setVoiceState("listening");

      // Auto finalize 4s recording window
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
      }
      recordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 4000);
    } catch {
      setErrorText("Mic blocked — tap to retry");
      setVoiceState("error");
    }
  }, []);

  const handleStartCall = async () => {
    setErrorText("");
    isMutedRef.current = false;
    historyRef.current = [];
    lastTranscriptRef.current = "";
    setVoiceState("listening");
    startRecording();
  };

  // Instant full stop on Cross button click
  const handleEndCall = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    // 1. Immediately mute all flags
    isMutedRef.current = true;

    // 2. Abort any active backend network fetch immediately
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }

    // 3. Clear recording timers
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // 4. Abort speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort?.();
        speechRecognitionRef.current.stop?.();
      } catch {}
    }

    // 5. Stop microphone recording and turn off hardware mic track
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    // 6. Instantly silence HTML5 audio player
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.src = "";
      } catch {}
    }

    // 7. Instantly cancel all browser speech synthesis utterances
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // 8. Snap state immediately back to idle
    setVoiceState("idle");
  };

  const active = voiceState === "listening" || voiceState === "thinking" || voiceState === "speaking";

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <AnimatePresence mode="popLayout" initial={false}>
        {!active ? (
          /* ── Collapsed: Modern Floating Button ── */
          <motion.button
            key="btn"
            layout
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={handleStartCall}
            aria-label="Talk to Voice Assistant"
            className="flex items-center gap-2.5 rounded-full bg-[#C57708] hover:bg-[#A85F00] text-white pl-4 pr-5 py-3.5 shadow-2xl shadow-[#C57708]/30 transition-all border border-amber-400/20"
          >
            <span className="relative flex">
              <MessageCircle className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#25AB21] animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#25AB21]" />
            </span>
            <span className="text-sm font-semibold tracking-wide">
              {voiceState === "error" ? errorText || "Mic error — retry" : "Need help?"}
            </span>
          </motion.button>
        ) : (
          /* ── Active: Sleek Voice Pill with Equalizer and Large Stop Button ── */
          <motion.div
            key="pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex items-center gap-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-[#C57708]/40 shadow-2xl shadow-black/20 pl-4 pr-3 py-2.5 backdrop-blur-xl"
          >
            {voiceState === "thinking" ? (
              <>
                <span className="w-4 h-4 border-2 border-[#C57708]/30 border-t-[#C57708] rounded-full animate-spin" />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 pr-1">
                  Priya thinking…
                </span>
              </>
            ) : voiceState === "speaking" ? (
              <>
                {/* Speaking Animated Orb */}
                <span className="relative flex items-center justify-center">
                  <motion.span
                    className="absolute w-8 h-8 rounded-full bg-[#C57708]/20"
                    animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                  />
                  <span className="relative w-7 h-7 rounded-full bg-[#C57708]/15 flex items-center justify-center">
                    <Mic className="w-3.5 h-3.5 text-[#C57708]" />
                  </span>
                </span>
                {/* Speaking Equalizer */}
                <div className="flex items-end gap-[3px] h-5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[3px] rounded-full bg-[#C57708]"
                      animate={{ height: ["6px", "20px", "8px", "18px", "6px"] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Priya speaking…
                </span>
              </>
            ) : (
              <>
                {/* Listening Pulsing Mic */}
                <span className="relative flex items-center justify-center">
                  <motion.span
                    className="absolute w-8 h-8 rounded-full bg-[#25AB21]/20"
                    animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                  <span className="relative w-7 h-7 rounded-full bg-[#25AB21]/15 flex items-center justify-center">
                    <Mic className="w-3.5 h-3.5 text-[#25AB21]" />
                  </span>
                </span>
                {/* Listening Equalizer */}
                <div className="flex items-end gap-[3px] h-4">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[2.5px] rounded-full bg-[#25AB21]"
                      animate={{ height: ["4px", "14px", "6px", "12px", "4px"] }}
                      transition={{
                        duration: 1.1,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.15,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Listening…
                </span>
              </>
            )}

            {/* Instant Cut-off Stop / Cross Button */}
            <button
              type="button"
              onClick={handleEndCall}
              aria-label="Stop and end call"
              title="Stop voice assistant"
              className="ml-2 w-8 h-8 rounded-full bg-red-500/15 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
