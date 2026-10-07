"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Send,
  X,
  RefreshCw,
  Zap,
  HelpCircle,
  Radio,
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
}

const QUICK_PROMPTS = [
  "Audit accounting flags & M-Score",
  "Give 3-point bull vs bear case",
  "Explain option chain PCR & Max Pain",
  "How are FII/DII flows trending?",
];

function formatMessageText(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    let currentLine = line;
    let isHeader = false;
    let isBullet = false;

    if (currentLine.startsWith("### ")) {
      currentLine = currentLine.substring(4);
      isHeader = true;
    } else if (currentLine.startsWith("## ")) {
      currentLine = currentLine.substring(3);
      isHeader = true;
    } else if (currentLine.startsWith("# ")) {
      currentLine = currentLine.substring(2);
      isHeader = true;
    }

    if (currentLine.trim().startsWith("- ")) {
      currentLine = currentLine.trim().substring(2);
      isBullet = true;
    }

    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
    const splitParts = currentLine.split(regex);

    splitParts.forEach((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        parts.push(
          <strong key={pIdx} className="font-bold text-fg">
            {part.slice(2, -2)}
          </strong>
        );
      } else if (part.startsWith("*") && part.endsWith("*")) {
        parts.push(
          <em key={pIdx} className="italic text-muted-fg">
            {part.slice(1, -1)}
          </em>
        );
      } else {
        parts.push(part);
      }
    });

    if (isHeader) {
      return (
        <h4 key={idx} className="text-xs font-bold mt-2.5 mb-1 text-primary">
          {parts}
        </h4>
      );
    }

    if (isBullet) {
      return (
        <div key={idx} className="flex items-start gap-1.5 ml-1.5 my-0.5">
          <span className="text-primary mt-1 shrink-0 text-[10px]">•</span>
          <span>{parts}</span>
        </div>
      );
    }

    return (
      <p key={idx} className={line.trim() === "" ? "h-1.5" : "my-0.5"}>
        {parts}
      </p>
    );
  });
}

