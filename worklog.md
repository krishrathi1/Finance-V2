# MyStockVision V3 — Rebuild Worklog

Project: Improved rebuild of the uploaded Finance-V2 (MyStockVision) app as a Next.js 16 single-page
application at `/`. Same feature set and design language (dark-first glassmorphism, orange accent,
NSE/BSE focus), improved: reliable deterministic market engine (original relied on NSE/Yahoo
scraping which is blocked/unreliable), working AI via z-ai-web-dev-sdk, Prisma/SQLite persistence
for watchlist/portfolio/alerts, unified single-page UX with view switching.

Source reference: /home/z/my-project/upload/extracted/Finance-V2-main

---
Task ID: 1
Agent: lead (main)
Task: Foundation — prisma schema, design system, layout

Work Log:
- Explored original codebase (see Explore agent report in conversation): features, API shapes, design tokens, scoring formulas.
- Confirmed external market APIs (NSE/Yahoo) blocked → build deterministic market engine.
- Prisma schema: WatchlistItem, Holding, PriceAlert models.
- globals.css: ported original design tokens (bg/panel/border/text/muted/accent/success/danger HSL vars, dark-first) into Tailwind 4 @theme, glassmorphism utilities, hero orbs, ticker, shimmer, etc.
- layout.tsx: Space Grotesk + Inter fonts, ThemeProvider (next-themes, default dark), metadata.

Stage Summary:
- Design system + DB schema ready for all subsequent agents.

---
Task ID: 2-5 (engine, analytics, api, ai)
Agent: lead (main)
Task: Market engine, analytics, all API routes, AI layer

Work Log:
- src/server/market/rng.ts — seeded RNG (mulberry32, gaussian, norm/invNorm/median), IST helpers, market-hours logic.
- src/server/market/universe.ts — 173 curated NSE stocks with fundamentals (sector/industry/price/mcap/PE/PB/ROE/ROCE/D-E/holdings/divyield/growth/vol/drift, n50 flags).
- src/server/market/engine.ts — deterministic daily OHLCV series (5Y, mean-reverting GBM + common market factor), live intraday quotes (15s buckets while market open), ticker, chart slices, cap-weighted indices anchored to realistic levels (NIFTY 24500, SENSEX 81500...).
- src/server/market/news.ts — deterministic macro + company headline generator w/ sentiment.
- src/server/market/ipo.ts — upcoming + recent IPO list with GMP/subscription/listing gain + risk profiling.
- src/server/market/overview.ts — market overview payload (indices, breadth, mood 0.65*breadth+0.35*momentum, movers, heatmap).
- src/server/analytics/technicals.ts — RSI14, MACD(12,26,9), EMA20/50, SMA200, vol, drawdown, returns, pivots.
- src/server/analytics/scoring.ts — Smart Score (5 dims, factor-v3 port) + Risk Score (4 comps, risk-v2 port).
- src/server/analytics/forensics.ts — Beneish M-Score (8 components, real formula), Altman Z, Piotroski F, governance flags, overall health.
- src/server/analytics/financials.ts — yearly/quarterly statements + shareholding trend (deterministic).
- src/server/analytics/dashboard.ts — full stock dashboard assembler + screener rows.
- src/server/ai/index.ts — copilot, research report, SWOT, compare, portfolio-risk, watchlist digest via z-ai-web-dev-sdk with deterministic fallbacks. VERIFIED WORKING (AI answered with live RELIANCE context).
- API routes (all verified): /api/market/overview|ticker|news|heatmap, /api/stocks/search, /api/stocks/[symbol], /api/stocks/chart|screener|ipo, /api/ai/copilot, /api/ai/analysis, /api/watchlist (GET/POST/DELETE), /api/portfolio (GET/POST/PUT/DELETE), /api/alerts (GET evaluates armed alerts server-side/POST/DELETE).
- Client infra: src/lib/types.ts (all payload types + fmt helpers), src/lib/api.ts (fetch wrapper), src/lib/store.ts (zustand: view routing, watchlist/holdings/alerts w/ API sync + localStorage cache, usePolling hook).

