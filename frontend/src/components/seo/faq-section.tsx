"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type FaqItem = {
  question: string;
  answer: string;
};

export function FaqSection({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string;
  items: FaqItem[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIndex((current) => (current === idx ? null : idx));
  };

  return (
    <section className="rounded-[28px] border border-border/45 bg-panel/40 p-5 backdrop-blur-sm sm:p-8">
      <div className="max-w-3xl">
        <h2 className="font-[var(--font-space)] text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {intro ? (
          <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{intro}</p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        {items.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <article
              key={item.question}
              className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                isOpen
                  ? "border-accent/50 bg-panel/85 shadow-sm"
                  : "border-border/40 bg-bg/45 hover:border-border/80 hover:bg-bg/60"
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(idx)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 p-4 text-left transition"
              >
                <h3 className={`text-base font-semibold transition-colors ${isOpen ? "text-accent" : "text-text"}`}>
                  {item.question}
                </h3>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${
                    isOpen ? "rotate-180 text-accent" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <div className="border-t border-border/30 px-4 pb-4 pt-3">
                      <p className="text-sm leading-7 text-muted">{item.answer}</p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </article>
          );
        })}
      </div>
    </section>
  );
}
