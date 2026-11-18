"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Mic,
  X,
  AlertCircle,
  Send,
  Sparkles,
  Keyboard,
  RotateCcw,
  TrendingUp,
  ShieldCheck,
  MessageSquareText,
  HelpCircle,
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
      text: "Namaste! I'm your MyStockVision Research Co-Pilot. I evaluate company financials, valuation ratios, and forensic scores in simple, plain terms. Ask me anything about this stock or the market!",
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

            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }

            // Auto-submit after 850ms of silence once speech is detected (no Done button required)
            if (clean.length > 2) {
              silenceTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                  mediaRecorderRef.current.stop();
                }
              }, 850);
            }
          }
        };

        recognition.onspeechend = () => {
          if (currentUtteranceRef.current && currentUtteranceRef.current.length > 2) {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }
            silenceTimerRef.current = setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop();
              }
            }, 500);
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
    setVoiceStatusMessage("Thinking…");

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
          mode: "voice",
          audioData: base64Audio,
          mimeType,
          history: voiceHistoryRef.current.slice(-6),
          screenSnapshot,
        }),
      });

      if (isMutedRef.current) return;

      const contentType = res.headers.get("content-type") || "";
      let data: VoiceTalkResponse;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        if (res.status === 504) {
          throw new Error("Server response timed out (504). Please try speaking again.");
        } else if (res.status === 404) {
          throw new Error("Endpoint /api/v1/voice/talk not found (404). Check Vercel root directory.");
        } else {
          throw new Error(`Server returned error (${res.status}). Verify GROQ_API_KEY in Vercel settings.`);
        }
      }

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
          setVoiceStatusMessage("Listening…");
          setVoiceState("listening");
          startListening();
          return;
        }

        setVoiceState("thinking");
        setVoiceStatusMessage("Thinking…");
        sendVoiceUtteranceToBackend(audioBlob, spokenText);
      };

      recorder.start(250);
      setVoiceState("listening");

      // Auto-detect speech and silence completion via AudioContext VAD
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          let userSpoke = false;
          let silenceStart = 0;

          const checkVAD = () => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
              try { audioCtx.close(); } catch {}
              return;
            }

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const avg = sum / bufferLength;

            if (avg > 15) {
              userSpoke = true;
              silenceStart = 0;
            } else if (userSpoke) {
              if (!silenceStart) {
                silenceStart = Date.now();
              } else if (Date.now() - silenceStart > 1000) {
                // User spoke and then paused for 1000ms -> automatic query completion
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                  mediaRecorderRef.current.stop();
                }
                try { audioCtx.close(); } catch {}
                return;
              }
            }

            requestAnimationFrame(checkVAD);
          };

          requestAnimationFrame(checkVAD);
        }
      } catch {}

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
          mode: "chat",
          history: chatHistoryRef.current.slice(-6),
          screenSnapshot,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      let data: VoiceTalkResponse;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        if (res.status === 504) {
          throw new Error("Server response timed out (504). Please try your question again.");
        } else if (res.status === 404) {
          throw new Error("API route not found (404). Check Vercel root directory setting.");
        } else {
          throw new Error(`Server returned error (${res.status}). Verify GROQ_API_KEY in Vercel settings.`);
        }
      }

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
        {/* ── 1. Collapsed State: Sleek Floating Dock with Voice & Chat (Light & Dark Theme Synced) ── */}
        {mode === "idle" && (
          <motion.div
            key="btn-group"
            layout
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="flex items-center gap-1 rounded-full bg-white text-zinc-900 border border-zinc-200/90 shadow-xl shadow-zinc-900/10 dark:bg-[#0f141f] dark:text-zinc-100 dark:border-zinc-800 dark:shadow-zinc-950/40 p-1 backdrop-blur-xl transition-colors duration-200"
          >
            {/* Voice / Speak Button */}
            <button
              onClick={handleStartVoice}
              aria-label="Speak using microphone"
              title="Speak your question using microphone"
              className="flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800/80 text-xs font-medium transition-colors cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Voice</span>
            </button>

            <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800" />

            {/* Type / Chat Button */}
            <button
              onClick={handleStartChat}
              aria-label="Open text chat"
              title="Open financial research chatbot"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
          </motion.div>
        )}

        {/* ── 2. Voice Mode: PURE Voice Assistant UI (No text input, No prompt list) ── */}
        {mode === "voice" && (
          <motion.div
            key="voice-pill"
            layout
            initial={{ scale: 0.7, opacity: 0, originX: 1, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="flex flex-col gap-2 rounded-2xl bg-white/95 text-zinc-900 border border-zinc-200/90 shadow-2xl shadow-zinc-950/15 dark:bg-[#0c1017] dark:border-zinc-800 dark:shadow-black/60 dark:text-white p-3 backdrop-blur-2xl w-72 sm:w-80"
          >
            {/* Top Bar with Status and Instant Stop/Cross Button */}
            <div className="flex items-center gap-2.5">
              {voiceState === "requesting_permission" ? (
                <>
                  <span className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Connecting mic…
                  </span>
                </>
              ) : voiceState === "processing" || voiceState === "thinking" ? (
                <>
                  <span className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {voiceStatusMessage || "Thinking…"}
                  </span>
                </>
              ) : voiceState === "speaking" ? (
                <>
                  {/* Speaking Equalizer */}
                  <span className="relative flex items-center justify-center">
                    <motion.span
                      className="absolute w-7 h-7 rounded-full bg-emerald-500/20"
                      animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="relative w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  </span>
                  <div className="flex items-end gap-[3px] h-5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.span
                        key={i}
                        className="w-[3px] rounded-full bg-emerald-500 dark:bg-emerald-400"
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
                    Co-Pilot speaking…
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
                </>
              )}

              {/* Instant Cut-off Stop / Cross Button */}
              <button
                type="button"
                onClick={handleCloseVoice}
                aria-label="Stop and exit voice mode"
                title="Exit voice mode"
                className="ml-auto w-7 h-7 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-90 border border-zinc-200 dark:border-zinc-700"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── 3. Chat Mode: INSTITUTIONAL RESEARCH CO-PILOT UI ── */}
        {mode === "chat" && (
          <motion.div
            key="chat-window"
            layout
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 26 }}
            className="flex flex-col rounded-2xl bg-white text-zinc-900 border border-zinc-200 shadow-2xl shadow-zinc-950/15 dark:bg-[#0c1017] dark:text-zinc-100 dark:border-zinc-800 dark:shadow-black/70 backdrop-blur-2xl w-[92vw] sm:w-[470px] md:w-[520px] h-[550px] max-h-[85vh] overflow-hidden"
          >
            {/* Chatbot Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-[#0f141f]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white tracking-tight">
                      MyStockVision Co-Pilot
                    </h4>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[9px] font-semibold rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Live Verified
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                    Institutional NSE & BSE Research
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Reset conversation"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCloseChat}
                  title="Close co-pilot"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Message Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-zinc-50/50 dark:bg-[#0c1017]">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[88%] sm:max-w-[94%] text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-zinc-900 text-white dark:bg-emerald-600 dark:text-white rounded-2xl rounded-tr-xs px-4 py-2.5 font-medium shadow-xs whitespace-pre-wrap"
                        : "bg-white text-zinc-900 border border-zinc-200/90 shadow-2xs dark:bg-[#111622] dark:text-zinc-100 dark:border-zinc-800 rounded-2xl rounded-tl-xs px-4 py-3"
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
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mr-2 flex-shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <div className="bg-white border border-zinc-200/90 shadow-2xs dark:bg-[#111622] dark:border-zinc-800 rounded-2xl rounded-tl-xs px-3.5 py-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium ml-1">Evaluating screen metrics & filings…</span>
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

            {/* Quick Context Prompt Chips (Beginner-Friendly & Genuine) */}
            <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none border-t border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-800 dark:bg-[#0f141f] text-[10px]">
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("Give a simple beginner-friendly verdict on this stock: Is it safe and fundamentally sound?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/90 shadow-2xs dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700 transition-all font-medium disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" /> Simple Verdict
              </button>
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("Explain the P/E ratio and valuation of this stock in simple plain words for a beginner.")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/90 shadow-2xs dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700 transition-all font-medium disabled:opacity-50 cursor-pointer"
              >
                💰 P/E in Plain Words
              </button>
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("Explain the Smart Score of this stock and what it means in simple terms.")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/90 shadow-2xs dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700 transition-all font-medium disabled:opacity-50 cursor-pointer"
              >
                ⭐ Smart Score Rationale
              </button>
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage("What are the biggest risks or red flags in this company that a beginner should know?")}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/90 shadow-2xs dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:border-zinc-700 transition-all font-medium disabled:opacity-50 cursor-pointer"
              >
                ⚠️ Top Risks for Beginners
              </button>
            </div>

            {/* Type Question Input Bar */}
            <form
              onSubmit={handleChatFormSubmit}
              className="flex items-center gap-2 p-2.5 border-t border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-[#0c1017]"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about this stock in plain words (e.g. Is this safe for a beginner?)..."
                disabled={chatLoading}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-[#121722] dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                title="Send message"
                className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Trust & Transparency Footer */}
            <div className="px-3 pb-2 pt-0.5 text-[9.5px] text-zinc-400 dark:text-zinc-500 text-center flex items-center justify-center gap-1 bg-white dark:bg-[#0c1017]">
              <ShieldCheck className="w-3 h-3 text-emerald-500/80" />
              <span>Grounded in live NSE/BSE filings. Educational research only.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
