"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Mic, MicOff, X } from "lucide-react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export function FloatingVoiceAssistant() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [errorText, setErrorText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const isMutedRef = useRef(false);

  // Initialize SpeechRecognition if available (for instant text fallback/transcript)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-IN";
        speechRecognitionRef.current = recognition;
      }
    }
  }, []);

  const gatherPageContext = () => {
    if (typeof window === "undefined") return {};
    return {
      route: window.location.pathname,
      title: document.title,
    };
  };

  const playAudio = useCallback((base64Data: string, mimeType = "audio/wav", fallbackText?: string) => {
    if (base64Data) {
      try {
        const audioUrl = `data:${mimeType};base64,${base64Data}`;
        if (!audioPlayerRef.current) {
          audioPlayerRef.current = new Audio();
        }
        const audio = audioPlayerRef.current;
        audio.src = audioUrl;
        setVoiceState("speaking");

        audio.onended = () => {
          setVoiceState("listening");
          startRecording();
        };

        audio.onerror = () => {
          fallbackSpeechSynthesis(fallbackText);
        };

        audio.play().catch(() => {
          fallbackSpeechSynthesis(fallbackText);
        });
        return;
      } catch {
        // fallback to browser synth
      }
    }

    if (fallbackText) {
      fallbackSpeechSynthesis(fallbackText);
    } else {
      setVoiceState("listening");
      startRecording();
    }
  }, []);

  const fallbackSpeechSynthesis = (text?: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceState("listening");
      startRecording();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const indVoice = voices.find((v) => v.lang.includes("en-IN") || v.lang.includes("hi"));
    if (indVoice) utterance.voice = indVoice;

    setVoiceState("speaking");
    utterance.onend = () => {
      setVoiceState("listening");
      startRecording();
    };
    utterance.onerror = () => {
      setVoiceState("listening");
      startRecording();
    };

    window.speechSynthesis.speak(utterance);
  };

  const sendAudioToGemini = async (audioBlob: Blob, transcribedText?: string) => {
    setVoiceState("thinking");

    // Convert audio to Base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      try {
        const base64Data = (reader.result as string)?.split(",")[1];
        const res = await fetch("/api/v1/voice/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioData: base64Data,
            mimeType: audioBlob.type || "audio/webm",
            message: transcribedText || "",
            history: historyRef.current,
            pageContext: gatherPageContext(),
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (transcribedText) {
          historyRef.current.push({ role: "user", text: transcribedText });
        }
        if (data.textReply) {
          historyRef.current.push({ role: "assistant", text: data.textReply });
        }

        playAudio(data.audioBase64, data.audioMimeType, data.textReply);
      } catch (err: any) {
        console.error("[voice] process error:", err);
        setErrorText("Gemini connection error");
        setVoiceState("error");
      }
    };
  };

  const startRecording = useCallback(async () => {
    if (isMutedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 1000) {
          sendAudioToGemini(audioBlob);
        } else {
          setVoiceState("listening");
          startRecording();
        }
      };

      recorder.start();
      setVoiceState("listening");

      // Optional: automatically stop after 4.5 seconds of user utterance
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 4500);
    } catch {
      setErrorText("Mic blocked — tap to retry");
      setVoiceState("error");
    }
  }, []);

  const handleStartCall = async () => {
    setErrorText("");
    isMutedRef.current = false;
    historyRef.current = [];
    setVoiceState("listening");
    startRecording();
  };

  const handleEndCall = () => {
    isMutedRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
  };

  const active = voiceState === "listening" || voiceState === "thinking" || voiceState === "speaking";

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <AnimatePresence mode="popLayout" initial={false}>
        {!active ? (
          /* ── Collapsed: Modern Floating Button from Downloads/voice ── */
          <motion.button
            key="btn"
            layout
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={handleStartCall}
            aria-label="Talk to Gemini Assistant"
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
          /* ── Active: Morphs in place into sleek Voice Pill with Equalizer ── */
          <motion.div
            key="pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex items-center gap-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-[#C57708]/40 shadow-2xl shadow-black/20 pl-3.5 pr-2.5 py-2.5 backdrop-blur-xl"
          >
            {voiceState === "thinking" ? (
              <>
                <span className="w-4 h-4 border-2 border-[#C57708]/30 border-t-[#C57708] rounded-full animate-spin" />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 pr-1">
                  Gemini thinking…
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
                  Gemini speaking…
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

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              aria-label="End call"
              className="ml-1 w-7 h-7 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
