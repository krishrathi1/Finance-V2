"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mic,
  Square,
  X,
  AlertCircle,
  Send,
  Sparkles,
  Keyboard,
  RotateCcw,
  Bot,
} from "lucide-react";
import { RichMessageContent } from "./rich-message-content";
import { extractClientScreenSnapshot } from "@/lib/voice/context-extractor";
import { ChatTurn, ScreenSnapshot, VoiceState, VoiceTalkResponse } from "@/lib/voice/types";

interface ChatBubbleMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function FloatingVoiceAssistant() {
  // Mode: "idle" (collapsed pill) | "voice" (pure voice UI) | "chat" (dedicated chatbot UI)
  const [mode, setMode] = useState<"idle" | "voice" | "chat">("idle");

  // ── Voice Specific State ──
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string>("");
  const [voiceLiveTranscript, setVoiceLiveTranscript] = useState<string>("");

  const voiceSessionIdRef = useRef<string>("");
  const voiceHistoryRef = useRef<ChatTurn[]>([]);
  const isMutedRef = useRef<boolean>(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const currentUtteranceRef = useRef<string>("");
  const finalTranscriptRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const maxRecordingTimerRef = useRef<any>(null);
  const isSpeakingSpeechSynthRef = useRef<boolean>(false);

  // ── Chat Specific State ──
  const [chatMessages, setChatMessages] = useState<ChatBubbleMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Namaste! I'm Priya, your AI financial research assistant. Ask me anything about the stock, financials, or metrics on this screen.",
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string>("");

  const chatSessionIdRef = useRef<string>("");
  const chatHistoryRef = useRef<ChatTurn[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
          let fullTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            if (item && item[0]) {
              fullTranscript += item[0].transcript + " ";
            }
          }

          const clean = fullTranscript.trim();
          if (clean) {
            currentUtteranceRef.current = clean;
            setVoiceLiveTranscript(clean);

            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }

            // Auto-submit after 750ms of silence once at least 2 words have been spoken
            if (clean.split(/\s+/).length >= 2) {
              silenceTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                  mediaRecorderRef.current.stop();
                }
              }, 750);
            }
          }
        };

        recognition.onend = () => {
          if (
            !isMutedRef.current &&
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            try {
              recognition.start();
            } catch {}
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

  // Scroll to bottom of chat when new message arrives
  useEffect(() => {
    if (mode === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatLoading, mode]);

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
      if (!isMutedRef.current && mode === "voice") {
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
      if (isMutedRef.current || mode !== "voice") return;
      startListening();
    };

    utterance.onerror = () => {
      isSpeakingSpeechSynthRef.current = false;
      if (isMutedRef.current || mode !== "voice") return;
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const playAudio = useCallback((base64Data: string | null, mimeType = "audio/mpeg", fallbackText?: string) => {
    if (isMutedRef.current || mode !== "voice") return;

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
          if (isMutedRef.current || mode !== "voice") return;
          startListening();
        };

        audio.onerror = () => {
          if (isMutedRef.current || mode !== "voice") return;
          fallbackSpeechSynthesis(fallbackText);
        };

        audio.play().catch(() => {
          if (isMutedRef.current || mode !== "voice") return;
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
      if (isMutedRef.current || mode !== "voice") return;
      startListening();
    }
  }, [mode]);

  const sendVoiceUtteranceToBackend = async (audioBlob: Blob | null, textQuery: string) => {
    if (isMutedRef.current) return;
    setVoiceState("thinking");
    setVoiceStatusMessage("Analyzing screen & query…");

    try {
      abortControllerRef.current = new AbortController();

      let base64Audio: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (audioBlob && audioBlob.size > 800) {
        mimeType = audioBlob.type || "audio/webm";
        base64Audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = (reader.result as string)?.split(",")[1] || "";
            resolve(res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
      }

      const screenSnapshot: ScreenSnapshot = extractClientScreenSnapshot(voiceSessionIdRef.current);

      const res = await fetch("/api/v1/voice/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          sessionId: voiceSessionIdRef.current,
          message: textQuery.trim(),
          audioData: base64Audio,
          mimeType,
          history: voiceHistoryRef.current.slice(-6),
          screenSnapshot,
        }),
      });

      if (isMutedRef.current) return;

      const data: VoiceTalkResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server responded with ${res.status}`);
      }

      const queryUsed = data.userQuery || textQuery.trim();
      if (queryUsed) {
        voiceHistoryRef.current.push({ role: "user", text: queryUsed });
      }
      if (data.textReply) {
        voiceHistoryRef.current.push({ role: "assistant", text: data.textReply });
      }

      setVoiceLiveTranscript(data.textReply);
      playAudio(data.audioBase64, data.audioMimeType || "audio/mpeg", data.textReply);
    } catch (err: any) {
      if (err.name === "AbortError" || isMutedRef.current) {
        return;
      }
      console.error("[voice] process error:", err);
      setVoiceStatusMessage(err?.message || "Failed to process voice request");
      setVoiceState("error");
    }
  };

  const startListening = useCallback(async () => {
    if (isMutedRef.current) return;

    setVoiceState("requesting_permission");
    setVoiceStatusMessage("Listening…");
    setVoiceLiveTranscript("");
    currentUtteranceRef.current = "";
    finalTranscriptRef.current = "";

    try {
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

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch {}
      }

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
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
        }

        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;

        if (isMutedRef.current) return;

        const spokenText = (currentUtteranceRef.current || finalTranscriptRef.current || "").trim();
        const audioBlob =
          audioChunksRef.current.length > 0
            ? new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
            : null;

        if (!spokenText && (!audioBlob || audioBlob.size < 1200)) {
          setVoiceStatusMessage("Didn't catch that. Tap mic and speak.");
          setVoiceState("listening");
          startListening();
          return;
        }

        setVoiceState("processing");
        sendVoiceUtteranceToBackend(audioBlob, spokenText);
      };

      recorder.start(250);
      setVoiceState("listening");

      if (maxRecordingTimerRef.current) {
        clearTimeout(maxRecordingTimerRef.current);
      }
      maxRecordingTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 12000);
    } catch {
      setVoiceStatusMessage("Microphone permission denied");
      setVoiceState("error");
    }
  }, []);

  // ── Handlers for Voice Mode ──
  const handleStartVoice = async () => {
    cleanupAllAudio();
    isMutedRef.current = false;
    voiceHistoryRef.current = [];
    voiceSessionIdRef.current = `sess_voice_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setMode("voice");
    startListening();
  };

  const handleCloseVoice = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    cleanupAllAudio();
    setMode("idle");
    setVoiceState("idle");
    setVoiceLiveTranscript("");
    setVoiceStatusMessage("");
  };

  const handleStopSpeakingAndSubmit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleQuickQuestionVoice = (queryText: string) => {
    if (speechRecognitionRef.current) {
      try {
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
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    sendVoiceUtteranceToBackend(null, queryText);
  };

  // ── Handlers for Chat Mode ──
  const handleStartChat = () => {
    cleanupAllAudio();
    if (!chatSessionIdRef.current) {
      chatSessionIdRef.current = `sess_chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    setMode("chat");
    setChatError("");
  };

  const handleCloseChat = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setMode("idle");
  };

  const handleClearChat = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    chatHistoryRef.current = [];
    chatSessionIdRef.current = `sess_chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setChatMessages([
      {
        id: `cleared_${Date.now()}`,
        role: "assistant",
        text: "Conversation reset! How can I assist you with this stock or screen?",
      },
    ]);
    setChatError("");
  };

  const handleSendChatMessage = async (textToSend: string) => {
    const query = textToSend.trim();
    if (!query || chatLoading) return;

    setChatInput("");
    setChatError("");

    // Append user message to chat UI
    const userMsgId = `user_${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: query },
    ]);
    chatHistoryRef.current.push({ role: "user", text: query });
    setChatLoading(true);

    try {
      const screenSnapshot: ScreenSnapshot = extractClientScreenSnapshot(chatSessionIdRef.current);

      const res = await fetch("/api/v1/voice/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: chatSessionIdRef.current,
          message: query,
          history: chatHistoryRef.current.slice(-6),
          screenSnapshot,
        }),
      });

      const data: VoiceTalkResponse = await res.json();

      if (!res.ok || !data.success || !data.textReply) {
        throw new Error(data.error || "Unable to formulate a response.");
      }

      const botReply = data.textReply;
      chatHistoryRef.current.push({ role: "assistant", text: botReply });
      setChatMessages((prev) => [
        ...prev,
        { id: `assistant_${Date.now()}`, role: "assistant", text: botReply },
      ]);
    } catch (err: any) {
      console.error("[chat] error:", err);
      setChatError(err?.message || "Failed to get response. Please try again.");
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          text: "I couldn't process that query right now. Please ensure your screen or stock data is loaded and try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendChatMessage(chatInput);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <AnimatePresence mode="popLayout" initial={false}>
        {/* ── 1. Collapsed State: Modern Floating Pill with Speak & Type Buttons ── */}
        {mode === "idle" && (
          <motion.div
            key="btn-group"
            layout
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="flex items-center rounded-full bg-[#C57708] shadow-2xl shadow-[#C57708]/35 border border-amber-400/25 p-1 transition-all"
          >
            {/* Voice / Speak Button */}
            <button
              onClick={handleStartVoice}
              aria-label="Speak to Voice Agent"
              title="Speak to Priya using your microphone"
              className="flex items-center gap-2 rounded-full pl-3.5 pr-3 py-2 text-white hover:bg-black/10 transition-colors"
            >
              <span className="relative flex">
                <Mic className="w-4 h-4 text-white" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#25AB21] animate-ping" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#25AB21]" />
              </span>
              <span className="text-xs font-semibold tracking-wide">
                Speak
              </span>
            </button>

            <div className="w-[1px] h-4 bg-white/30" />

            {/* Type / Keyboard Chatbot Button */}
            <button
              onClick={handleStartChat}
              aria-label="Type question to Priya"
              title="Open text chatbot"
              className="flex items-center gap-1.5 pl-2.5 pr-3.5 py-2 rounded-full text-white/95 hover:text-white hover:bg-black/10 text-xs font-semibold transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Type</span>
            </button>
          </motion.div>
        )}

        {/* ── 2. Voice Mode: PURE Voice Assistant UI (No text input) ── */}
        {mode === "voice" && (
          <motion.div
            key="voice-pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex flex-col gap-2.5 rounded-2xl bg-white/95 text-zinc-900 border border-amber-500/30 shadow-2xl shadow-black/15 dark:bg-[#0b0f19] dark:border-amber-500/35 dark:shadow-black/60 dark:text-white p-4 backdrop-blur-2xl w-80 sm:w-96"
          >
            {/* Top Bar with Status and Instant Stop/Cross Button */}
            <div className="flex items-center gap-2.5">
              {voiceState === "requesting_permission" ? (
                <>
                  <span className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Connecting mic…
                  </span>
                </>
              ) : voiceState === "processing" || voiceState === "thinking" ? (
                <>
                  <span className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {voiceStatusMessage || "Priya analyzing screen…"}
                  </span>
                </>
              ) : voiceState === "speaking" ? (
                <>
                  {/* Speaking Equalizer */}
                  <span className="relative flex items-center justify-center">
                    <motion.span
                      className="absolute w-7 h-7 rounded-full bg-amber-500/20"
                      animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="relative w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </span>
                  </span>
                  <div className="flex items-end gap-[3px] h-5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.span
                        key={i}
                        className="w-[3px] rounded-full bg-amber-500 dark:bg-amber-400"
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
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Priya speaking…
                  </span>
                </>
              ) : voiceState === "error" ? (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-500 dark:text-red-400 truncate">
                    {voiceStatusMessage || "Error"}
                  </span>
                </>
              ) : (
                /* Listening State */
                <>
                  <span className="relative flex items-center justify-center">
                    <motion.span
                      className="absolute w-7 h-7 rounded-full bg-emerald-500/20"
                      animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="relative w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  </span>
                  <div className="flex items-end gap-[2px] h-4">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-[2.5px] rounded-full bg-emerald-500 dark:bg-emerald-400"
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
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Listening…
                  </span>

                  {/* Tap-to-done button */}
                  <button
                    type="button"
                    onClick={handleStopSpeakingAndSubmit}
                    title="Done speaking"
                    className="ml-auto px-2.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-all flex items-center gap-1 border border-amber-500/30"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                    Done
                  </button>
                </>
              )}

              {/* Instant Cut-off Stop / Cross Button */}
              <button
                type="button"
                onClick={handleCloseVoice}
                aria-label="Stop and exit voice mode"
                title="Exit voice mode"
                className="ml-auto w-7 h-7 rounded-full bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90 border border-red-500/20"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Live Subtitle Area */}
            {voiceLiveTranscript && (
              <p className="text-[11px] leading-relaxed text-zinc-800 bg-zinc-100 border border-zinc-200 dark:text-zinc-200 dark:bg-[#131b2e] dark:border-white/10 p-2.5 rounded-xl max-h-24 overflow-y-auto italic">
                &ldquo;{voiceLiveTranscript}&rdquo;
              </p>
            )}

            {/* Quick Screen Context Voice Prompts */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none text-[10px] pt-1">
              <button
                type="button"
                onClick={() => handleQuickQuestionVoice("What is the current CMP and day change of this stock?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200 dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium flex items-center gap-1"
              >
                <Sparkles className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" /> Price & Change
              </button>
              <button
                type="button"
                onClick={() => handleQuickQuestionVoice("What is the PE ratio and valuation status?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200 dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium"
              >
                P/E & Valuation
              </button>
              <button
                type="button"
                onClick={() => handleQuickQuestionVoice("Is this stock financially safe based on screen metrics?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200 dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium"
              >
                Smart Score
              </button>
              <button
                type="button"
                onClick={() => handleQuickQuestionVoice("Summarize the key risks and red flags visible.")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200 dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium"
              >
                Key Risks
              </button>
            </div>
          </motion.div>
        )}

        {/* ── 3. Chat Mode: DEDICATED Type Chatbot UI ── */}
        {mode === "chat" && (
          <motion.div
            key="chat-window"
            layout
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 26 }}
            className="flex flex-col rounded-2xl bg-white text-zinc-900 border border-amber-500/30 shadow-2xl shadow-black/15 dark:bg-[#0b0f19] dark:text-zinc-100 dark:border-amber-500/35 dark:shadow-black/70 backdrop-blur-2xl w-[92vw] sm:w-[460px] md:w-[500px] h-[540px] max-h-[85vh] overflow-hidden"
          >
            {/* Chatbot Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-[#101726]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    Priya AI Assistant
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  </h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Screen & Market Aware
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Clear chat history"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCloseChat}
                  title="Close chatbot"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-500/15 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Message Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-zinc-50/60 dark:bg-[#0b0f19]">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[88%] sm:max-w-[94%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white rounded-tr-xs shadow-md font-medium whitespace-pre-wrap"
                        : "bg-white text-zinc-800 border border-zinc-200/90 shadow-xs dark:bg-[#131b2e] dark:text-zinc-100 dark:border-white/10 dark:shadow-sm rounded-tl-xs"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-line">{msg.text}</p>
                    ) : (
                      <RichMessageContent content={msg.text} />
                    )}
                  </div>
                </div>
              ))}

              {/* Typing / Thinking Indicator */}
              {chatLoading && (
                <div className="flex justify-start items-center">
                  <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400 flex items-center justify-center mr-2 flex-shrink-0">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-white border border-zinc-200/90 shadow-xs dark:bg-[#131b2e] dark:border-white/10 rounded-2xl rounded-tl-xs px-3.5 py-2.5 flex items-center gap-2 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium ml-1">Priya thinking…</span>
                  </div>
                </div>
              )}

              {/* Chat Error Notice */}
              {chatError && (
                <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20 p-2.5 rounded-xl text-center">
                  {chatError}
                </p>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick Context Prompt Chips */}
            <div className="px-3.5 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none border-t border-zinc-200/80 bg-zinc-50/80 dark:border-white/10 dark:bg-[#0e1422] text-[10px]">
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("What is the current CMP and day change of this stock?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200/90 shadow-2xs dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium disabled:opacity-50 flex items-center gap-1"
              >
                <Sparkles className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" /> Price & Change
              </button>
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("What is the PE ratio and valuation status?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200/90 shadow-2xs dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium disabled:opacity-50"
              >
                P/E & Valuation
              </button>
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("Is this stock financially safe based on screen metrics?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200/90 shadow-2xs dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium disabled:opacity-50"
              >
                Smart Score
              </button>
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("Summarize the key risks and red flags visible.")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-amber-50 hover:text-amber-800 border border-zinc-200/90 shadow-2xs dark:bg-[#151e33] dark:text-zinc-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300 dark:border-white/10 transition-all font-medium disabled:opacity-50"
              >
                Key Risks
              </button>
            </div>

            {/* Type Question Input Bar (Pure Keyboard, No Mic) */}
            <form
              onSubmit={handleChatFormSubmit}
              className="flex items-center gap-2 p-3 border-t border-zinc-200/80 bg-white dark:border-white/10 dark:bg-[#0b0f19]"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your question about this screen…"
                disabled={chatLoading}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-amber-500 focus:bg-white focus:ring-1 focus:ring-amber-500 dark:border-white/15 dark:bg-[#141b2c] dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-amber-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                title="Send message"
                className="p-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 disabled:opacity-40 transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
