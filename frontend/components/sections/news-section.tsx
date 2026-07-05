"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, ExternalLink, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { analyzeNewsItem } from "@/lib/api";
import type { NewsItem } from "@/lib/types";

type AnalysisState = {
  title: string;
  overview: string;
  marketImpact: string;
  watchpoint: string;
  source: "gemini" | "fallback";
};

export function NewsSection({ symbol, news }: { symbol: string; news: NewsItem[] }) {
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [loading, setLoading] = useState(false);
  const analyzeRequestId = useRef(0);

  async function handleAnalyze(item: NewsItem) {
    const requestId = ++analyzeRequestId.current;
    setSelectedTitle(item.title);
    setLoading(true);
    setAnalysis(null);

    const response = await analyzeNewsItem(symbol, item);
    // Ignore this response if a different article was analyzed afterward —
    // otherwise a slow response for article A can overwrite the panel for
    // article B, which resolved faster and is what's currently shown.
    if (requestId !== analyzeRequestId.current) return;
    setAnalysis({
      title: item.title,
      overview: response.overview,
      marketImpact: response.marketImpact,
      watchpoint: response.watchpoint,
      source: response.source
    });
    setLoading(false);
  }

  function closeAnalysis() {
    setSelectedTitle(null);
    setAnalysis(null);
    setLoading(false);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Company News & Sentiment</h3>
          <p className="mt-1 text-sm text-muted">Tap Analyze on any article for a quick AI summary in stock context.</p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {news.length ? (
          news.map((item, index) => (
            <div key={index} className="space-y-3">
              <div className="rounded-xl border border-border/70 p-3 transition hover:border-accent/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-text">{item.title}</p>
                  <Badge
                    variant="outline"
                    className={`px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${
                      item.sentimentScore >= 0.55
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-danger/30 bg-danger/10 text-danger"
                    }`}
                  >
                    Sentiment {(item.sentimentScore * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {item.source} | {item.publishedAt}
                </p>
                <p className="mt-2 text-sm text-muted">{item.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleAnalyze(item)}
                    disabled={loading && selectedTitle === item.title}
                    className="bg-panel/80 backdrop-blur"
                  >
                    {loading && selectedTitle === item.title ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Brain className="mr-2 h-4 w-4" />
                    )}
                    Analyze
                  </Button>
                  <Link
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-semibold text-text transition hover:bg-panel/80"
                  >
                    Read article
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </div>

              <AnimatePresence>
                {selectedTitle === item.title ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="glass rounded-[24px] border border-border/60 bg-panel/75 p-4 shadow-[0_22px_55px_rgba(10,16,28,0.16)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">News Analysis</p>
                        <h4 className="mt-2 text-base font-semibold text-text">{selectedTitle}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={closeAnalysis}
                        aria-label="Close analysis"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-bg/50 text-muted hover:text-text"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {loading ? (
                      <div className="mt-4 rounded-2xl border border-border/50 bg-bg/35 p-4 text-sm text-muted">
                        <div className="flex items-center gap-2 text-text">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Preparing AI summary...
                        </div>
                      </div>
                    ) : analysis ? (
                      <>
                        <div className="mt-4 grid gap-3">
                          <div className="rounded-2xl border border-border/50 bg-bg/35 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What Happened</p>
                            <p className="mt-2 text-sm leading-6 text-text">{analysis.overview}</p>
                          </div>
                          <div className="rounded-2xl border border-border/50 bg-bg/35 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Possible Impact</p>
                            <p className="mt-2 text-sm leading-6 text-text">{analysis.marketImpact}</p>
                          </div>
                          <div className="rounded-2xl border border-border/50 bg-bg/35 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What To Watch</p>
                            <p className="mt-2 text-sm leading-6 text-text">{analysis.watchpoint}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                          AI Source: {analysis.source === "gemini" ? "Gemini" : "Fallback"}
                        </p>
                      </>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted">No company news available right now.</div>
        )}
      </div>
    </Card>
  );
}
