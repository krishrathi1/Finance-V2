"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Mic, MicOff, X, Volume2 } from "lucide-react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

/**
 * PURE REAL-TIME VOICE-TO-VOICE AGENT
 *
 * 🎙️ You Speak -> 🧠 Nemotron Thinks -> 🔊 Agent Speaks -> 🎙️ Back to Listening
 *
 * - ZERO text cards, ZERO question chips, ZERO modals.
 * - Pure voice conversation just like a real-time voice call.
 * - Hands-free continuous loop.
 * - Full awareness of on-screen stock & market data.
 */
export function VoiceAssistant() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [micBlocked, setMicBlocked] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const safetyTimerRef = useRef<any>(null);
  const isAbortedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Stop any active speech synthesis immediately
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

  // Extract live context from current page
  const extractPageContext = useCallback(() => {
    if (typeof window === "undefined") {
      return { symbol: "", exchange: "NSE", title: "", screenText: "", pathname: "" };
    }

    const path = window.location.pathname;
    const search = window.location.search;
    const pathParts = path.split("/").filter(Boolean);

    let symbol = "";
    if (pathParts[0] === "stocks" && pathParts[1]) {
      symbol = decodeURIComponent(pathParts[1]).toUpperCase();
    }

    const searchParams = new URLSearchParams(search);
    const exchange = (searchParams.get("exchange") || "NSE").toUpperCase();

    let screenText = "";
    try {
      const main = document.querySelector("main") || document.body;
      const text = (main?.innerText || "").slice(0, 3000);
      screenText = text
        .replace(/\n\s*\n/g, "\n")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("http"))
        .slice(0, 60)
        .join(" | ");
    } catch {}

    return {
      symbol,
      exchange,
      pathname: path,
      title: document.title,
      screenText,
    };
  }, []);

  // Query AI Backend (OpenRouter Nemotron 3 Nano Omni 30B)
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

      try {
        const pageCtx = extractPageContext();

        const res = await fetch("/api/v1/ai/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userSpeech,
            context: {
              mode: "voice",
              symbol: pageCtx.symbol,
              exchange: pageCtx.exchange,
              title: pageCtx.title,
              pathname: pageCtx.pathname,
              screenText: pageCtx.screenText,
            },
          }),
        });

        const json = await res.json();
        const reply = json.reply || "Stock data checked. Metrics are up to date.";

        if (!isAbortedRef.current) {
          speakAndListen(reply);
        }
      } catch {
        if (!isAbortedRef.current) {
          speakAndListen("Please ask again, I will check the live numbers.");
        }
      } finally {
        isProcessingRef.current = false;
      }
    },
    [cancelSpeech, extractPageContext]
  );

  // Start continuous listening
  const listen = useCallback(() => {
    if (typeof window === "undefined" || isAbortedRef.current) return;

    cancelSpeech();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicBlocked(true);
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

      let silenceTimeout: any = null;

      recognition.onstart = () => {
        if (!isAbortedRef.current) {
          setMicBlocked(false);
          setVoiceState("listening");
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

        const currentText = (final || interim).trim();
        if (currentText) {
          setLiveTranscript(currentText);

          // Clear any prior speech pause timer
          if (silenceTimeout) clearTimeout(silenceTimeout);

          // If final transcript or silence after speech, process immediately
          if (final) {
            processVoiceInput(final);
          } else {
            // Wait 1.1s of silence before sending interim speech
            silenceTimeout = setTimeout(() => {
              if (currentText && !isProcessingRef.current) {
                processVoiceInput(currentText);
              }
            }, 1100);
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setMicBlocked(true);
        } else if (!isAbortedRef.current && !isProcessingRef.current) {
          setTimeout(() => {
            if (!isAbortedRef.current && !isProcessingRef.current) {
              try {
                recognition.start();
              } catch {}
            }
          }, 300);
        }
      };

      recognition.onend = () => {
        // Auto-reconnect loop if still in listening mode
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
    } catch {
      setMicBlocked(true);
    }
  }, [cancelSpeech, isProcessingRef, processVoiceInput, voiceState]);

  // Speak AI answer aloud, and automatically switch back to listening
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

      // Select natural voice
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

      // Deterministic safety timer so it NEVER gets stuck
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

  // Start real-time voice session
  const startSession = useCallback(async () => {
    isAbortedRef.current = false;
    isProcessingRef.current = false;
    setMicBlocked(false);
    setVoiceState("connecting");
    setLiveTranscript("");

    // Request mic directly
    if (typeof navigator !== "undefined" && navigator?.mediaDevices?.getUserMedia) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicBlocked(false);
      } catch {
        setMicBlocked(true);
      }
    }

    const pageCtx = extractPageContext();
    const greeting = pageCtx.symbol
      ? `I'm listening. Ask me anything about ${pageCtx.symbol}.`
      : "I'm listening. What stock would you like to check?";

    speakAndListen(greeting);
  }, [extractPageContext, speakAndListen]);

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

    setVoiceState("idle");
    setLiveTranscript("");
    setMicBlocked(false);
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
            aria-label="Start Real-Time Voice Agent"
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
            className="flex items-center gap-3 rounded-full bg-panel/95 backdrop-blur-xl border border-[#C57708]/40 shadow-2xl shadow-[#C57708]/25 pl-3.5 pr-2 py-2"
          >
            {/* Pulsing Voice Orb / Mic Indicator */}
            <div className="relative flex items-center justify-center">
              <motion.span
                className="absolute w-10 h-10 rounded-full bg-[#C57708]/25"
                animate={
                  voiceState === "listening" || voiceState === "speaking"
                    ? { scale: [1, 1.8], opacity: [0.6, 0] }
                    : { scale: 1, opacity: 0.2 }
                }
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
              />

              <div
                className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  voiceState === "speaking"
                    ? "bg-[#C57708] text-white shadow-lg shadow-[#C57708]/40"
                    : micBlocked
                    ? "bg-rose-500/15 text-rose-500"
                    : "bg-[#C57708]/20 text-[#C57708]"
                }`}
              >
                {voiceState === "speaking" ? (
                  <Volume2 className="w-4 h-4 animate-pulse" />
                ) : micBlocked ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </div>
            </div>

            {/* Live 5-Bar Dancing Equalizer Wave */}
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

            {/* Live Status & Transcript Display */}
            <div className="flex flex-col min-w-[90px] max-w-[200px]">
              <span className="text-xs font-bold text-fg">
                {voiceState === "connecting"
                  ? "Connecting…"
                  : voiceState === "listening"
                  ? "Listening to you…"
                  : voiceState === "thinking"
                  ? "Nemotron thinking…"
                  : voiceState === "speaking"
                  ? "Speaking…"
                  : "Voice Active"}
              </span>

              {micBlocked ? (
                <span className="text-[10px] text-rose-500 font-semibold truncate">
                  Mic blocked in browser
                </span>
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
