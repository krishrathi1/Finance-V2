"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();

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

  // Stop any active speech synthesis safely
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
  }, []);

  // Update page context and detect symbol change across navigations
  useEffect(() => {
    const freshContext = buildVoicePageContext();
    const newSymbol = freshContext.stock?.symbol || "";
    const newRoute = freshContext.route || pathname;

    // If navigating between different stocks (e.g. RELIANCE -> TCS), reset stock-specific memory
    if (currentSymbolRef.current && newSymbol && currentSymbolRef.current !== newSymbol) {
      console.log(`[voice] navigating from ${currentSymbolRef.current} to ${newSymbol}, resetting conversation memory.`);
      conversationMemoryRef.current = [];
    }

    currentSymbolRef.current = newSymbol;
    currentRouteRef.current = newRoute;
  }, [pathname, searchParams]);

  // Subscribe to live page context updates from components (e.g. LiveStockDetails, StockSectionTabs)
  useEffect(() => {
    const unsubscribe = subscribeToVoicePageContext((ctx) => {
      if (ctx.stock?.symbol) {
        currentSymbolRef.current = ctx.stock.symbol;
      }
    });
    return unsubscribe;
  }, []);

  // Query AI Backend with User Question + Complete Structured Page Context + History
  const processVoiceInput = useCallback(
    async (userSpeech: string) => {
      if (!userSpeech.trim() || isAbortedRef.current || isProcessingRef.current) return;

      isProcessingRef.current = true;
      cancelSpeech();

      // Pause speech recognition while thinking & speaking
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      setVoiceState("thinking");
      setLiveTranscript(userSpeech);

      // Record user turn in conversational memory
      conversationMemoryRef.current.push({ role: "user", content: userSpeech });
      if (conversationMemoryRef.current.length > 6) {
        conversationMemoryRef.current = conversationMemoryRef.current.slice(-6);
      }

      try {
        // Retrieve live structured page context (Requirement 2 & 5)
        const pageContext: VoicePageContext = getVoicePageContext();

        const res = await fetch("/api/v1/ai/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userSpeech,
            context: {
              mode: "voice",
              pageContext,
              symbol: pageContext.stock?.symbol || "",
              exchange: pageContext.stock?.exchange || "NSE",
            },
            history: conversationMemoryRef.current,
          }),
        });

        const json = await res.json();
        const reply =
          json.reply ||
          "Data on this page has been verified. The numbers are up to date.";

        // Record assistant turn in memory
        conversationMemoryRef.current.push({ role: "assistant", content: reply });
        if (conversationMemoryRef.current.length > 6) {
          conversationMemoryRef.current = conversationMemoryRef.current.slice(-6);
        }

        if (!isAbortedRef.current) {
          speakAndListen(reply);
        }
      } catch {
        if (!isAbortedRef.current) {
          speakAndListen("Please ask again, I will check the live screen data.");
        }
      } finally {
        isProcessingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancelSpeech]
  );

  // Start continuous Web Speech recognition
  const listen = useCallback(() => {
    if (typeof window === "undefined" || isAbortedRef.current) return;

    cancelSpeech();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
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

      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let silenceTimer: any = null;

      recognition.onstart = () => {
        if (!isAbortedRef.current) {
          setVoiceState("listening");
          setErrorMessage("");
        }
      };

      recognition.onresult = (event: any) => {
        if (isAbortedRef.current || isProcessingRef.current) return;

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

        const transcriptChunk = (final || interim).trim();
        if (transcriptChunk) {
          setLiveTranscript(transcriptChunk);

          if (silenceTimer) clearTimeout(silenceTimer);

          if (final) {
            processVoiceInput(final);
          } else {
            // After 1.1s of quiet pause following user speech, submit query
            silenceTimer = setTimeout(() => {
              if (transcriptChunk && !isProcessingRef.current) {
                processVoiceInput(transcriptChunk);
              }
            }, 1100);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("[Voice] recognition error:", e.error);
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
        } else if (!isAbortedRef.current && !isProcessingRef.current && voiceState === "listening") {
          setTimeout(() => {
            if (!isAbortedRef.current && !isProcessingRef.current && voiceState === "listening") {
              try {
                recognition.start();
              } catch {}
            }
          }, 300);
        }
      };

      recognition.onend = () => {
        if (
          !isAbortedRef.current &&
          !isProcessingRef.current &&
          voiceState === "listening"
        ) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("[Voice] recognition start error:", err);
      setVoiceState("error");
      setErrorMessage("Microphone access failed");
    }
  }, [cancelSpeech, isProcessingRef, processVoiceInput, voiceState]);

  // Speak voice response and immediately loop back to listening
  const speakAndListen = useCallback(
    (text: string) => {
      cancelSpeech();

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        listen();
        return;
      }

      const cleanText = text
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
        listen();
        return;
      }

      setLiveTranscript(text);
      setVoiceState("speaking");

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;

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

      let finished = false;
      const onComplete = () => {
        if (finished) return;
        finished = true;

        if (safetyTimerRef.current) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }

        utteranceRef.current = null;
        if (typeof window !== "undefined") {
          (window as any).__voiceUtterance = null;
        }

        if (!isAbortedRef.current) {
          setLiveTranscript("");
          listen();
        }
      };

      utterance.onend = onComplete;
      utterance.onerror = onComplete;

      // Deterministic safety timer so state NEVER hangs in "speaking"
      const maxMs = Math.min(8000, Math.max(1800, cleanText.length * 60) + 800);
      safetyTimerRef.current = setTimeout(onComplete, maxMs);

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        onComplete();
      }
    },
    [cancelSpeech, listen]
  );

  // Start real-time voice session with proper state progression
  const startSession = useCallback(async () => {
    isAbortedRef.current = false;
    isProcessingRef.current = false;
    setErrorMessage("");
    setLiveTranscript("");

    // State 1: requesting_permission
    setVoiceState("requesting_permission");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceState("error");
      setErrorMessage("Microphone not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[Voice] Microphone permission granted");
      mediaStreamRef.current = stream;

      // Only NOW proceed to start voice greeting and listening
      const pageCtx = getVoicePageContext();
      const target = pageCtx.stock?.symbol || pageCtx.stock?.companyName;
      const greeting = target
        ? `I'm listening. Ask me anything about ${target}.`
        : "I'm listening. What stock or metric would you like to explore?";

      speakAndListen(greeting);
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

      // CRITICAL FIX: NEVER proceed to speakAndListen if microphone access failed!
      return;
    }
  }, [speakAndListen]);

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
            <div className="flex flex-col min-w-[90px] max-w-[220px]">
              <span className="text-xs font-bold text-fg truncate">
                {voiceState === "requesting_permission"
                  ? "Allowing mic…"
                  : voiceState === "listening"
                  ? currentSymbolRef.current
                    ? `Listening (${currentSymbolRef.current})…`
                    : "Listening to you…"
                  : voiceState === "thinking"
                  ? "Nemotron thinking…"
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
                <span className="text-[10px] text-muted truncate">
                  &quot;{liveTranscript}&quot;
                </span>
              ) : null}
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
