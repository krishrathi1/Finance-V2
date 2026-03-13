"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, X } from "lucide-react";
import { useState } from "react";

import { sendAiQuestion } from "@/lib/api";

type ChatMessage = { role: "user" | "ai"; text: string; source?: "gemini" | "fallback" };

export function AIChat({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "ai", text: `Ask me anything about ${symbol} fundamentals, risk, statements, or valuation.` }
  ]);

  async function submit() {
    if (!input.trim()) return;
    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    const response = await sendAiQuestion(symbol, question);
    setMessages((prev) => [...prev, { role: "ai", text: response.answer, source: response.source }]);
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className="fixed bottom-24 right-5 z-50 flex h-[540px] w-[360px] flex-col rounded-2xl border border-border bg-panel p-3 shadow-2xl"
          >
            <div className="border-b border-border pb-2">
              <p className="font-semibold">Financial Forensics AI</p>
              <p className="text-xs text-muted">Gemini-powered market assistant</p>
            </div>
            <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "ml-8 bg-accent text-white" : "mr-8 bg-bg text-text"}`}
                >
                  {message.text}
                  {message.role === "ai" && message.source ? (
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">
                      AI Source: {message.source === "gemini" ? "Gemini" : "Fallback"}
                    </p>
                  ) : null}
                </div>
              ))}
              {loading && <div className="mr-8 rounded-xl bg-bg px-3 py-2 text-sm text-muted">Analyzing...</div>}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-bg px-2 py-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submit()}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Ask about valuation, risk, or statements"
              />
              <button onClick={submit} className="rounded-lg bg-accent p-2 text-white">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
