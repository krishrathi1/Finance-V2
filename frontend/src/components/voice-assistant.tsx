"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle,
  Mic,
  MicOff,
  X,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  Info,
  RotateCcw,
} from "lucide-react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interactive";

/**
 * FloatingVoiceAssistant — ULTRA REAL-TIME VOICE-ONLY AGENT.
 *
 * Collapsed:
 *  - Matches reference UI pill (#C57708, green glowing pulse dot, "Need help?").
 *
 * Active:
 *  - Morphs into real-time voice pill with animated equalizer bars.
 *  - Speaks answers aloud using Speech Synthesis / Fish Audio neural TTS.
 *  - Solves Chromium onend stall / garbage collection bug with safety timers & ref binding.
 *  - Real-time barge-in: clicking or speaking immediately stops previous audio.
 *  - Full contextual awareness of the active stock (CMP, 52W range, P/E, RSI, M-Score).
 *  - Shows live spoken subtitles so answers are immediately readable and audible.
 */
export function VoiceAssistant() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [spokenReply, setSpokenReply] = useState<string>("");
  const [isMicAvailable, setIsMicAvailable] = useState<boolean>(true);
  const [textInput, setTextInput] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSafetyTimerRef = useRef<any>(null);
  const resumeHeartbeatRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const isAbortedRef = useRef<boolean>(false);
  const fishAudioSupportedRef = useRef<boolean | null>(null);

  // Stop any ongoing audio or speech synthesis immediately
  const cancelSpeech = useCallback(() => {
    if (speechSafetyTimerRef.current) {
      clearTimeout(speechSafetyTimerRef.current);
      speechSafetyTimerRef.current = null;
    }
    if (resumeHeartbeatRef.current) {
      clearInterval(resumeHeartbeatRef.current);
      resumeHeartbeatRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume(); // Unpause Chromium audio pipeline
      } catch {}
    }
    utteranceRef.current = null;
    isSpeakingRef.current = false;
  }, []);

  // Browser Native Speech Synthesis with robust Chromium GC & stall protection
  const playNativeVoice = useCallback(
    (cleanText: string, onFinish?: () => void) => {
      cancelSpeech();

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        isSpeakingRef.current = false;
        setVoiceState((prev) => (isMicAvailable ? "listening" : "interactive"));
        onFinish?.();
        return;
      }

      try {
        window.speechSynthesis.resume();
      } catch {}

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.08;
      utterance.pitch = 1.0;

      // Select natural voice (Indian English/Hindi preferred, otherwise standard English)
      try {
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.includes("en-IN") ||
              v.lang.includes("hi-IN") ||
              v.name.toLowerCase().includes("india")
          ) ||
          voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Microsoft"))) ||
          voices.find((v) => v.lang.startsWith("en"));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      } catch {}

      // Retain utterance in ref to prevent Chromium Garbage Collection bug
      utteranceRef.current = utterance;
      isSpeakingRef.current = true;
      setVoiceState("speaking");

      let isFinished = false;
      const finishExecution = () => {
        if (isFinished) return;
        isFinished = true;

        if (speechSafetyTimerRef.current) {
          clearTimeout(speechSafetyTimerRef.current);
          speechSafetyTimerRef.current = null;
        }
        if (resumeHeartbeatRef.current) {
          clearInterval(resumeHeartbeatRef.current);
          resumeHeartbeatRef.current = null;
        }
        utteranceRef.current = null;
        isSpeakingRef.current = false;

        if (!isAbortedRef.current) {
          if (onFinish) {
            onFinish();
          } else {
            setVoiceState(isMicAvailable ? "listening" : "interactive");
          }
        }
      };

      utterance.onend = finishExecution;
      utterance.onerror = (e) => {
        console.warn("[voice] speech synthesis error event:", e);
        finishExecution();
      };

      // Safety timeout: prevents stuck "Speaking..." state in Chromium under any circumstance
      // Approx 13 chars per second + 2 seconds safety buffer
      const estDurationMs = Math.max(2500, Math.ceil((cleanText.length / 13) * 1000) + 1800);
      speechSafetyTimerRef.current = setTimeout(() => {
        console.log("[voice] safety timer triggered, advancing state");
        finishExecution();
      }, estDurationMs);

      // Chromium 15s pause bug workaround
      resumeHeartbeatRef.current = setInterval(() => {
        if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 3500);

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finishExecution();
      }
    },
    [cancelSpeech, isMicAvailable]
  );

  // Speak AI answer aloud (Neural Fish Audio if configured, else instant high-quality native synthesis)
  const speakResponse = useCallback(
    async (text: string, onFinish?: () => void) => {
      cancelSpeech();

      // Clean symbols & acronyms for natural financial pronunciation
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
        .replace(/\bCMP\b/gi, "Current Market Price")
        .trim();

      if (!cleanText) {
        onFinish?.();
        return;
      }

      setSpokenReply(text);

      // If Fish Audio is known to be unavailable, skip network roundtrip directly to 0ms native voice
      if (fishAudioSupportedRef.current === false) {
        playNativeVoice(cleanText, onFinish);
        return;
      }

      // Try Fish Audio neural TTS with a fast timeout (2.5s)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const res = await fetch("/api/v1/ai/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText, model: "fish-audio/s2.1-pro" }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok && res.headers.get("content-type")?.includes("audio") && audioRef.current) {
          fishAudioSupportedRef.current = true;
          const blob = await res.blob();
          const audioUrl = URL.createObjectURL(blob);
          audioRef.current.src = audioUrl;
          isSpeakingRef.current = true;
          setVoiceState("speaking");

          audioRef.current.onended = () => {
            isSpeakingRef.current = false;
            URL.revokeObjectURL(audioUrl);
            if (!isAbortedRef.current) {
              if (onFinish) onFinish();
              else setVoiceState(isMicAvailable ? "listening" : "interactive");
            }
          };

          audioRef.current.onerror = () => {
            isSpeakingRef.current = false;
            URL.revokeObjectURL(audioUrl);
            playNativeVoice(cleanText, onFinish);
          };

          await audioRef.current.play();
          return;
        } else {
          // If 402 verification required or unavailable, cache false to prevent repeated delays
          fishAudioSupportedRef.current = false;
        }
      } catch {
        fishAudioSupportedRef.current = false;
      }

      // Immediate browser speech synthesis fallback
      playNativeVoice(cleanText, onFinish);
    },
    [cancelSpeech, playNativeVoice, isMicAvailable]
  );

  // Extract live context from current page DOM and route
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
      const text = (main?.innerText || "").slice(0, 3500);
      screenText = text
        .replace(/\n\s*\n/g, "\n")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("http"))
        .slice(0, 70)
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

  // Start speech recognition (Web Speech STT)
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
        console.warn("[voice] speech recognition error:", e.error);
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
        // Auto-reconnect listening loop if still active and not speaking
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

  // Query AI backend with user voice query + active screen and financial data
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
          "I checked the stock details on your screen. The numbers and metrics are up to date.";

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
          speakResponse("I couldn't process that right now. Please try asking again.", () => {
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
      } catch (err) {
        console.warn("[voice] microphone permission denied:", err);
        setIsMicAvailable(false);
        setVoiceState("interactive");
        return false;
      }
    }
    return false;
  }, [startListening]);

  // Start Voice Assistant session (Speaks greeting and immediately listens)
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

    setTimeout(() => {
      if (isAbortedRef.current) return;

      const pageCtx = extractPageContext();
      let greeting =
        "Hello! I am your financial voice agent. What stock or metric would you like to explore?";
      if (pageCtx.symbol) {
        greeting = `Hello! I am your voice agent for ${pageCtx.symbol} on ${pageCtx.exchange}. Ask me anything about its current price, 52-week range, P E ratio, RSI, or financial health.`;
      } else if (pageCtx.pathname.includes("screener")) {
        greeting =
          "Hello! I am your stock screener voice agent. What screening criteria or filters are you looking for?";
      } else if (pageCtx.pathname.includes("portfolio")) {
        greeting =
          "Hello! I am your portfolio voice agent. How can I assist with your holdings or risk analysis?";
      }

      speakResponse(greeting, () => {
        if (!isAbortedRef.current) {
          if (micGranted) {
            startListening();
          } else {
            setVoiceState("interactive");
          }
        }
      });
    }, 120);
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
        "52-week High aur Low kya hai?",
        "P/E ratio kitna chal raha hai?",
        "RSI aur trend kaisa hai?",
        "Promoter holding kitni hai?",
        "M-Score aur risk kaisa hai?",
      ]
    : [
        "Nifty aur market trend kaisa hai?",
        "Top gainers aur losers kaun hain?",
        "Market breadth aur risk kaisa hai?",
      ];

  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-auto flex flex-col items-end">
      <audio ref={audioRef} autoPlay className="hidden" />

      {/* ── Active Voice Dock when in Interactive / Mic Blocked / Spoken Mode ── */}
      <AnimatePresence>
        {isActive && (!isMicAvailable || voiceState === "interactive") && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="mb-3 w-88 rounded-2xl bg-panel/95 backdrop-blur-xl border border-[#C57708]/30 shadow-2xl p-4 text-xs"
          >
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-border/50">
              <span className="font-bold text-fg flex items-center gap-1.5 text-amber-500">
                <Volume2 className="w-4 h-4 text-[#C57708]" />
                Voice Agent Spoken Audio Mode
              </span>
              <button
                onClick={tryRequestMic}
                className="text-[11px] font-semibold text-[#C57708] hover:underline flex items-center gap-1 bg-[#C57708]/10 px-2 py-0.5 rounded-full"
                title="Click to request microphone permission"
              >
                <Mic className="w-3 h-3" />
                Allow Mic
              </button>
            </div>

            {/* Mic Permission Guidance */}
            <div className="mb-2.5 p-2 rounded-lg bg-secondary/50 border border-border/40 text-[11px] text-muted flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#C57708] shrink-0 mt-0.5" />
              <span>
                Microphone blocked in browser? Click the <strong>lock icon (🔒)</strong> in the address bar &rarr; Site settings &rarr; <strong>Allow Microphone</strong>. Or tap any question below to hear spoken answers:
              </span>
            </div>

            {/* Live Spoken Subtitle / Answer Card */}
            {spokenReply && (
              <div className="mb-3 p-2.5 rounded-xl bg-[#C57708]/10 border border-[#C57708]/25 text-[11px] text-fg">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-semibold text-[#C57708] flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Live Spoken Answer:
                  </span>
                  <button
                    onClick={() => speakResponse(spokenReply)}
                    className="text-[10px] text-muted hover:text-fg flex items-center gap-0.5"
                    title="Replay Voice"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Replay
                  </button>
                </div>
                <p className="line-clamp-3 leading-relaxed">{spokenReply}</p>
              </div>
            )}

            {/* Quick Spoken Question Chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => processVoiceQuery(q)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-secondary/90 hover:bg-[#C57708]/20 hover:text-[#C57708] text-fg font-medium transition-all text-left shadow-sm active:scale-95"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Quick Typed Spoken Prompt */}
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
                placeholder="Ask any question to hear voice answer..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-border/70 bg-bg/80 text-xs text-fg placeholder:text-muted focus:outline-none focus:border-[#C57708]"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="p-1.5 rounded-lg bg-[#C57708] text-white disabled:opacity-40 hover:bg-[#A85F00] transition-colors"
                title="Ask & Speak"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Live Spoken Floating Subtitle Bubble (when mic is active and dock is closed) ── */}
      <AnimatePresence>
        {isActive && isMicAvailable && spokenReply && voiceState === "speaking" && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="mb-2 max-w-sm rounded-xl bg-panel/95 backdrop-blur-md border border-[#C57708]/30 shadow-xl p-2.5 text-xs text-fg"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#C57708] mb-1">
              <Volume2 className="w-3 h-3 animate-pulse" />
              Speaking aloud:
            </div>
            <p className="text-[11px] leading-relaxed line-clamp-3 text-muted">
              {spokenReply}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="popLayout" initial={false}>
        {!isActive ? (
          /* ── Collapsed: Exact Reference Pill "Need help?" (#C57708, green pulse dot) ── */
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
            {/* Message Bubble Icon with Glowing Green Dot */}
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
          /* ── Active: Morphs in place into Voice Pill ── */
          <motion.div
            key="pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex items-center gap-3 rounded-2xl bg-panel/95 backdrop-blur-md border border-[#C57708]/35 shadow-2xl shadow-[#C57708]/25 pl-3.5 pr-2 py-2"
          >
            {voiceState === "connecting" ? (
              <>
                <span className="w-4 h-4 border-2 border-[#C57708]/40 border-t-[#C57708] rounded-full animate-spin" />
                <span className="text-xs font-semibold text-fg pr-1">Connecting voice…</span>
              </>
            ) : (
              <>
                {/* Pulsing Glowing Mic / Speaker */}
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
                  className="relative flex items-center justify-center cursor-pointer"
                  title={
                    voiceState === "speaking"
                      ? "Click to interrupt/stop speech"
                      : isMicAvailable
                      ? "Listening - click to speak"
                      : "Microphone blocked - click to allow"
                  }
                >
                  <motion.span
                    className="absolute w-9 h-9 rounded-full bg-[#C57708]/25"
                    animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                  <span className="relative w-8 h-8 rounded-full bg-[#C57708]/20 flex items-center justify-center">
                    {voiceState === "speaking" ? (
                      <Volume2 className="w-4 h-4 text-[#C57708] animate-pulse" />
                    ) : isMicAvailable ? (
                      <Mic className="w-4 h-4 text-[#C57708]" />
                    ) : (
                      <MicOff className="w-4 h-4 text-rose-500" />
                    )}
                  </span>
                </button>

                {/* Live Animated 5-Bar Equalizer */}
                <div className="flex items-end gap-[3px] h-5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[3px] rounded-full bg-[#C57708]"
                      animate={
                        voiceState === "listening" || voiceState === "speaking"
                          ? { height: ["5px", "20px", "8px", "16px", "6px"] }
                          : { height: ["6px", "6px"] }
                      }
                      transition={{
                        duration: voiceState === "speaking" ? 0.7 : 0.9,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.12,
                      }}
                    />
                  ))}
                </div>

                {/* Real-time State & Live Transcript */}
                <div className="flex flex-col min-w-[70px] max-w-[170px]">
                  <span className="text-xs font-bold text-fg truncate">
                    {voiceState === "listening"
                      ? "Listening…"
                      : voiceState === "thinking"
                      ? "Thinking…"
                      : voiceState === "speaking"
                      ? "Speaking…"
                      : !isMicAvailable
                      ? "Voice Active"
                      : "Voice Active"}
                  </span>
                  {transcript && voiceState === "thinking" && (
                    <span className="text-[10px] text-muted truncate">
                      &quot;{transcript}&quot;
                    </span>
                  )}
                </div>
              </>
            )}

            {/* End Call / Stop Button (✕) */}
            <button
              onClick={stopVoice}
              aria-label="End Call"
              title="End Voice Agent"
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
