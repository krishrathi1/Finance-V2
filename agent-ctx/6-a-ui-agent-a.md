# Task 6-a — UI Agent A (shell + home)

## Task
Build the MyStockVision app shell (Header, MarketTicker, Footer) and the HomeView for the Next.js 16 single-page app.

## Files created
- `src/components/shell/header.tsx` — exports `Header()` and `BrandMark({ subtitle? })`
- `src/components/shell/market-ticker.tsx` — exports `MarketTicker()`
- `src/components/shell/footer.tsx` — exports `Footer()`
- `src/components/home/home-view.tsx` — exports `HomeView()`

## What was built
- **Header**: sticky glass header, logo → `setView("home")`, 7 desktop nav pills (`nav-active` when current view), mobile hamburger + framer-motion `AnimatePresence` dropdown, `MarketStatusBadge compact` (hidden on mobile), next-themes toggle with hydration-safe mounted guard (`useSyncExternalStore`).
- **MarketTicker**: `/api/market/ticker` polled 20s via `usePolling`, top 30 by volume, duplicated array for seamless marquee, click → `openStock(symbol)`, shimmer when empty.
- **Footer**: 4 columns (brand / Research Tools → `setView` / Markets → `openStock` / AI Features), gradient hairline, disclaimer + "Beta V3" badge. All links are `<button>`s (no `next/link`).
- **HomeView**: polls `/api/market/overview` (30s) + `/api/market/news` (120s); sections:
  a) gradient-border hero (orbs, LIVE pill, clamp headline, StockSearch, tag badges, 3 stat-cards, Command Center spotlight panel w/ CTAs)
  b) index stats bar (6 index stat-cards + Market Breadth card)
  c) 4 feature-cards (gradient icon tiles, badge, points, hover "Explore")
  d) Market Mood Index (SVG semicircle gauge, gradient arc, rotated needle, level badge, chips) + Top Movers (gainers/losers × 6)
  e) heatmap with 6 index pills → `/api/market/heatmap?index=X` (poll 30s, latest-fetcher kept in a ref because `usePolling` closes over the mount-time fn; tab clicks fetch directly; stale-response guard via `selectedRef`)
  f) news grid (6 cards, category-hash gradient headers — no blue/indigo, sentiment dots, symbol chips)
  g) closing SEO section (Why MyStockVision + 4 Popular Workflows buttons)

## Key decisions / gotchas for other agents
- `usePolling(fn, ms)` captures the mount-time `fn` (its effect deps are `[intervalMs]`). If your fetcher depends on changing state (e.g. selected tab), keep the latest fetcher in a `useRef` updated by an effect, pass `() => ref.current()` to `usePolling`, and fetch directly in the event handler on change. Do NOT call the fetcher from an effect — the `react-hooks/set-state-in-effect` ESLint rule errors on that (also forbids `useEffect(() => setMounted(true))` — use `useSyncExternalStore` pattern instead, see header.tsx `useMounted`).
- `BrandMark` is exported from `header.tsx` — reuse it if you need the logo elsewhere.
- Design tokens used throughout: `bg-bg`, `bg-panel/60`, `border-border/50`, `text-brand`, `text-success/danger/warn`, `font-display`, `tabular-nums`. Utility classes: `.gradient-border`, `.hero-orb-*`, `.stat-card`, `.feature-card(-icon)`, `.shine-btn`, `.shimmer`, `.pulse-dot`, `.ticker-shell/.ticker-track`, `.nav-active`, `.stagger-fade`, `.news-grid-stagger`, `.header-enter`.
- Verified: `bunx tsc --noEmit` (0 errors in my files), `eslint src/components/shell src/components/home` (clean), all 4 market APIs curl-verified, Tailwind CSS output contains all arbitrary utilities used (minmax grids, clamp, brand gradients).
- `page.tsx` untouched per contract — lead must wire: `Header` + `MarketTicker` + view switch (`view === "home" ? <HomeView /> : ...`) + `Footer`; recommend `min-h-screen flex flex-col` wrapper with `mt-auto` on footer.
