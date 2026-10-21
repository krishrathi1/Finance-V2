"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Mic, Square, X, AlertCircle } from "lucide-react";
import { extractClientScreenSnapshot } from "@/lib/voice/context-extractor";
import { ChatTurn, ScreenSnapshot, VoiceState, VoiceTalkResponse } from "@/lib/voice/types";

export function FloatingVoiceAssistant() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [liveTranscript, setLiveTranscript] = useState<string>("");

  const sessionIdRef = useRef<string>("");
  const historyRef = useRef<ChatTurn[]>([]);
  const isMutedRef = useRef<boolean>(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const finalTranscriptRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const maxRecordingTimerRef = useRef<any>(null);
  const isSpeakingSpeechSynthRef = useRef<boolean>(false);

  // Initialize SpeechRecognition & cache voices on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-IN";

        recognition.onresult = (event: any) => {
          let interim = "";
          let final = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript + " ";
            } else {
              interim += transcript;
            }
          }

          if (final) {
            finalTranscriptRef.current = (finalTranscriptRef.current + " " + final).trim();
          }

          const currentText = (finalTranscriptRef.current + " " + interim).trim();
          setLiveTranscript(currentText);

          // Reset silence timer on each new speech chunk
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // If user stopped speaking for 1.4s after saying at least 2 words, auto-commit utterance
          if (currentText.split(/\s+/).length >= 2) {
            silenceTimerRef.current = setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop();
              }
            }, 1400);
          }
        };

        recognition.onerror = (e: any) => {
          if (e.error !== "no-speech") {
            console.warn("[voice] speech recognition error:", e.error);
          }
        };

        speechRecognitionRef.current = recognition;
      }

      if ("speechSynthesis" in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }

    return () => {
      cleanupAllAudio();
    };
  }, []);

  // Helper to pick natural Indian Female voice for local speech fallback
  const getIndianFemaleVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    return (
      voices.find((v) => (v.name.includes("Neerja") || v.name.includes("Swara")) && v.lang.includes("IN")) ||
      voices.find((v) => v.name.includes("Natural") && (v.lang.includes("en-IN") || v.lang.includes("hi-IN"))) ||
      voices.find((v) => v.lang === "hi-IN" || v.lang === "hi_IN") ||
      voices.find((v) => v.lang === "en-IN" || v.lang === "en_IN") ||
      voices.find((v) => v.lang.includes("IN") || v.lang.includes("hi")) ||
      null
    );
  };

  const cleanupAllAudio = useCallback(() => {
    isMutedRef.current = true;

    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
        speechRecognitionRef.current.stop();
      } catch {}
    }

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

    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.src = "";
      } catch {}
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isSpeakingSpeechSynthRef.current = false;
  }, []);

  const fallbackSpeechSynthesis = (text?: string) => {
    if (isMutedRef.current || !text || typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (!isMutedRef.current) {
        startListening();
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
    isSpeakingSpeechSynthRef.current = true;

    utterance.onend = () => {
      isSpeakingSpeechSynthRef.current = false;
      if (isMutedRef.current) return;
      startListening();
    };

    utterance.onerror = () => {
      isSpeakingSpeechSynthRef.current = false;
      if (isMutedRef.current) return;
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const playAudio = useCallback((base64Data: string | null, mimeType = "audio/mpeg", fallbackText?: string) => {
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
          startListening();
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
        // fallback to speech synthesis
      }
    }

    if (fallbackText) {
      fallbackSpeechSynthesis(fallbackText);
    } else {
      if (isMutedRef.current) return;
      startListening();
    }
  }, []);

  const sendUtteranceToBackend = async (audioBlob: Blob | null, textQuery: string) => {
    if (isMutedRef.current) return;
    setVoiceState("thinking");
    setStatusMessage("Analyzing screen & query…");

    try {
      abortControllerRef.current = new AbortController();

      // Convert audioBlob to base64 if available
      let base64Audio: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (audioBlob && audioBlob.size > 800) {
        mimeType = audioBlob.type || "audio/webm";
        const buffer = await audioBlob.arrayBuffer();
        base64Audio = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
      }

      // Extract fresh live screen snapshot
      const screenSnapshot: ScreenSnapshot = extractClientScreenSnapshot(sessionIdRef.current);

      const res = await fetch("/api/v1/voice/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: textQuery.trim(),
          audioData: base64Audio,
          mimeType,
          history: historyRef.current.slice(-6),
          screenSnapshot,
        }),
      });

      if (isMutedRef.current) return;

      const data: VoiceTalkResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server responded with ${res.status}`);
      }

      // Append verified turn to history
      const queryUsed = data.userQuery || textQuery.trim();
      if (queryUsed) {
        historyRef.current.push({ role: "user", text: queryUsed });
      }
      if (data.textReply) {
        historyRef.current.push({ role: "assistant", text: data.textReply });
      }

      setLiveTranscript(data.textReply);
      playAudio(data.audioBase64, data.audioMimeType || "audio/mpeg", data.textReply);
    } catch (err: any) {
      if (err.name === "AbortError" || isMutedRef.current) {
        return;
      }
      console.error("[voice] process error:", err);
      setStatusMessage(err?.message || "Failed to process voice request");
      setVoiceState("error");
    }
  };

  const startListening = useCallback(async () => {
    if (isMutedRef.current) return;

    setVoiceState("requesting_permission");
    setStatusMessage("Listening…");
    setLiveTranscript("");
    finalTranscriptRef.current = "";

    try {
      // 1. Acquire microphone stream
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

      // 2. Start SpeechRecognition
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch {
          // might be active
        }
      }

      // 3. Start MediaRecorder
      audioChunksRef.current = [];
      const supportedMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Clean up speech recognition & tracks
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
        }

        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;

        if (isMutedRef.current) return;

        const spokenText = finalTranscriptRef.current.trim();
        const audioBlob =
          audioChunksRef.current.length > 0
            ? new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
            : null;

        // Validation: verify that the user actually spoke something
        if (!spokenText && (!audioBlob || audioBlob.size < 1200)) {
          // Nothing audible was said; stay ready and prompt user
          setStatusMessage("Didn't catch that. Tap mic and speak.");
          setVoiceState("listening");
          // Re-listen automatically without sending empty requests
          startListening();
          return;
        }

        setVoiceState("processing");
        sendUtteranceToBackend(audioBlob, spokenText);
      };

      recorder.start(250); // Emit chunks every 250ms
      setVoiceState("listening");

      // Safety guard: max 12 seconds per utterance to prevent runaway recording
      if (maxRecordingTimerRef.current) {
        clearTimeout(maxRecordingTimerRef.current);
      }
      maxRecordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 12000);
    } catch {
      setStatusMessage("Microphone permission denied");
      setVoiceState("error");
    }
  }, []);

  const handleStartCall = async () => {
    cleanupAllAudio();
    isMutedRef.current = false;
    historyRef.current = [];
    sessionIdRef.current = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    startListening();
  };

  const handleEndCall = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    cleanupAllAudio();
    setVoiceState("idle");
    setLiveTranscript("");
    setStatusMessage("");
  };

  const handleStopSpeakingAndSubmit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const active = voiceState !== "idle";

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
            aria-label="Talk to Financial Voice Assistant"
            className="flex items-center gap-2.5 rounded-full bg-[#C57708] hover:bg-[#A85F00] text-white pl-4 pr-5 py-3.5 shadow-2xl shadow-[#C57708]/30 transition-all border border-amber-400/20"
          >
            <span className="relative flex">
              <MessageCircle className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#25AB21] animate-ping" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#25AB21]" />
            </span>
            <span className="text-sm font-semibold tracking-wide">
              {statusMessage ? statusMessage : "Talk to Voice Agent"}
            </span>
          </motion.button>
        ) : (
          /* ── Active: Sleek Interactive Voice Pill with State Indication ── */
          <motion.div
            key="pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex flex-col gap-1.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-[#C57708]/40 shadow-2xl shadow-black/25 p-3 backdrop-blur-xl max-w-sm"
          >
            <div className="flex items-center gap-3">
              {voiceState === "requesting_permission" ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#C57708]/30 border-t-[#C57708] rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Connecting mic…
                  </span>
                </>
              ) : voiceState === "processing" || voiceState === "thinking" ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#C57708]/30 border-t-[#C57708] rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {statusMessage || "Priya thinking…"}
                  </span>
                </>
              ) : voiceState === "speaking" ? (
                <>
                  {/* Speaking Equalizer */}
                  <span className="relative flex items-center justify-center">
                    <motion.span
                      className="absolute w-7 h-7 rounded-full bg-[#C57708]/20"
                      animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="relative w-6 h-6 rounded-full bg-[#C57708]/15 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-[#C57708]" />
                    </span>
                  </span>
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
              ) : voiceState === "error" ? (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-500">
                    {statusMessage || "Error"}
                  </span>
                </>
              ) : (
                /* Listening State */
                <>
                  <span className="relative flex items-center justify-center">
                    <motion.span
                      className="absolute w-8 h-8 rounded-full bg-[#25AB21]/20"
                      animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="relative w-6 h-6 rounded-full bg-[#25AB21]/15 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-[#25AB21]" />
                    </span>
                  </span>
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
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Listening… (speak anytime)
                  </span>

                  {/* Tap-to-done shortcut button */}
                  <button
                    type="button"
                    onClick={handleStopSpeakingAndSubmit}
                    title="Done speaking"
                    className="ml-auto px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-all flex items-center gap-1"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                    Done
                  </button>
                </>
              )}

              {/* Instant Cut-off Stop / Cross Button */}
              <button
                type="button"
                onClick={handleEndCall}
                aria-label="Stop and end call"
                title="Stop voice assistant"
                className="ml-auto w-7 h-7 rounded-full bg-red-500/15 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Live Transcription / Subtitle Area */}
            {liveTranscript && (
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/60 p-2 rounded-lg max-h-20 overflow-y-auto italic">
                &ldquo;{liveTranscript}&rdquo;
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
