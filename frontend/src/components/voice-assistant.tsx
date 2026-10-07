"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle,
  Mic,
  MicOff,
  X,
  Volume2,
  Send,
  Sparkles,
  ChevronDown,
} from "lucide-react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interactive";

/**
 * VoiceAssistant — SLEEK, ULTRA-RESPONSIVE VOICE AGENT
 *
 * Powered by OpenRouter: NVIDIA Nemotron 3 Nano Omni 30B Reasoning.
 *
 * - Matches the amber reference UI pill (#C57708, green glowing pulse dot, "Need help?").
 * - Morphs in place into an active voice pill.
 * - Zero hanging: Speech synthesis has tight deterministic safety timers and GC protection.
 * - Compact & unobtrusive: No huge dialog cards covering the dashboard charts.
 * - Instant barge-in: Click or speak anytime to interrupt audio.
 */
export function VoiceAssistant() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [spokenReply, setSpokenReply] = useState<string>("");
  const [isMicAvailable, setIsMicAvailable] = useState<boolean>(true);
  const [showQuickTray, setShowQuickTray] = useState<boolean>(false);
  const [textInput, setTextInput] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const safetyTimerRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const isAbortedRef = useRef<boolean>(false);

  // Stop any ongoing speech playback cleanly
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
    isSpeakingRef.current = false;
  }, []);

  // Browser Native Speech Synthesis with guaranteed deterministic finish
  const playVoice = useCallback(
    (cleanText: string, onFinish?: () => void) => {
      cancelSpeech();

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        isSpeakingRef.current = false;
        setVoiceState(isMicAvailable ? "listening" : "interactive");
        onFinish?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;

      // Pick Indian/English voice if present
      try {
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find(
            (v) =>
              v.lang.includes("en-IN") ||
              v.lang.includes("hi-IN") ||
              v.name.toLowerCase().includes("india")
          ) ||
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Natural") ||
                v.name.includes("Google") ||
                v.name.includes("Microsoft"))
          ) ||
          voices.find((v) => v.lang.startsWith("en"));

        if (preferred) utterance.voice = preferred;
      } catch {}

      // Anchor to window & ref to prevent Chromium GC cancellation
      utteranceRef.current = utterance;
      (window as any).__voiceUtterance = utterance;

      isSpeakingRef.current = true;
      setVoiceState("speaking");

      let resolved = false;
      const finishPlayback = () => {
        if (resolved) return;
        resolved = true;

        if (safetyTimerRef.current) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }

        utteranceRef.current = null;
        if (typeof window !== "undefined") {
          (window as any).__voiceUtterance = null;
        }
        isSpeakingRef.current = false;

        if (!isAbortedRef.current) {
          if (onFinish) {
            onFinish();
          } else {
            setVoiceState(isMicAvailable ? "listening" : "interactive");
          }
        }
      };

      utterance.onend = finishPlayback;
      utterance.onerror = finishPlayback;

      // Tight, realistic safety timer: max 6.5s, speech speed ~14 chars/sec
      const timeoutMs = Math.min(6500, Math.max(1600, Math.ceil(cleanText.length * 60) + 900));
      safetyTimerRef.current = setTimeout(finishPlayback, timeoutMs);

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finishPlayback();
      }
    },
    [cancelSpeech, isMicAvailable]
  );

  // Clean formatted response for spoken pronunciation
  const speakResponse = useCallback(
    (text: string, onFinish?: () => void) => {
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
        onFinish?.();
        return;
      }

      setSpokenReply(text);
      playVoice(cleanText, onFinish);
    },
    [playVoice]
  );

  // Extract live context from current page DOM
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
        .slice(0, 50)
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

  // Web Speech recognition loop
  const startListening = useCallback(() => {
    if (typeof window === "undefined" || isAbortedRef.current) return;

    cancelSpeech();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsMicAvailable(false);
      setVoiceState("interactive");
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
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (!isAbortedRef.current) {
          setIsMicAvailable(true);
          setVoiceState("listening");
        }
      };

      recognition.onresult = (event: any) => {
        const speech = event.results[0]?.[0]?.transcript;
        if (speech && !isAbortedRef.current) {
          processVoiceQuery(speech);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setIsMicAvailable(false);
          setVoiceState("interactive");
        } else if (!isAbortedRef.current && !isSpeakingRef.current) {
          setTimeout(() => {
            if (!isAbortedRef.current && !isSpeakingRef.current && isMicAvailable) {
              try {
                recognition.start();
              } catch {}
            }
          }, 350);
        }
      };

      recognition.onend = () => {
        if (voiceState === "listening" && !isAbortedRef.current && !isSpeakingRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsMicAvailable(false);
      setVoiceState("interactive");
    }
  }, [cancelSpeech, voiceState, isMicAvailable]);

  // Query AI Backend (OpenRouter NVIDIA Nemotron 3 Nano Omni 30B)
  const processVoiceQuery = useCallback(
    async (userSpeech: string) => {
      if (!userSpeech.trim() || isAbortedRef.current) return;

      cancelSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      setVoiceState("thinking");
      setTranscript(userSpeech);

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
        const reply =
          json.reply ||
          "Data on screen has been checked. Metrics are up to date.";

        if (!isAbortedRef.current) {
          speakResponse(reply, () => {
            if (!isAbortedRef.current) {
              if (isMicAvailable) {
                startListening();
              } else {
                setVoiceState("interactive");
              }
            }
          });
        }
      } catch {
        if (!isAbortedRef.current) {
          speakResponse("Please ask again, I will check the live numbers.", () => {
            if (isMicAvailable) {
              startListening();
            } else {
              setVoiceState("interactive");
            }
          });
        }
      }
    },
    [cancelSpeech, extractPageContext, speakResponse, isMicAvailable, startListening]
  );

  // Request browser hardware microphone permission
  const tryRequestMic = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setIsMicAvailable(true);
        startListening();
        return true;
      } catch {
        setIsMicAvailable(false);
        setVoiceState("interactive");
        return false;
      }
    }
    return false;
  }, [startListening]);

  // Start Voice Assistant session (Plays brief greeting & auto-listens)
  const startVoice = useCallback(async () => {
    isAbortedRef.current = false;
    setVoiceState("connecting");
    setTranscript("");
    setSpokenReply("");

    let micGranted = false;
    if (typeof navigator !== "undefined" && navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        micGranted = true;
        setIsMicAvailable(true);
      } catch {
        micGranted = false;
        setIsMicAvailable(false);
      }
    }

    const pageCtx = extractPageContext();
    const greeting = pageCtx.symbol
      ? `Hello! Ask me anything about ${pageCtx.symbol}.`
      : "Hello! What stock would you like to check?";

    speakResponse(greeting, () => {
      if (!isAbortedRef.current) {
        if (micGranted) {
          startListening();
        } else {
          setVoiceState("interactive");
        }
      }
    });
  }, [extractPageContext, speakResponse, startListening]);

  // Stop & hang up voice session
  const stopVoice = useCallback(() => {
    isAbortedRef.current = true;
    cancelSpeech();

    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      micStreamRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    setVoiceState("idle");
    setTranscript("");
    setSpokenReply("");
    setShowQuickTray(false);
  }, [cancelSpeech]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isAbortedRef.current = true;
      cancelSpeech();
      if (micStreamRef.current) {
        try {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [cancelSpeech]);

  const isActive = voiceState !== "idle";
  const pageCtx = extractPageContext();

  const QUICK_QUESTIONS = pageCtx.symbol
    ? [
        "52-week High/Low kya hai?",
        "P/E ratio kitna hai?",
        "RSI trend kaisa hai?",
        "Promoter holding kitni hai?",
      ]
    : [
        "Nifty trend kaisa hai?",
        "Top gainers kaun hain?",
        "Market sentiment kaisa hai?",
      ];

  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-auto flex flex-col items-end gap-2">
      {/* ── Sleek Spoken Subtitle Bubble (Compact Floating Bubble) ── */}
      <AnimatePresence>
        {isActive && spokenReply && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="max-w-xs rounded-2xl bg-panel/95 backdrop-blur-xl border border-[#C57708]/30 shadow-2xl px-3.5 py-2.5 text-xs text-fg flex items-start gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#C57708] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[11px] leading-relaxed line-clamp-3 text-fg font-medium">
                {spokenReply}
              </p>
            </div>
            <button
              onClick={() => setSpokenReply("")}
              className="text-muted hover:text-fg p-0.5"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Compact Quick Prompt Tray (Only when tray toggled or mic is blocked) ── */}
      <AnimatePresence>
        {isActive && (showQuickTray || (!isMicAvailable && voiceState === "interactive")) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="w-80 rounded-2xl bg-panel/95 backdrop-blur-xl border border-[#C57708]/30 shadow-2xl p-3 text-xs"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#C57708] flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" />
                Tap to hear voice answer:
              </span>
              {!isMicAvailable && (
                <button
                  onClick={tryRequestMic}
                  className="text-[10px] font-semibold text-[#C57708] bg-[#C57708]/15 px-2 py-0.5 rounded-full hover:bg-[#C57708]/25 flex items-center gap-1"
                >
                  <Mic className="w-2.5 h-2.5" />
                  Enable Mic
                </button>
              )}
            </div>

            {/* Quick Question Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => processVoiceQuery(q)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-[#C57708]/20 hover:text-[#C57708] text-fg font-medium transition-colors text-left active:scale-95"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Compact Typed Query Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (textInput.trim()) {
                  processVoiceQuery(textInput);
                  setTextInput("");
                }
              }}
              className="flex items-center gap-1.5 pt-1"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 px-2.5 py-1 rounded-lg border border-border/70 bg-bg/90 text-xs text-fg placeholder:text-muted focus:outline-none focus:border-[#C57708]"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="p-1 rounded-lg bg-[#C57708] text-white disabled:opacity-40 hover:bg-[#A85F00] transition-colors"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Voice Pill Button ── */}
      <AnimatePresence mode="popLayout" initial={false}>
        {!isActive ? (
          /* ── Collapsed: Warm Amber "Need help?" (#C57708, green pulse dot) ── */
          <motion.button
            key="btn"
            layout
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={startVoice}
            aria-label="Talk to voice assistant"
            className="flex items-center gap-2.5 rounded-full bg-[#C57708] text-white pl-4 pr-5 py-3 shadow-xl shadow-[#C57708]/30 hover:bg-[#A85F00] transition-colors cursor-pointer select-none"
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
          /* ── Active: Morphs in place into sleek Voice Pill ── */
          <motion.div
            key="pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex items-center gap-2.5 rounded-2xl bg-panel/95 backdrop-blur-md border border-[#C57708]/35 shadow-2xl shadow-[#C57708]/25 pl-3 pr-2 py-2"
          >
            {voiceState === "connecting" ? (
              <>
                <span className="w-4 h-4 border-2 border-[#C57708]/40 border-t-[#C57708] rounded-full animate-spin" />
                <span className="text-xs font-semibold text-fg pr-1">Connecting…</span>
              </>
            ) : (
              <>
                {/* Interactive Mic / Speaker Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (voiceState === "speaking") {
                      cancelSpeech();
                      if (isMicAvailable) startListening();
                      else setVoiceState("interactive");
                    } else if (isMicAvailable) {
                      startListening();
                    } else {
                      tryRequestMic();
                    }
                  }}
                  className="relative flex items-center justify-center cursor-pointer p-1"
                  title={
                    voiceState === "speaking"
                      ? "Click to interrupt speech"
                      : isMicAvailable
                      ? "Listening — click to speak"
                      : "Mic blocked — click to request"
                  }
                >
                  <motion.span
                    className="absolute w-8 h-8 rounded-full bg-[#C57708]/20"
                    animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                  <span className="relative w-7 h-7 rounded-full bg-[#C57708]/15 flex items-center justify-center">
                    {voiceState === "speaking" ? (
                      <Volume2 className="w-3.5 h-3.5 text-[#C57708] animate-pulse" />
                    ) : isMicAvailable ? (
                      <Mic className="w-3.5 h-3.5 text-[#C57708]" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-rose-500" />
                    )}
                  </span>
                </button>

                {/* Animated 5-Bar Equalizer */}
                <div className="flex items-end gap-[2.5px] h-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[2.5px] rounded-full bg-[#C57708]"
                      animate={
                        voiceState === "listening" || voiceState === "speaking"
                          ? { height: ["4px", "16px", "7px", "14px", "5px"] }
                          : { height: ["5px", "5px"] }
                      }
                      transition={{
                        duration: voiceState === "speaking" ? 0.6 : 0.85,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>

                {/* Real-time State Title */}
                <div className="flex flex-col min-w-[65px] max-w-[140px]">
                  <span className="text-xs font-bold text-fg truncate">
                    {voiceState === "listening"
                      ? "Listening…"
                      : voiceState === "thinking"
                      ? "Thinking…"
                      : voiceState === "speaking"
                      ? "Speaking…"
                      : "Voice Ready"}
                  </span>
                  {transcript && voiceState === "thinking" && (
                    <span className="text-[10px] text-muted truncate">
                      &quot;{transcript}&quot;
                    </span>
                  )}
                </div>

                {/* Quick Prompts Toggle */}
                <button
                  type="button"
                  onClick={() => setShowQuickTray((prev) => !prev)}
                  className="p-1 rounded-lg text-muted hover:text-fg hover:bg-secondary/60 transition-colors"
                  title="Toggle Quick Questions"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      showQuickTray ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </>
            )}

            {/* End Voice Session Button (✕) */}
            <button
              onClick={stopVoice}
              aria-label="End Voice Agent"
              title="Close Voice Assistant"
              className="w-7 h-7 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 active:scale-90 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
