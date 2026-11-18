import { Loader2, Sparkles, TrendingUp } from "lucide-react";

export default function LoadingStockPage() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Floating Loading Banner */}
      <div className="flex items-center justify-between rounded-2xl border border-accent/25 bg-accent/5 p-3.5 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Loading Real-Time Stock Analytics...</p>
            <p className="text-xs text-muted">Retrieving market depth, quantitative scores, and AI models</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
            <Sparkles className="h-3 w-3" />
            <span>AI Ready</span>
          </span>
        </div>
      </div>

      {/* Hero Header Skeleton */}
      <div className="rounded-3xl border border-border/60 bg-panel/70 p-6 backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded-md bg-border/50" />
            <div className="h-8 w-64 animate-pulse rounded-xl bg-border/60" />
            <div className="h-4 w-48 animate-pulse rounded-md bg-border/40" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-28 animate-pulse rounded-full bg-border/50" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-border/50" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/40 bg-bg/40 p-3 space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-border/40" />
              <div className="h-6 w-24 animate-pulse rounded-lg bg-border/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: Sidebar + Tabs & Sections */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* Left Price & Summary Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-panel p-5 space-y-4">
            <div className="h-5 w-32 animate-pulse rounded-md bg-border/50" />
            <div className="h-10 w-44 animate-pulse rounded-xl bg-border/60" />
            <div className="space-y-2.5 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between py-1.5 border-b border-border/30">
                  <div className="h-3.5 w-20 animate-pulse rounded bg-border/40" />
                  <div className="h-3.5 w-16 animate-pulse rounded bg-border/50" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-panel p-5 space-y-3">
            <div className="h-5 w-28 animate-pulse rounded-md bg-border/50" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-border/40" />
          </div>
        </div>

        {/* Right Content Area */}
        <div className="space-y-4">
          {/* Navigation Tabs Skeleton */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-xl bg-panel" />
            ))}
          </div>

          {/* Interactive Chart Skeleton */}
          <div className="rounded-2xl border border-border/60 bg-panel p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-5 w-40 animate-pulse rounded-md bg-border/50" />
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-7 w-12 animate-pulse rounded-lg bg-border/40" />
                ))}
              </div>
            </div>
            <div className="h-72 w-full animate-pulse rounded-xl bg-bg/50" />
          </div>

          {/* AI Score & Research Cards Skeleton */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-panel p-5 space-y-3">
              <div className="h-5 w-32 animate-pulse rounded-md bg-border/50" />
              <div className="h-16 w-full animate-pulse rounded-xl bg-border/40" />
            </div>
            <div className="rounded-2xl border border-border/60 bg-panel p-5 space-y-3">
              <div className="h-5 w-32 animate-pulse rounded-md bg-border/50" />
              <div className="h-16 w-full animate-pulse rounded-xl bg-border/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
