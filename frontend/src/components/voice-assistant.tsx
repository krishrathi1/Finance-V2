"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Mic, MicOff, X, Volume2, AlertCircle, RotateCcw } from "lucide-react";
import {
  getVoicePageContext,
  buildVoicePageContext,
  subscribeToVoicePageContext,
  VoicePageContext,
} from "@/lib/voice/page-context";

export type VoiceState =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * PURE CONTEXT-AWARE VOICE AGENT (Finance-V2)
 *
 * - Real-time Voice-to-Voice Hands-Free Loop.
 * - Strict State Machine: idle -> requesting_permission -> listening -> thinking -> speaking -> listening.
 * - Proper Microphone Permission Handling: Blocks progression on failure, never says "Speaking" when mic denied.
 * - Retains and safely releases MediaStream hardware handle.
 * - Deep Structured Page Context Awareness (Price, Technicals, Scores, Shareholding, Route, Active Tabs).
 * - Multi-turn conversational memory (e.g. "What's the P/E?" -> "Is that high?").
 * - Dynamic route change detection (RELIANCE -> TCS automatically updates context).
 * - Zero clunky modals or text clutter.
 */
export function VoiceAssistant() {
  const pathname = usePathname();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const safetyTimerRef = useRef<any>(null);
  const isAbortedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Short-term conversational memory
  const conversationMemoryRef = useRef<ChatTurn[]>([]);
  const currentSymbolRef = useRef<string>("");
  const currentRouteRef = useRef<string>("");

  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef<boolean>(false);
  const speechEndTimestampRef = useRef<number>(0);
  const firstAudioLoggedRef = useRef<boolean>(false);

  // Stop any active speech synthesis and audio playback immediately
  const cancelSpeech = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    utteranceRef.current = null;
    if (typeof window !== "undefined") {
      (window as any).__voiceUtterance = null;
    }
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
  }, []);

  // Play next sentence in queue or return to listening
  const playNextSentence = useCallback(() => {
    if (isAbortedRef.current) return;

    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      console.log("[Voice] Audio playback completed, returning to listening");
      setVoiceState("listening");
      listen();
      return;
    }

    const sentence = audioQueueRef.current.shift()!;
    isPlayingQueueRef.current = true;
    setVoiceState("speaking");

    const cleanText = sentence
      .replace(/[*#_`~>]/g, "")
      .replace(/₹/g, "Rupees ")
      .replace(/Cr\b/g, "Crore")
      .replace(/\bPE\b/gi, "P E")
      .replace(/\bPB\b/gi, "P B")
      .replace(/\bROE\b/gi, "R O E")
      .replace(/\bROCE\b/gi, "R O C E")
      .replace(/\bFII\b/gi, "F I I")
      .replace(/\bDII\b/gi, "D I I")
      .replace(/\bRSI\b/gi, "R S I")
      .replace(/\bCMP\b/gi, "Current Price")
      .trim();

    if (!cleanText) {
      playNextSentence();
      return;
    }

    const ttsStart = Date.now();
    console.log("[Voice] tts_request_start:", ttsStart, "for chunk:", cleanText);

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      playNextSentence();
      return;
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.volume = 1.0;
    utterance.rate = 1.22;
    utterance.pitch = 1.02;

    try {
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) =>
            v.lang.includes("en-IN") ||
            v.lang.includes("hi-IN") ||
            v.name.toLowerCase().includes("india")
        ) ||
        voices.find((v) => v.lang.startsWith("en"));

      if (preferred) utterance.voice = preferred;
    } catch {}

    utteranceRef.current = utterance;
    (window as any).__voiceUtterance = utterance;

    utterance.onstart = () => {
      const audioStart = Date.now();
      console.log("[Voice] first_audio:", audioStart);
      if (!firstAudioLoggedRef.current && speechEndTimestampRef.current > 0) {
        firstAudioLoggedRef.current = true;
        console.log(`[Voice] Total time-to-first-audio latency: ${audioStart - speechEndTimestampRef.current}ms`);
      }
    };

    let done = false;
    const onSentenceComplete = () => {
      if (done) return;
      done = true;
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      playNextSentence();
    };

    utterance.onend = onSentenceComplete;
    utterance.onerror = onSentenceComplete;

    const maxMs = Math.min(6000, Math.max(1400, cleanText.length * 55) + 500);
    safetyTimerRef.current = setTimeout(onSentenceComplete, maxMs);

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      onSentenceComplete();
    }
  }, []);

  // Enqueue sentence into TTS audio pipeline
  const enqueueSentence = useCallback((sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    audioQueueRef.current.push(trimmed);
    if (!isPlayingQueueRef.current) {
      playNextSentence();
    }
  }, [playNextSentence]);

  // Track active symbol and previous symbol across navigations
  const previousSymbolRef = useRef<string>("");

  // Update page context and detect symbol change across navigations
  useEffect(() => {
    const freshContext = buildVoicePageContext();
    const newSymbol = freshContext.stock?.symbol || "";
    const newRoute = freshContext.route || pathname;

    if (currentSymbolRef.current && newSymbol && currentSymbolRef.current !== newSymbol) {
      console.log(`[voice] navigating from ${currentSymbolRef.current} to ${newSymbol}`);
      previousSymbolRef.current = currentSymbolRef.current;
      conversationMemoryRef.current = [
        {
          role: "assistant",
          content: `(Context note: User previously looked at ${previousSymbolRef.current} and is now viewing ${newSymbol}).`,
        },
      ];
    }

    currentSymbolRef.current = newSymbol;
    currentRouteRef.current = newRoute;
  }, [pathname]);

  // Subscribe to live page context updates
  useEffect(() => {
    const unsubscribe = subscribeToVoicePageContext((ctx) => {
      if (ctx.stock?.symbol) {
        currentSymbolRef.current = ctx.stock.symbol;
      }
    });
    return unsubscribe;
  }, []);

  // Query Streaming AI Backend with Progressive Turn Delivery
  const processVoiceInput = useCallback(
    async (userSpeech: string, speechEndTimeMs?: number) => {
      const speechEnd = speechEndTimeMs || Date.now();
      speechEndTimestampRef.current = speechEnd;
      firstAudioLoggedRef.current = false;

      const trimmed = userSpeech.trim();
      if (!trimmed || isAbortedRef.current) {
        return;
      }

      // Interrupt any running stream or playing audio (Barge-in / Interruption)
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
      }
      cancelSpeech();

      const abortController = new AbortController();
      streamAbortControllerRef.current = abortController;
      isProcessingRef.current = true;

      const aiRequestStart = Date.now();
      console.log("[Voice] speech_end:", speechEnd);
      console.log("[Voice] ai_request_start:", aiRequestStart);
      console.log("[Voice] Final transcript:", trimmed);
      setVoiceState("thinking");
      setLiveTranscript(trimmed);

      conversationMemoryRef.current.push({ role: "user", content: trimmed });
      if (conversationMemoryRef.current.length > 6) {
        conversationMemoryRef.current = conversationMemoryRef.current.slice(-6);
      }

      try {
        const pageContext: VoicePageContext = getVoicePageContext();

        const res = await fetch("/api/v1/ai/copilot/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            context: {
              mode: "voice",
              pageContext,
              symbol: pageContext.stock?.symbol || "",
              exchange: pageContext.stock?.exchange || "NSE",
            },
            history: conversationMemoryRef.current,
          }),
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream responded with status ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let sseBuffer = "";
        let sentenceBuffer = "";
        let accumulatedFullText = "";
        let firstTokenLogged = false;
        let firstSentenceLogged = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;
            const dataStr = trimmedLine.replace(/^data:\s*/, "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.text;
              if (textChunk && typeof textChunk === "string") {
                if (!firstTokenLogged) {
                  firstTokenLogged = true;
                  const firstTokenTime = Date.now();
                  console.log("[Voice] first_token:", firstTokenTime);
                  console.log(`[Voice] speech_end → first_token latency: ${firstTokenTime - speechEnd}ms`);
                }

                accumulatedFullText += textChunk;
                sentenceBuffer += textChunk;
                setLiveTranscript(accumulatedFullText.trim());

                // Sentence boundary detection (. ! ? \n)
                const sentenceMatch = sentenceBuffer.match(/^([\s\S]*?[.!?\n])\s*([\s\S]*)$/);
                if (sentenceMatch) {
                  const completedSentence = sentenceMatch[1].trim();
                  sentenceBuffer = sentenceMatch[2];

                  if (completedSentence.length > 2) {
                    if (!firstSentenceLogged) {
                      firstSentenceLogged = true;
                      const firstSentenceTime = Date.now();
                      console.log("[Voice] first_sentence:", firstSentenceTime, "->", completedSentence);
                      console.log(`[Voice] speech_end → first_sentence latency: ${firstSentenceTime - speechEnd}ms`);
                    }
                    enqueueSentence(completedSentence);
                  }
                }
              }
            } catch {
              // ignore json parse errors in sse chunk
            }
          }
        }

        // Flush any remaining text in sentenceBuffer
        if (sentenceBuffer.trim()) {
          enqueueSentence(sentenceBuffer.trim());
        }

        const aiComplete = Date.now();
        console.log("[Voice] ai_complete:", aiComplete, `(took ${aiComplete - aiRequestStart}ms)`);

        if (accumulatedFullText.trim()) {
          conversationMemoryRef.current.push({ role: "assistant", content: accumulatedFullText.trim() });
          if (conversationMemoryRef.current.length > 6) {
            conversationMemoryRef.current = conversationMemoryRef.current.slice(-6);
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          console.log("[Voice] Stream aborted by user interruption");
        } else {
          console.error("[Voice] Stream request failed:", err);
          enqueueSentence("Please ask again, I will check the live screen data.");
        }
      } finally {
        isProcessingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancelSpeech, enqueueSentence]
  );

  // Start persistent Web Speech recognition with barge-in support
  const listen = useCallback(() => {
    if (typeof window === "undefined" || isAbortedRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[Voice] Speech recognition not supported in this browser");
      setVoiceState("error");
      setErrorMessage("Speech recognition not supported in this browser");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      console.log("[Voice] Recognition started");
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let recognizedFinal = "";
      let recognizedInterim = "";
      let lastSpeechTimestamp = Date.now();
      let silenceTimer: any = null;

      recognition.onstart = () => {
        if (!isAbortedRef.current) {
          console.log("[Voice] Recognition listening...");
          setVoiceState("listening");
          setErrorMessage("");
        }
      };

      recognition.onresult = (event: any) => {
        if (isAbortedRef.current) return;

        // User Barge-In: if user speaks while assistant is speaking or thinking, interrupt immediately!
        if (isPlayingQueueRef.current || isProcessingRef.current) {
          console.log("[Voice] User barge-in detected! Stopping current speech/stream");
          if (streamAbortControllerRef.current) {
            streamAbortControllerRef.current.abort();
          }
          cancelSpeech();
          setVoiceState("listening");
        }

        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        lastSpeechTimestamp = Date.now();

        if (final) {
          recognizedFinal = final;
          console.log("[Voice] Final transcript:", final);
          setLiveTranscript(final);
        } else if (interim) {
          recognizedInterim = interim;
          console.log("[Voice] Interim transcript:", interim);
          setLiveTranscript(interim);
        }

        // Fast real-time turn detection (350-500ms after user pauses)
        if (silenceTimer) clearTimeout(silenceTimer);
        const candidate = (final || interim || recognizedFinal || recognizedInterim).trim();
        if (candidate) {
          silenceTimer = setTimeout(() => {
            if (!isAbortedRef.current && !isProcessingRef.current && candidate) {
              console.log("[Voice] End of user turn detected, processing immediately:", candidate);
              try {
                recognition.stop();
              } catch {}
            }
          }, 420);
        }
      };

      recognition.onerror = (e: any) => {
        if (silenceTimer) clearTimeout(silenceTimer);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          cancelSpeech();
          setVoiceState("error");
          setErrorMessage("Microphone permission blocked");
          if (mediaStreamRef.current) {
            try {
              mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            } catch {}
            mediaStreamRef.current = null;
          }
        }
      };

      recognition.onend = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        console.log("[Voice] Recognition turn completed. Utterance:", { recognizedFinal, recognizedInterim });
        if (isAbortedRef.current) return;

        const candidate = (recognizedFinal || recognizedInterim).trim();
        if (candidate && !isProcessingRef.current) {
          processVoiceInput(candidate, lastSpeechTimestamp);
        } else if (!isProcessingRef.current && voiceState === "listening") {
          setTimeout(() => {
            if (!isAbortedRef.current && !isProcessingRef.current) {
              listen();
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("[Voice] recognition start error:", err);
      setVoiceState("error");
      setErrorMessage("Microphone access failed");
    }
  }, [cancelSpeech, processVoiceInput, voiceState]);

  // Start real-time voice session with proper state progression
  const startSession = useCallback(async () => {
    console.log("[Voice] Button clicked");
    isAbortedRef.current = false;
    isProcessingRef.current = false;
    setErrorMessage("");
    setLiveTranscript("");

    // State 1: requesting_permission
    setVoiceState("requesting_permission");
    console.log("[Voice] Requesting microphone");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceState("error");
      setErrorMessage("Microphone not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[Voice] Microphone granted");
      mediaStreamRef.current = stream;

      // Start listening directly so the user can speak immediately
      setVoiceState("listening");
      listen();
    } catch (error: any) {
      console.error("[Voice] Microphone error:", error);
      setVoiceState("error");

      if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
        setErrorMessage("Microphone blocked (click 🔒 to allow)");
      } else if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
        setErrorMessage("No microphone detected");
      } else if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
        setErrorMessage("Microphone in use by another app");
      } else {
        setErrorMessage("Microphone permission failed");
      }

      return;
    }
  }, [listen]);

  // Stop session & hang up
  const endSession = useCallback(() => {
    isAbortedRef.current = true;
    isProcessingRef.current = false;
    cancelSpeech();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    setVoiceState("idle");
    setLiveTranscript("");
    setErrorMessage("");
    conversationMemoryRef.current = [];
  }, [cancelSpeech]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isAbortedRef.current = true;
      cancelSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        } catch {}
        mediaStreamRef.current = null;
      }
    };
  }, [cancelSpeech]);

  const isActive = voiceState !== "idle";

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-auto select-none">
      <AnimatePresence mode="popLayout" initial={false}>
        {!isActive ? (
          /* ── Collapsed: Warm Amber Reference Pill "Need help?" (#C57708, green pulse dot) ── */
          <motion.button
            key="collapsed-btn"
            layout
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            onClick={startSession}
            aria-label="Start Context-Aware Voice Agent"
            className="flex items-center gap-2.5 rounded-full bg-[#C57708] text-white pl-4 pr-5 py-3 shadow-xl shadow-[#C57708]/30 hover:bg-[#A85F00] transition-colors cursor-pointer"
          >
            <span className="relative flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white stroke-[2.2]" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25AB21] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#25AB21] ring-2 ring-[#C57708]" />
              </span>
            </span>

            <span className="text-sm font-bold tracking-tight text-white">
              Need help?
            </span>
          </motion.button>
        ) : (
          /* ── Active: Real-time Voice Call Pill with Dancing Equalizer ── */
          <motion.div
            key="active-voice-pill"
            layout
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.75, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className={`flex items-center gap-3 rounded-full bg-panel/95 backdrop-blur-xl border shadow-2xl pl-3.5 pr-2 py-2 transition-colors ${
              voiceState === "error"
                ? "border-rose-500/50 shadow-rose-500/20"
                : "border-[#C57708]/40 shadow-[#C57708]/25"
            }`}
          >
            {/* Pulsing Voice Orb / Mic Indicator */}
            <div className="relative flex items-center justify-center">
              {voiceState !== "error" && (
                <motion.span
                  className="absolute w-10 h-10 rounded-full bg-[#C57708]/25"
                  animate={
                    voiceState === "listening" || voiceState === "speaking"
                      ? { scale: [1, 1.8], opacity: [0.6, 0] }
                      : { scale: 1, opacity: 0.2 }
                  }
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}

              <button
                type="button"
                onClick={() => {
                  if (voiceState === "error") {
                    startSession();
                  } else if (voiceState === "speaking") {
                    cancelSpeech();
                    listen();
                  }
                }}
                className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  voiceState === "speaking"
                    ? "bg-[#C57708] text-white shadow-lg shadow-[#C57708]/40"
                    : voiceState === "error"
                    ? "bg-rose-500/20 text-rose-500 hover:bg-rose-500/30"
                    : "bg-[#C57708]/20 text-[#C57708]"
                }`}
                title={
                  voiceState === "error"
                    ? "Click to retry microphone permission"
                    : voiceState === "speaking"
                    ? "Click to interrupt speech"
                    : "Active microphone"
                }
              >
                {voiceState === "speaking" ? (
                  <Volume2 className="w-4 h-4 animate-pulse" />
                ) : voiceState === "error" ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Live 5-Bar Dancing Equalizer Wave (Hidden during error/requesting) */}
            {voiceState !== "error" && voiceState !== "requesting_permission" && (
              <div className="flex items-end gap-[3px] h-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    className={`w-[3px] rounded-full ${
                      voiceState === "speaking" ? "bg-[#C57708]" : "bg-[#25AB21]"
                    }`}
                    animate={
                      voiceState === "listening"
                        ? { height: ["5px", "18px", "7px", "14px", "6px"] }
                        : voiceState === "speaking"
                        ? { height: ["6px", "22px", "10px", "18px", "7px"] }
                        : { height: ["5px", "5px"] }
                    }
                    transition={{
                      duration: voiceState === "speaking" ? 0.55 : 0.75,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Live Status & Transcript Display */}
            <div className="flex flex-col min-w-[120px] max-w-[280px]">
              <span className="text-xs font-bold text-fg truncate">
                {voiceState === "requesting_permission"
                  ? "Allowing mic…"
                  : voiceState === "listening"
                  ? currentSymbolRef.current
                    ? `Listening (${currentSymbolRef.current})…`
                    : "Listening…"
                  : voiceState === "thinking"
                  ? "Thinking…"
                  : voiceState === "speaking"
                  ? "Speaking…"
                  : voiceState === "error"
                  ? "Microphone Blocked"
                  : "Voice Active"}
              </span>

              {voiceState === "error" ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-rose-500 font-semibold truncate flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errorMessage || "Click 🔒 in URL bar"}
                  </span>
                  <button
                    onClick={startSession}
                    className="text-[9px] font-bold uppercase tracking-wider bg-rose-500 text-white px-1.5 py-0.5 rounded-full hover:bg-rose-600 transition-colors cursor-pointer shrink-0"
                    title="Retry microphone"
                  >
                    Retry
                  </button>
                </div>
              ) : liveTranscript ? (
                <span className="text-[10px] text-muted truncate" title={liveTranscript}>
                  {liveTranscript}
                </span>
              ) : (
                <span className="text-[10px] text-muted/70 truncate">
                  {voiceState === "listening" ? "Speak anytime…" : ""}
                </span>
              )}
            </div>

            {/* End Call Button (✕) */}
            <button
              onClick={endSession}
              aria-label="End Call"
              title="End Voice Call"
              className="ml-1 w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 active:scale-90 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
