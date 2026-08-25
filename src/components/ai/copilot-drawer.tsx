"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownLite } from "@/components/shared/section-heading";
import { apiPost } from "@/lib/api";
import { useApp } from "@/lib/store";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "msv-copilot-history";
const MAX_MESSAGES = 20;
const HISTORY_WINDOW = 10;

const QUICK_PROMPTS = [
  "Audit accounting flags & M-Score",
  "3-point bull vs bear case",
  "How's market breadth today?",
  "Explain the Smart Score",
];

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMessage =>
          typeof m === "object" &&
          m !== null &&
          ((m as { role?: unknown }).role === "user" ||
            (m as { role?: unknown }).role === "assistant") &&
          typeof (m as { content?: unknown }).content === "string"
      )
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function CopilotDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const stockSymbol = useApp((s) => s.stockSymbol);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate conversation from localStorage (client only).
  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  // Persist conversation on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      // storage unavailable / full — ignore
    }
  }, [messages]);

  // Focus the composer when the drawer opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, open]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;
      const userMsg: ChatMessage = { role: "user", content: text };
      const next: ChatMessage[] = [...messages, userMsg].slice(-MAX_MESSAGES);
      setMessages(next);
      setInput("");
      setLoading(true);
      try {
        const res = await apiPost<{ answer: string; source: "ai" | "fallback" }>("/api/ai/copilot", {
          history: next.slice(-HISTORY_WINDOW),
          symbol: stockSymbol ?? undefined,
        });
        const reply: ChatMessage = { role: "assistant", content: res.answer };
        setMessages((prev) => [...prev, reply].slice(-MAX_MESSAGES));
      } catch {
        const apology: ChatMessage = {
          role: "assistant",
          content:
            "I couldn't reach the analysis engine just now. Please try again in a moment — your conversation stays right here.",
        };
        setMessages((prev) => [...prev, apology]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, stockSymbol]
  );

  const clearChat = () => setMessages([]);

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI Copilot"
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-amber-400 text-white shadow-xl shadow-brand/30 transition hover:scale-105 active:scale-95"
        >
          <Bot className="h-5 w-5" aria-hidden="true" />
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
            <span className="pulse-dot h-3 w-3 rounded-full bg-success" aria-hidden="true" />
          </span>
        </button>
      )}

      {/* Chat drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Forensic Copilot chat"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="fixed bottom-5 right-5 z-50 flex h-[min(600px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-border/60 bg-panel/95 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/50 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-amber-400 text-white">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-text">Forensic Copilot</p>
                <p className="text-[10px] text-muted-foreground">Institutional-grade NSE/BSE analysis</p>
              </div>
              {stockSymbol && (
                <span
                  className="shrink-0 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand"
                  title="Copilot is answering with this stock's live context"
                >
                  ON {stockSymbol}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger"
                onClick={clearChat}
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-text"
                onClick={() => setOpen(false)}
                aria-label="Close copilot"
                title="Close copilot"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Messages */}
            <div
              className="flex-1 space-y-3 overflow-y-auto p-4"
              role="log"
              aria-label="Copilot conversation"
              aria-live="polite"
            >
              {messages.length === 0 && !loading ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-amber-400 text-white shadow-lg shadow-brand/20">
                    <Bot className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-display font-bold text-text">Ask me anything about Indian equities</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      I have live context on the stock you&apos;re viewing.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => send(prompt)}
                        className="rounded-full border border-border/60 bg-panel/60 px-3 py-1.5 text-xs text-text/85 transition hover:border-brand/50 hover:bg-brand/10 hover:text-brand"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) =>
                  m.role === "assistant" ? (
                    <div
                      key={i}
                      className="max-w-[85%] rounded-2xl rounded-tl-md border border-border/50 bg-bg/60 px-3.5 py-2.5"
                    >
                      <MarkdownLite text={m.content} className="text-sm" />
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md border border-brand/25 bg-brand/15 px-3.5 py-2.5 text-sm text-text"
                    >
                      {m.content}
                    </div>
                  )
                )
              )}

              {loading && (
                <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-border/50 bg-bg/60 px-3.5 py-2.5">
                  <span className="sr-only">Copilot is thinking…</span>
                  <div className="flex items-center gap-1.5 py-1" aria-hidden="true">
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input row */}
            <form
              className="flex gap-2 border-t border-border/50 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the Forensic Copilot…"
                aria-label="Message the Forensic Copilot"
                className="flex-1 rounded-xl border-border/60 bg-bg/60 text-sm"
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="h-9 w-9 shrink-0 rounded-xl bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
