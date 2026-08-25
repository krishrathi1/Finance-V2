# Task 6-c — UI Agent C (Screener, Compare, IPO)

## Scope
Built the three discovery views for MyStockVision (Next.js 16 App Router, dark-first glassmorphic, orange brand):
- `src/components/screener/screener-view.tsx` → `ScreenerView()`
- `src/components/compare/compare-view.tsx` → `CompareView()`
- `src/components/ipo/ipo-view.tsx` → `IpoView()`

All are `"use client"` components using the shared infra (`@/lib/types`, `@/lib/api`, `@/lib/store` useApp/usePolling,
`@/components/shared/*`, shadcn/ui in `@/components/ui`). No files outside my scope were touched.

## Key decisions
- **Screener search param is `q`, not `search`** — the API route (`src/app/api/stocks/screener/route.ts`) reads
  `sp.get("q")`. The task brief said `?search=` but that would silently no-op; I used `q` and verified with curl.
- Polling pattern: filter state mirrored into a ref; a single `load(silent)` callback reads the ref so `usePolling`'s
  first-render closure never goes stale. The filter-change effect skips its first run because `usePolling` already
  fires the initial fetch. Stale responses discarded via request-id ref.
- Debounce: all 5 text/number inputs commit into a `debounced` object after 350ms; identity-preserving setter
  (`sameFilters`) avoids refetch loops. Sector/preset/sort changes are immediate.
- Sector list cached from the first successful screener fetch.
- Sorting is server-side (`sort`/`dir` params), client toggles dir; default `marketCapCr desc`; symbol/name default asc.
- Compare quick-pick score: `smartScore*2 + (5-riskScore)*1.5 + (roe - (pe??30)/10)/8` exactly per brief.
- Shareholding "latest" = `shareholding[shareholding.length - 1]` (financials.ts emits oldest → newest).
- IPO risk heuristic is client-side in-file per brief (mirrors the server's `getIpoRisk` rules); reasons joined with " · ".
- `react-hooks/set-state-in-effect` (Next 16 lint): IPO view keeps initial `loading=true` state and only sets state
  inside async callbacks / the tab-change event handler — no synchronous setState in effect bodies.
- Styling: bg-panel/60 cards, border-border/50, text-brand accents, tabular-nums on numbers, font-display headings,
  violet→fuchsia Smart bars, red→orange Risk bars, stagger-fade + framer-motion page fade, sticky table header,
  max-h-[70vh] scroll region (global custom scrollbar already styled in globals.css).

## Verification
- `bunx tsc --noEmit` → zero errors in my three files (pre-existing errors exist elsewhere: src/server/ai, examples, upload).
- `bun run lint` → zero issues in my three files.
- Curl-smoked all consumed endpoints: `/api/stocks/screener?q=…`, `/api/stocks/{SYMBOL}`, `/api/stocks/ipo?type=recent`,
  `POST /api/ai/analysis {type:"compare"}` — all return the shapes my views expect (`apiGet` unwraps `.data`).

## Integration notes
Views are not yet wired into `page.tsx` (deliberately untouched). Integrator should render, per `useApp().view`:
```tsx
import { ScreenerView } from "@/components/screener/screener-view";
import { CompareView } from "@/components/compare/compare-view";
import { IpoView } from "@/components/ipo/ipo-view";
// view === "screener" | "compare" | "ipo"  → render the matching component
```
Compare state comes from the store (`compareA`/`compareB`, `setCompare`); row clicks navigate via `openStock`.