Stage Summary — DESIGN CONTRACT FOR UI AGENTS:
- Tailwind color classes: bg-bg, bg-panel/60, border-border/50, text-text, text-muted-foreground (gray text), text-brand/bg-brand/border-brand (ORANGE accent #f59e0b-ish), text-success, text-danger, text-warn.
- Headings font: font-display (Space Grotesk). Body: default sans (Inter). tabular-nums already on body.
- Utility classes available: .glass, .glass-premium, .gradient-border, .glow-card, .feature-card, .feature-card-icon, .shine-btn, .shimmer, .pulse-dot, .hero-orb(-1/2/3), .stat-card, .mood-gauge-bg, .news-grid-stagger, .ticker-shell/.ticker-track, .nav-active, .stagger-fade, .header-enter, .search-bar.
- Views (zustand useApp): setView('home'|'stock'|'screener'|'watchlist'|'portfolio'|'compare'|'ipo'|'alerts'), openStock(symbol), setCompare(a,b).
- Polling: usePolling(fn, ms) — use 20s for ticker/watchlist, 30s for overview, 120s for news.
- Components dir: src/components/ (shadcn/ui exists in src/components/ui — use them).

---
Task ID: 6-e
Agent: UI Agent E (AI copilot + panels)
Task: AI experience — floating Forensic Copilot drawer + stock-page AI Research Desk (report + SWOT)

Work Log:
- src/components/ai/copilot-drawer.tsx — CopilotDrawer(): always-mountable floating AI chat. Orange gradient FAB (fixed bottom-5 right-5, Bot icon, pulse-dot ping) hides while the AnimatePresence drawer (bottom-5 right-5, w-[min(400px,calc(100vw-2.5rem))] h-[min(600px,calc(100vh-7rem))], 0.22s scale/slide) is open. Header w/ gradient Bot tile, "ON {symbol}" context chip driven by useApp().stockSymbol, clear-chat (Trash2) + close (X). Messages: assistant bubbles (MarkdownLite) vs user bubbles (brand tint), 3-dot bouncing loader, empty state w/ 4 quick-prompt chips. Composer: Input + brand send button (Loader2 spin while loading). Sends POST /api/ai/copilot { history: last 10 incl. new msg, symbol }, friendly error bubble on failure. Conversation persisted to localStorage "msv-copilot-history" (max 20, SSR-guarded, validated on read), smooth auto-scroll via bottom sentinel.
- src/components/ai/stock-ai-panel.tsx — StockAiPanel({ symbol }): SectionHeading (Sparkles, "AI Research Desk") w/ AiSourceBadge (last-loaded source) + Regenerate ghost button (RefreshCw, spins while loading). Controlled shadcn Tabs: "Research Report" (markdown in rounded-2xl panel card) | "SWOT Analysis" (2x2 quadrant grid: Strengths +, Weaknesses −, Opportunities/Threats dots; Bull/Bear case cards w/ Quote icons). Per-symbol caching via ref-mirrored state (strict-mode/double-invoke safe); report fetched on mount/symbol change, SWOT lazily on tab activation. parseSwot() never throws (strips code fences, validates shape, try/catch) → dedicated parse-error card; network errors → "AI service is warming up" + retry. Shimmer skeletons for both tabs; stagger-fade on SWOT reveal.
- Race note: a parallel agent's placeholder overwrote stock-ai-panel.tsx mid-build; per contract it was detected (data-testid="stock-ai-panel") and replaced with the full implementation.
- Verified: bunx tsc --noEmit clean for both files (remaining repo errors are in src/server/ai + upload/ legacy, other agents' scope); lint clean for my files; live smoke-tested all 3 AI endpoints (copilot answer, report markdown, SWOT JSON string) — AI source active.
- Integration: stock page renders <StockAiPanel symbol={SYM} /> in its AI section; app shell mounts <CopilotDrawer /> once (top level) so it floats above every view.

Stage Summary:
- Exports: CopilotDrawer (src/components/ai/copilot-drawer.tsx), StockAiPanel({ symbol }) (src/components/ai/stock-ai-panel.tsx) — both "use client", zero props/store writes beyond reading stockSymbol.
- Consumes: /api/ai/copilot, /api/ai/analysis {type:"report"|"swot"}, useApp().stockSymbol, MarkdownLite/SectionHeading/AiSourceBadge, shadcn Button/Input/Tabs. No files outside src/components/ai touched.

---
Task ID: 6-d
Agent: UI Agent D (watchlist, portfolio, alerts)
Task: Built Watchlist / Portfolio / Alerts views (live price polling, XIRR, AI digest + risk scan, allocation pie, server-side price alerts).

Work Log:
- src/components/watchlist/watchlist-view.tsx — WatchlistView(): 20s refreshLive polling, StockSearch add-row (duplicate guard toast), AI Digest via /api/ai/analysis type=watchlist-digest (MarkdownLite + AiSourceBadge + shimmer loading), rows w/ note-onBlur input, Analyze/remove actions, dashed empty state → setView("screener").
- src/components/portfolio/portfolio-view.tsx — PortfolioView(): in-file XIRR bisection solver (cash outflows at buyDate year-fractions + today's value inflow; "—" when unsolvable), 5 summary stat-cards (invested, value, P&L±%, XIRR w/ money-weighted title, count + best/worst chips), Add/Edit Holding dialogs (shadcn Dialog, validation + sonner toasts), AI Risk Scan (parses JSON analysis string → risk badge, 0–10 meters, top risks/recommendations columns), recharts donut allocation pie (10-colour non-blue palette + legend, h220), holdings Table (edit/remove per row), empty state.
- src/components/alerts/alerts-view.tsx — AlertsView(): 20s refreshAlerts polling, create form grid (StockSearch + condition Select + target + note + brand Create btn), rows w/ bell tile, ↑/↓ condition chips, "Now ₹" + % away distance, Triggered timeAgo / Armed pulse-dot / Waiting status, dashed empty state; server-side evaluation note.
- Verified: bunx tsc --noEmit → zero errors in these files; eslint clean. Did not touch page.tsx/layout/globals.css/server/lib/api.

Stage Summary:
- Exports for the app shell view switcher: WatchlistView (watchlist), PortfolioView (portfolio), AlertsView (alerts). All client components, store-driven (useApp), toast via sonner. Full notes in agent-ctx/6-d-ui-agent-d.md.

---
Task ID: 6-a
Agent: UI Agent A (shell + home)
Task: App shell (header, market ticker, footer) + HomeView with hero, stats bar, feature cards, mood/movers, heatmap, news, SEO close

Work Log:
- src/components/shell/header.tsx — sticky glass header (header-enter), BrandMark export (gradient tile + SVG polyline logo, gradient wordmark + "AI" suffix, subtitle hidden on mobile), 7 desktop nav pills w/ nav-active state (individual useApp selectors), mobile hamburger w/ framer-motion AnimatePresence dropdown (grid-cols-2, role=menu), MarketStatusBadge compact (hidden sm), theme toggle via next-themes with useSyncExternalStore mounted guard (avoids setState-in-effect lint error + hydration mismatch).
- src/components/shell/market-ticker.tsx — ticker-shell/ticker-track marquee, /api/market/ticker polled every 20s, top 30 by volume, array duplicated for seamless -50% loop, each item is a button → openStock(symbol), shimmer while empty.
- src/components/shell/footer.tsx — 4-col footer (brand+MarketStatusBadge, Research Tools→setView, Markets→openStock big-6 NSE names, AI Features w/ Sparkles), gradient hairline, bottom row with disclaimer + "Beta V3" Badge. All links are <button> store navigation (no next/link anywhere).
- src/components/home/home-view.tsx — full home surface: (a) gradient-border hero w/ hero-orb-1/2/3, pulse-dot LIVE pill, clamp() headline, StockSearch, 6 secondary Badges, 3 stat-cards (coverage/modes/mood level), Command Center spotlight panel (3 pillars + shine-btn CTA row); (b) index stats bar (6 indices + Market Breadth card); (c) 4 feature-cards w/ per-card gradient icon tiles + surface washes + hover translate; (d) Market Mood Index SVG gauge (linearGradient danger→#eab308→success arc, rotated needle via CSS transform w/ transformOrigin, level badge, chips) + Top Movers (gainers/losers 6 each, openStock rows); (e) heatmap w/ 6 index pills fetching /api/market/heatmap?index=X — usePolling captures mount-time fn so latest fetcher kept in ref, tab clicks fetch directly in the event handler (lint-clean, no setState-in-effect), stale responses guarded via selectedRef, 7-step legend + index quote, auto-fill 96px tile grid; (f) news grid (6 cards, category-hash gradients from fixed non-blue palette, sentiment dots, symbol chips → openStock, 120s poll); (g) closing SEO section (Why MyStockVision copy + 4 Popular Workflows buttons).
- Loading: full shimmer skeleton for hero/stats/mood while overview is null; per-section shimmer for heatmap tiles and news cards.
- Verified: bunx tsc --noEmit → 0 errors in my files (pre-existing errors elsewhere untouched); eslint src/components/shell src/components/home → clean; all 4 API endpoints curl-verified; compiled Tailwind CSS contains all arbitrary utilities (minmax grids, clamp text, inset-x-[18%], brand gradients).
- Deviations: (1) exported BrandMark from header.tsx for footer reuse (spec said "same tile + wordmark"); (2) heatmap index switching handled via ref + event-handler fetch instead of effect (react-hooks/set-state-in-effect rule); (3) theme toggle mounted guard uses useSyncExternalStore instead of setState-in-effect (same rule); (4) added index quote chip in heatmap card header + mood "/100" suffix (small enhancements).

Stage Summary:
- Exports for the lead: Header (@/components/shell/header), MarketTicker (@/components/shell/market-ticker), Footer (@/components/shell/footer), BrandMark (header.tsx, optional prop subtitle), HomeView (@/components/home/home-view).
- page.tsx NOT touched (per contract) — lead wires: <main> wrapper → Header + MarketTicker + view switch (view==="home" → <HomeView/>) + Footer; recommend min-h-screen flex flex-col + mt-auto footer for sticky-footer layout.
- All navigation is store-based (useApp setView/openStock) — no next/link. Views referenced: home|screener|watchlist|portfolio|compare|ipo|alerts (other agents' views will render when added to the switch).
- Polling intervals used: ticker 20s, overview 30s, heatmap 30s, news 120s.

---
Task ID: 6-c
Agent: UI Agent C (screener, compare, IPO)
Task: Built ScreenerView, CompareView and IpoView discovery surfaces on the shared design system.

Work Log:
- src/components/screener/screener-view.tsx — preset chips (All + 6 expert presets), glass filter bar (search/sector/minMcap/maxPe/minDy/minRoe + reset), 350ms debounce, server-side sort/dir with clickable headers, P/E-ROE-DY conditional coloring, violet Smart / red Risk mini bars, shimmer skeleton rows, empty state, sticky header in max-h-[70vh] scroll area, 30s usePolling price refresh, row click → openStock. NOTE: search uses `q` param (API route reads `q`, not `search` as the brief said).
- src/components/compare/compare-view.tsx — picker (StockSearch A / VS / StockSearch B / shine-btn Compare), quick-winner card with composite score (smart*2 + (5-risk)*1.5 + (roe-(pe??30)/10)/8) + Crown "Our pick" highlight, AI verdict button → POST /api/ai/analysis {type:"compare"} with MarkdownLite + AiSourceBadge + shimmer "Analyzing both books…", six comparison sections via reusable CompRow (label|A|B grid, winner cell bg-success/10 + Check): Price & Returns, Valuation, Profitability, Smart Score dims, Risk Score (lower wins), Shareholding (latest quarter). Promise.all dashboards + 30s polling, stale-response guards.
- src/components/ipo/ipo-view.tsx — Upcoming/Recent shadcn Tabs (controlled, tab switch in event handler to satisfy react-hooks/set-state-in-effect), responsive card grid (sm:2 / xl:3) with symbol chip + sector badge, formatted date + status badge, price band, issue size/shares stats, GMP chip (upcoming) vs issue→listing price + listing-gain ChangePill + subscription chip (listed), client-side risk heuristic (issue size/sector/GMP/status/subscription → Low|Medium|High badge + reasons), Set Alert → setView("alerts"), shimmer + empty states.
- Pattern shared by all three: filter/pair state mirrored into refs so usePolling's first-render closure stays fresh; initial fetch rides usePolling's immediate call; filter-change effect skips first run; request-id ref discards stale responses.
- Verified: bunx tsc --noEmit (0 errors in my files), bun run lint (0 issues in my files), curl-smoked screener/ipo/dashboard/AI-compare endpoints. Detailed record: /home/z/my-project/agent-ctx/6-c-ui-agent-c.md.

Stage Summary:
- Exports: ScreenerView (src/components/screener/screener-view.tsx), CompareView (src/components/compare/compare-view.tsx), IpoView (src/components/ipo/ipo-view.tsx) — all default-named exports, "use client", no props.
- Integration: render per useApp().view === "screener" | "compare" | "ipo". Compare reads compareA/compareB/setCompare from the store; screener rows and compare symbol headers navigate via openStock; IPO "Set Alert" → setView("alerts").
- Deviation: screener search query param sent as `q` (matches the API route implementation); brief's `search` is not read server-side.

---
Task ID: 6-b
Agent: UI Agent B (stock detail)
Task: Built the full stock detail view (StockView) with sidebar, section components and AI panel placeholder.

Work Log:
- src/components/stock/helpers.ts — shared micro-helpers: clamp, pctClass (sign→success/danger color), numOrDash (null-safe fixed-decimal), date formatters for chart ticks (dd MMM / MMM 'yy / full).
- src/components/ai/stock-ai-panel.tsx — MINIMAL PLACEHOLDER ONLY (file did not exist). Exports StockAiPanel({ symbol }) with data-testid="stock-ai-panel". AI agent: replace this file, keep export name + prop signature.
- src/components/stock/stock-view.tsx — StockView(): empty state (StockSearch) when no symbol; keyed StockDetail (key=symbol → clean state reset per stock); dashboard fetch via usePolling(fn, 30000) with latest-fetcher ref + throttle + req cancellation; shimmer skeleton; error card with back-home. Hero (breadcrumbs, exchange·sector kicker, companyName + symbol chip, price block + ChangePill md + MarketStatusBadge compact), action bar (watchlist Heart toggle → store addToWatchlist/removeFromWatchlist, Set Alert → setView("alerts"), Add to Portfolio → setView("portfolio")), grid lg:[300-360px,1fr] with sticky sidebar (PriceChartCard / 52W range slider / Today stats / Returns strip) and right content with sticky top-[4.6rem] anchor tab nav (IntersectionObserver active-section tracking + smooth scrollIntoView), 8 sections with scroll-mt-40.
- src/components/stock/price-chart.tsx — PriceChartCard: range pills 1W/1M/6M/1Y/5Y (active bg-brand), recharts AreaChart h220, adaptive stroke/gradient (#f59e0b ↔ #ef4444 by range change), unique gradient id via useId, custom tooltip, dimmed-while-loading transition, fetches /api/stocks/chart on symbol/range change.
- src/components/stock/metrics-grid.tsx — 12 stat-cards (Market Cap/P/E/P/B/ROE/ROCE/EPS/Book Value/Div Yield/D-E/Revenue/Net Profit/Face Value; P/E null → "Loss-making" text-danger) + About card with description + founded/HQ/chairman/employees/website meta.
- src/components/stock/score-cards.tsx — Smart Score (violet/fuchsia) + Risk Score (red/orange) cards: SVG arc r=50 with gradient defs (unique ids), framer-motion animated strokeDashoffset + dimension bars, verdict badges by thresholds, explanation footers.
- src/components/stock/forensics-section.tsx — Beneish M-Score (8 chips DSRI…LVGI colored >1.4 danger / >1.1 warn, threshold caption), Altman Z zone bar with clamped marker, Piotroski F-Score with 9 dots, governance flags list (ShieldCheck empty state), overall health badge in heading.
- src/components/stock/financials-section.tsx — yearly revenue vs net-profit BarChart (custom legend + tooltip, radius [6,6,0,0]) + quarterly Table (newest-first, latest row bg-brand/5, YoY fmtPct colored).
- src/components/stock/shareholding-section.tsx — latest-quarter donut pie (promoters #f59e0b / FII #22c55e / DII #eab308 / public #94a3b8) with custom legend + 8-quarter trend table (promoters cell green when rising vs previous quarter).
- src/components/stock/technicals-section.tsx — RSI gauge with marker, MACD + crossover badge, EMA20/50/SMA200 + above/below 200-DMA note, volatility/drawdown/pivots, 4-horizon returns grid.
- src/components/stock/news-section.tsx — news cards with category chip, sentiment dot, line-clamp-2 summary, source/timeAgo footer, empty state.
- src/components/stock/competitors-section.tsx — peer Table with symbol buttons → openStock(), fmtCr/fmtInr/ChangePill xs, row hover bg-brand/5.
- Data ordering handled: yearly/quarterly/shareholding arrive oldest→newest (tables displayed newest-first, latest row highlighted; pie uses last element).
- ESLint: restructured to satisfy react-hooks/set-state-in-effect (keyed remount pattern + keyed loaded-chart state instead of synchronous setState in effects). Verified: `bunx tsc --noEmit` → 0 errors in my files; `bunx eslint src/components/stock src/components/ai` → clean.

Stage Summary:
- Exports: StockView (src/components/stock/stock-view.tsx) — render when useApp view === "stock". Sub-components take { d: StockDashboard }: MetricsGrid, ScoreCards, ForensicsSection, FinancialsSection, ShareholdingSection, TechnicalsSection, StockNewsSection, CompetitorsSection; PriceChartCard takes { symbol }. StockAiPanel placeholder at src/components/ai/stock-ai-panel.tsx (replace, keep export + { symbol } prop).
- Notes for integrator: no props needed beyond mounting StockView; empty/error/skeleton states handled internally; testids stock-view/stock-empty/stock-error/stock-ai-panel available.
- Deviations from spec: added SectionHeading to ScoreCards ("AI Scores") and ShareholdingSection ("Ownership") for nav consistency; forensics Z/F-score cards stacked full-width per spec layout (space-y-4); watchlist membership read reactively from useApp watchlist array (inWatchlist() is non-reactive); chart card shows a small range-change ChangePill in its header.

---
Task ID: 7-8 (integration + verification)
Agent: lead (main)
Task: Wire page.tsx, fix integration bugs, full E2E browser verification

Work Log:
- page.tsx: app shell (Header + MarketTicker) + view switcher (home/stock/screener/compare/ipo/watchlist/portfolio/alerts) + Footer (sticky-bottom via min-h-screen flex flex-col) + CopilotDrawer; hydrate() on mount.
- Fixed tsconfig/eslint excludes for upload/, examples/, skills/, agent-ctx/.
- Fixed server type errors: LiveQuote typing, computeTechnicals(seed.s), Math.max(4, seed.pe ?? 25).
- CRITICAL FIX: /api/stocks/search returned {success, results} but apiGet unwraps .data → dropdown never opened (search appeared "broken" in browser). Now returns {success, data}. StockSearch hardened with Array.isArray check.
- Browser E2E (agent-browser + VLM visual review):
  * Home: hero/search/stats/mood gauge/movers/heatmap/news all render, VLM polish 9/10, zero console errors.
  * Stock view: TCS full detail — chart w/ ranges, 52W bar, scores, forensics (M-Score/Z/F), financials chart (964x240 verified), shareholding, technicals, AI research report with live data.
  * Search → dropdown → stock view works after fix.
  * Watchlist: TCS added via heart toggle → persisted in SQLite, AI digest generated with live advice.
  * Portfolio: HDFCBANK 10@2800 holding added via dialog → summary cards (Invested/Value/P&L/XIRR/Best), AI risk scan detected single-holding concentration.
  * Compare: INFY vs TCS → quick verdict, 6 comparison sections, AI verdict "Stronger pick: TCS".
  * Alerts: TCS above ₹5000 created → armed, server-evaluated against live quotes.
  * IPO: upcoming/recent tabs, GMP, risk profiles.
  * Copilot: quick-prompt answered with live TCS forensic context (M-Score, Piotroski 9/9, D/E 0.07).
  * Mobile 390px: no horizontal scroll, hamburger nav, sticky footer verified (footerAtBottom: true).
  * Theme toggle: light/dark both clean (VLM: "excellent readability, no broken elements").
- Final: ESLint 0 errors, tsc 0 errors, dev.log clean (all 200s).

Stage Summary:
- App complete and browser-verified end-to-end. All 8 views + AI features + persistence working.

---
Task ID: 7-b
Agent: UI Agent F (directory)
Task: Stocks A–Z NSE+BSE directory browser view (letter rail, exchange/sector/search filters, paginated card grid, 30s silent price refresh)

Work Log:
- Created EXACTLY ONE file: src/components/directory/directory-view.tsx ("use client", exports DirectoryView, no props). No other file touched.
- Fetch layer: apiGet<DirectoryData>("/api/stocks/directory?letter&exchange&sector&q&limit=60&offset=…"); when committed query is non-empty it sends letter=ALL (backend ignores letter during search). Single stable useCallback fetchPage(mode) with mode "replace" | "append" | "silent", request-id ref discards stale responses, inFlight ref keeps silent polls from invalidating an in-flight user load (no stranded spinners).
- Polling pattern (per contract): usePolling(fn, 30000) captures mount-time fn → latest fetcher kept in fetcherRef (render-time assignment); firstPollRef makes the mount call a full load (skeleton) and interval calls silent price refreshes that merge prices in-place over current rows (pagination cursor untouched; also self-heals a failed first load). ALL filter fetches fire directly in event handlers (letter/exchange/sector/search-debounce/load-more/clear/retry) — the only useEffect is a debounce-timer cleanup, so react-hooks/set-state-in-effect stays clean.
- Filters: exchange segmented toggle (All/NSE/BSE, aria-pressed, brand active), 250ms-debounced search input (Search icon, cancels pending debounce on letter click/clear), sector shadcn Select fed by response sectors with "all" sentinel (matches screener pattern) and reset to "" on exchange change. filter state mirrored into filtersRef (render-time) + updated synchronously in handlers so immediate fetches read fresh values.
- Letter rail: A–Z + "#" 44px squares in wrapping flex, per-letter count as tiny absolute badge (99+ cap) from letterCounts, count-0 letters disabled (opacity-40), active = brand bg (deactivated while search is active), click resets offset + exits search mode.
- Results: sub-header (`Search "q" · N matches` vs `Letter "L" · N companies` + "Showing X of Y"), responsive grid cols 1/2/3/4 gap-3, row cards are <button> → openStock(symbol) with symbol + exchange chip (NSE brand-tint / BSE emerald — no blue/indigo), truncated name, uppercase sector, fmtInr price + ChangePill xs, fmtCr market cap, hover border-brand/40 + -translate-y-0.5. Load-more brand outline button appends pages (offset += 60, dedupe by symbol) with Loader2 spinner; shimmer skeleton grid while first paint; error card w/ Retry; SearchX dashed empty state w/ context-aware message + Clear filters. Last successful meta (rail counts/exchangeCounts/sectors) is never blanked during loads.
- Icons: lucide only — LibraryBig (spec said Library2 but lucide-react 0.525 dropped numbered aliases; LibraryBig is its direct rename), Search, SearchX, Loader2, ChevronDown, RotateCcw, AlertTriangle.
- Verified: `bunx tsc --noEmit` → 0 errors project-wide (grep directory-view: empty); `bun run lint` + targeted `bunx eslint src/components/directory/directory-view.tsx` → 0 errors/warnings. API route not smoke-tested (lead building it in parallel) — compile-verified against the contract only.

Stage Summary:
- Exports: DirectoryView (src/components/directory/directory-view.tsx)
- Integration for lead: render when useApp().view === "directory" — e.g. `view === "directory" && <DirectoryView />` in page.tsx switcher; no props needed, self-contained states (skeleton/error/empty handled internally). Consumes only apiGet, useApp().openStock, usePolling, fmtInr/fmtCr + DirectoryData/DirectoryRow types (already in types.ts) and shared SectionHeading/ChangePill. Query params sent: letter (A–Z|#|ALL), exchange (ALL|NSE|BSE), sector, q, limit=60, offset. Note: during active search letter is sent as "ALL" and the UI switches to a "search results" header instead of the letter grouping header.

---
Task ID: 7-a
Agent: lead (main)
Task: Stocks A–Z directory backend — full NSE + BSE dataset, deterministic seed resolver, directory API, search extension

Work Log:
- Read the uploaded Finance-V2 zip (extracted at upload/extracted/Finance-V2-main) — its universe.ts holds only ~100 curated NSE symbols; no BSE coverage anywhere. Interpreted the user request ("all the stocks in the nav bar from a to z for all nse and bse") as a complete A–Z NSE+BSE directory surfaced from the navbar.
- src/server/market/directory.ts (NEW) — hand-curated dataset of 326 additional real listed companies (257 NSE + 69 BSE-tagged), every letter A–Z covered (X: XPROINDIA, Q: QUESS/QUICKHEAL, #: 3MINDIA/5PAISA/63MOONS). Sector labels reuse the 11 canonical universe sectors.
- src/server/market/synth.ts (NEW) — synthesizeSeed(entry): deterministic fundamentals (mcap log-uniform ₹120–45,000 Cr, PE/PB/ROE/ROCE/D-E/holdings/dy/growth/vol/drift, sector-mapped industry) seeded by hashString(symbol), cached.
- universe.ts — StockSeed gains `ex?: "NSE" | "BSE"`; DIRECTORY export = curated 173 (tagged NSE) + RAW_DIRECTORY deduped by symbol (curated wins) → 523 unique companies; DIRECTORY_COUNTS; resolveStock(symbol) = curated ?? synthesized directory seed; findStock() now resolves directory symbols too (watchlist/portfolio/alerts/AI routes automatically accept them).
- engine.ts — getSeries/getLiveQuote resolve via resolveStock (any directory stock gets full 5Y deterministic OHLCV + live quote); seriesCache bounded at 450 entries (oldest evicted).
- news.ts — computeNewsForStock resolves directory stocks. dashboard.ts — exchange badge = seed.ex ?? "NSE" (BSE stocks display "BSE EQUITY").
- NEW /api/stocks/directory — letter (A–Z/#), exchange (ALL/NSE/BSE), sector, q (bypasses letter), limit/offset pagination; returns rows w/ live quote price/change/mcap + letterCounts + exchangeCounts + sectors. ~10–350ms.
- /api/stocks/search — now searches the full 523-company directory (startsWith + mcap ranking, exchange tag in results).
- Shell wiring: header.tsx nav gains "Stocks A–Z" (Library icon; desktop pills moved to xl breakpoint to fit 8 items), mobile menu included; page.tsx renders DirectoryView; footer Research Tools gains "Stocks A–Z (NSE + BSE)".

Stage Summary:
- 523 companies browsable A–Z across NSE (454) + BSE (69); every row clickable into a full dashboard (quote/chart/scores/forensics/financials/news/AI) via deterministic synthesis.
- Verified: tsc clean, eslint clean, all API routes 200 (directory, search, [symbol], chart, watchlist POST/DELETE with BSE symbol), zero console/page errors in agent-browser E2E.