export function AiCopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [isSpeakingEnabled, setIsSpeakingEnabled] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "copilot",
      text: "👋 Hi! I am **Forensic Copilot**, your institutional equity & forensic accounting AI.\n\nAsk me anything by typing or speaking about Indian stocks, Beneish M-Score manipulation checks, solvency (Altman Z), option chain Greeks, or corporate red flags.",
      timestamp: "Just now",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  // Read aloud helper (Text-to-speech)
  const speakText = useCallback((textToSpeak: string) => {
    if (!isSpeakingEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      // Strip markdown syntax for clean spoken audio
      const clean = textToSpeak
        .replace(/#+\s/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/`.*?`/g, "")
        .replace(/- /g, "");
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      setVoiceStatus("speaking");
      utterance.onend = () => {
        setVoiceStatus("idle");
      };
      utterance.onerror = () => {
        setVoiceStatus("idle");
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      setVoiceStatus("idle");
    }
  }, [isSpeakingEnabled]);

  // Speech-to-text initialization
  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceStatus("listening");
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
          setIsListening(false);
          setVoiceStatus("thinking");
          // Auto send spoken query
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setVoiceStatus("idle");
      };

      recognition.onend = () => {
        setIsListening(false);
        if (voiceStatus === "listening") {
          setVoiceStatus("idle");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceStatus("idle");
    }
  }, [voiceStatus]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsVoiceActive(false);
    setVoiceStatus("idle");
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);
    setVoiceStatus("thinking");

    try {
      const pathParts = window.location.pathname.split("/");
      const currentSymbol = pathParts[1] === "stocks" && pathParts[2] ? pathParts[2] : "NSE/BSE Indian Market";
      const searchParams = new URLSearchParams(window.location.search);
      const exchange = searchParams.get("exchange") || "NSE";

      const res = await fetch("/api/v1/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          context: { symbol: currentSymbol, exchange },
        }),
      });

      const json = await res.json();
      const replyText = json.reply || "Analysis generated successfully.";
      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        sender: "copilot",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);

      // If user invoked via voice or voice is active, speak the answer
      if (isVoiceActive || isListening) {
        speakText(replyText);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          sender: "copilot",
          text: "⚠️ Sorry, could not process request right now. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setVoiceStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceCallStart = () => {
    setIsVoiceActive(true);
    startSpeechRecognition();
  };

  return (
    <>
      {/* ── Collapsed & Voice Pills ── */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2">
          {/* Active Voice Pill (Morphs when voice is triggered) */}
          {isVoiceActive ? (
            <div className="flex items-center gap-3 rounded-full bg-panel border border-[#C57708]/30 shadow-2xl shadow-[#C57708]/20 pl-3.5 pr-2 py-2 text-fg animate-in zoom-in-95 duration-200">
              <span className="relative flex items-center justify-center">
                <span className="absolute w-8 h-8 rounded-full bg-[#C57708]/20 animate-ping" />
                <span className="relative w-7 h-7 rounded-full bg-[#C57708]/15 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-[#C57708]" />
                </span>
              </span>

              {/* Live Equalizer Animation */}
              <div className="flex items-end gap-[3px] h-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-[#C57708] animate-pulse"
                    style={{
                      height: isListening ? `${8 + (i % 3) * 6}px` : "6px",
                      animationDuration: `${0.6 + i * 0.15}s`,
                    }}
                  />
                ))}
              </div>

              <span className="text-xs font-semibold text-text pr-1">
                {voiceStatus === "listening"
                  ? "Listening…"
                  : voiceStatus === "thinking"
                  ? "Thinking…"
                  : voiceStatus === "speaking"
                  ? "Speaking…"
                  : "Connecting…"}
              </span>

              {/* Open Full Chat */}
              <button
                onClick={() => {
                  stopSpeechRecognition();
                  setIsOpen(true);
                }}
                className="text-[11px] font-bold text-[#C57708] hover:underline px-1.5"
                title="Open Chat"
              >
                Chat
              </button>

              {/* End Call / Stop */}
              <button
                onClick={stopSpeechRecognition}
                aria-label="End"
                className="w-7 h-7 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* ── Default "Need help?" Pill (Matches user reference exactly) ── */
            <button
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-2.5 rounded-full bg-[#C57708] hover:bg-[#A85F00] text-white pl-4 pr-5 py-3 shadow-xl shadow-[#C57708]/25 transition-all hover:scale-105 active:scale-95 group select-none cursor-pointer"
              aria-label="Open AI Assistant"
            >
              {/* Message Bubble with pulsing green status dot */}
              <div className="relative flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white stroke-[2.2]" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25AB21] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#25AB21] ring-2 ring-[#C57708]" />
                </span>
              </div>

              <span className="text-sm font-bold tracking-tight text-white">
                Need help?
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── Floating Chat Drawer ── */}
      {isOpen && (
        <div className="fixed bottom-5 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[440px] h-[600px] max-h-[85vh] rounded-3xl border border-border/80 bg-panel/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-secondary/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#C57708]/15 text-[#C57708]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-fg">Forensic Copilot</h3>
                  <span className="px-2 py-0.5 text-[9px] uppercase font-bold rounded-full bg-emerald-500/20 text-emerald-400">
                    Live AI
                  </span>
                </div>
                <p className="text-[11px] text-muted">Institutional stock analysis &amp; red flag engine</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Audio Read Aloud Toggle */}
              <button
                onClick={() => {
                  const next = !isSpeakingEnabled;
                  setIsSpeakingEnabled(next);
                  if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isSpeakingEnabled ? "text-[#C57708] bg-[#C57708]/10" : "text-muted hover:text-fg"
                }`}
                title={isSpeakingEnabled ? "Voice readout enabled" : "Voice readout muted"}
              >
                {isSpeakingEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>

              <button
                onClick={() => {
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                  setIsOpen(false);
                }}
                className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-secondary/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2 border-b border-border/40 bg-bg/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full border border-border/60 bg-secondary/50 hover:bg-[#C57708]/15 hover:border-[#C57708]/40 hover:text-[#C57708] text-[10px] text-muted-fg transition-all shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    m.sender === "user"
                      ? "bg-[#C57708] text-white font-medium rounded-br-none"
                      : "bg-secondary/60 text-fg border border-border/60 rounded-bl-none prose prose-invert prose-xs"
                  }`}
                >
                  {m.sender === "user" ? (
                    <p className="whitespace-pre-line">{m.text}</p>
                  ) : (
                    <div className="space-y-0.5">{formatMessageText(m.text)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[9px] text-muted font-mono">{m.timestamp}</span>
                  {m.sender === "copilot" && m.id !== "welcome" && (
                    <button
                      onClick={() => speakText(m.text)}
                      className="text-muted hover:text-[#C57708] text-[10px] flex items-center gap-1"
                      title="Read aloud"
                    >
                      <Volume2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-secondary/40 border border-border/40 w-fit text-xs text-muted">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#C57708]" />
                <span>Auditing financials &amp; computing metrics...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer with Speech Mic & Send Button */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-border/60 bg-secondary/30 flex items-center gap-2"
          >
            {/* Mic Speech Button */}
            <button
              type="button"
              onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
              className={`p-2.5 rounded-xl transition-all shrink-0 ${
                isListening
                  ? "bg-rose-500 text-white animate-pulse"
                  : "bg-secondary/70 text-fg hover:bg-[#C57708]/20 hover:text-[#C57708]"
              }`}
              title={isListening ? "Listening... click to stop" : "Speak question"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening to your voice..." : "Ask about M-Score, fair value, BSE/NSE..."}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border/70 bg-bg/80 text-xs text-fg placeholder:text-muted focus:outline-none focus:border-[#C57708] transition-colors"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2.5 rounded-xl bg-[#C57708] text-white disabled:opacity-40 hover:bg-[#A85F00] active:scale-95 transition-all shrink-0"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
