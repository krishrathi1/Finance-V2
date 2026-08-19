"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  RefreshCw,
  Zap,
  HelpCircle,
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

    // Check headers
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

    // Check bullets
    if (currentLine.trim().startsWith("- ")) {
      currentLine = currentLine.trim().substring(2);
      isBullet = true;
    }

    // Parse inline bold (**text**) and italic (*text*)
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
    const splitParts = currentLine.split(regex);

    splitParts.forEach((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        parts.push(<strong key={pIdx} className="font-bold text-fg">{part.slice(2, -2)}</strong>);
      } else if (part.startsWith("*") && part.endsWith("*")) {
        parts.push(<em key={pIdx} className="italic text-muted-fg">{part.slice(1, -1)}</em>);
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
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "copilot",
      text: "👋 Hi! I am **Forensic Copilot**, your institutional equity & forensic accounting AI.\n\nAsk me anything about Indian stocks, accounting manipulation checks (Beneish M-Score), solvency (Altman Z), option chain Greeks, or portfolio risk.",
      timestamp: "Just now",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

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

    try {
      // Determine context from URL if on a stock page
      const pathParts = window.location.pathname.split("/");
      const currentSymbol = pathParts[1] === "stocks" && pathParts[2] ? pathParts[2] : "NSE Market";

      const res = await fetch("/api/v1/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          context: { symbol: currentSymbol },
        }),
      });

      const json = await res.json();
      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        sender: "copilot",
        text: json.reply || "Analysis generated successfully.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          sender: "copilot",
          text: "⚠️ Sorry, could not process request right now. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-primary to-amber-500 text-primary-foreground font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all group"
          title="Open Forensic Copilot"
        >
          <div className="relative">
            <Bot className="h-5 w-5 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
          </div>
          <span className="font-[var(--font-space)] tracking-wide">Forensic Copilot</span>
        </button>
      )}

      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[440px] h-[580px] max-h-[85vh] rounded-3xl border border-border/80 bg-panel/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-secondary/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/15 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-fg">Forensic Copilot</h3>
                  <span className="px-2 py-0.5 text-[9px] uppercase font-bold rounded-full bg-emerald-500/20 text-emerald-300">
                    AI Active
                  </span>
                </div>
                <p className="text-[11px] text-muted">Institutional stock analysis &amp; red flag engine</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-secondary/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2 border-b border-border/40 bg-bg/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full border border-border/60 bg-secondary/50 hover:bg-primary/10 hover:border-primary/40 hover:text-primary text-[10px] text-muted-fg transition-all shrink-0"
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
                      ? "bg-primary text-primary-foreground font-medium rounded-br-none"
                      : "bg-secondary/60 text-fg border border-border/60 rounded-bl-none prose prose-invert prose-xs"
                  }`}
                >
                  {m.sender === "user" ? (
                    <p className="whitespace-pre-line">{m.text}</p>
                  ) : (
                    <div className="space-y-0.5">{formatMessageText(m.text)}</div>
                  )}
                </div>
                <span className="text-[9px] text-muted font-mono mt-1 px-1">{m.timestamp}</span>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-secondary/40 border border-border/40 w-fit text-xs text-muted">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Auditing financials &amp; computing metrics...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-border/60 bg-secondary/30 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about M-Score, fair value, FII flows..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-border/70 bg-bg/80 text-xs text-fg placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-110 active:scale-95 transition-all shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
