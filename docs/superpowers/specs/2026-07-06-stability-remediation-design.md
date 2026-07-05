# Stability Remediation — Design Spec

**Date:** 2026-07-06
**Status:** Approved for planning
**Owner:** Financial Forensics AI (Finance-V2)
**Phase:** 1 of 3 (Stabilize → Expand → Polish)

---

## 1. Context

Finance-V2 is a mature Next.js-only Indian-stock-market platform intended as a **showcase/portfolio** project. Before adding new market coverage or polishing the UI, the priority is **stability**: everything that already exists must work correctly.

A deep audit (seven parallel read-only agents covering data providers, scoring/assembly, auth/security, API routes, the stock-detail UI, market-wide pages, and AI features) produced ~65 evidence-backed findings. This spec covers the **P0 + P1 + P2** subset (~46 issues) that constitutes Phase 1. Cheap P3 cleanups are folded in opportunistically; the rest are listed for reference.

## 2. Goals

- Kill every crash, white-screen, and dead control a visitor can hit.
- Close the exploitable security holes (account takeover, SSRF, rate-limit bypass) in code.
- Make displayed numbers correct (scores, 52-week range, quarterly results) or honestly show "N/A" — never fake `₹0.00` / `NaN%` / `-100%`.
- Make authentication actually work end-to-end (login unlocks the app; admin routes reachable).
- Do it without regressing currently-working features; verify each batch by driving the real flow.

## 3. Non-Goals (explicitly deferred)

- **New market coverage** (F&O/options, FII/DII, sectoral indices, mutual funds, index pages, promoter-pledge, delivery%/VWAP, market-breadth history) → **Phase 2**, its own spec.
- **Premium UI/visual overhaul** → **Phase 3**, its own spec.
- Most P3 cleanup/cosmetic items (done only when they sit in a file already being edited).

## 4. Owner-Only Actions (I flag; the user executes)

These cannot or should not be done unilaterally in code:

| ID | Action | Why it's yours |
|----|--------|----------------|
| OWN-1 | **Rotate the leaked keys** — FMP, Gemini, NewsAPI, S3 access/secret (committed in `b9bd4c4`). | I can't issue new keys; only you can rotate at the provider. Matches the standing `pending-user-actions-key-rotation` memory note. |
| OWN-2 | **Set real secrets in env** — a strong random `JWT_SECRET_KEY` and the real SMTP creds per environment. | Secret values are environment-owned, not committed. Code will *reject* the known placeholder (SEC-4). |
| OWN-3 | **Purge git history** (optional, destructive) — `git filter-repo`/BFG to remove the committed `.env.prod` secrets from history. | Rewrites shared history; needs your explicit go-ahead. Rotation (OWN-1) is the real mitigation regardless. |

## 5. Approach

Fix in **five themed batches**, in priority order. Each batch: implement → **verify the affected flow actually works** (drive it, not just typecheck) → commit → next. No "fixed" claim without evidence.

Batch order is chosen so the app becomes navigable and log-in-able first, then secure, then correct, then robust:

1. **Routing & Auth Flow** — make the app navigable and login real
2. **Security** — close exploitable holes in code
3. **Data Correctness** — restore analytical credibility
4. **UI Robustness** — no fake numbers, no white screens
5. **Cleanup & Hardening** — the P3s worth doing

Verification tooling already present: `npm run build`, `python data-pipeline/scripts/validate_scoring_engine.py --base-url http://127.0.0.1:3000`, and manual drive of the affected page/endpoint. Data-correctness batch additionally re-runs the scoring validator.

---

## 6. Batch 1 — Routing & Auth Flow

| ID | Sev | Files | Symptom → Fix | Done when |
|----|-----|-------|---------------|-----------|
| RT-1 | P0 | `app/(dashboard/)/layout.tsx`, `app/(dashboard/)/dashboard/page.tsx` | Route group folder is literally `(dashboard` with a nested `)` → `/dashboard` 404s, every post-login redirect fails. **Fix:** recreate as a single correctly-named `app/(dashboard)/` group; move both files in; delete the split dirs. | `/dashboard` returns 200; sign-in redirect lands on it |
| RT-2 | P1 | `hooks/useAuth.tsx:60-89`, `components/floating-auth.tsx:116-151`, `components/sections/feature-auth-wall.tsx:24-48`, `components/sections/stock-auth-wall.tsx`, `lib/auth.ts:21` | Two auth stores: `/signin` sets cookie+context but not the `finance_auth_session` localStorage key the walls read (only FloatingAuth sets it). Feature pages never unlock. **Fix:** single source of truth — `useAuth.signIn/signUp/signOut` writes/clears `AUTH_STORAGE_KEY` and fires `notifyAuthSessionChanged()`; `AuthProvider` subscribes to `AUTH_SESSION_CHANGED_EVENT`; walls read `useAuth()`. | Sign in on `/signin` → compare/screener/ipo/watchlist/portfolio/alerts + stock sections unlock; sign out re-locks; both entry points consistent |
| RT-3 | P1 | `middleware.ts:74`, `lib/auth-utils.ts:33`, `app/api/v1/auth/login/route.ts:46` | `is_admin` is mysql2 `tinyint`→number `1`; middleware checks `payload.admin !== true`, so admins are always redirected. **Fix:** `Boolean(user.is_admin)` when signing the token (and/or truthy check in middleware). | Admin reaches `/admin`; non-admin redirected |
| RT-4 | P1 | `components/sections/stock-section-tabs.tsx:3-10`, `components/sections/live-stock-details.tsx:140-241`, `stock-auth-wall.tsx:52` | 5 of 6 section tabs are dead for logged-out users — their anchor targets live inside `StockAuthWall`, which renders a lock panel instead of children. **Fix:** render only tab anchors whose targets exist when unauthenticated (or lift the tabbed sections out of the wall). | Logged-out user sees only working tabs; each scrolls to its section |
| RT-5 | P2 | `middleware.ts:47-52` | Protected pages gated on cookie *presence* (`access_token=x` passes), not validity. **Fix:** `jwtVerify` before allowing `/dashboard`,`/profile`,`/settings`,`/premium-request`. | Invalid/garbage cookie → redirect to signin |
| RT-6 | P2 | `components/sections/stock-auth-wall.tsx:26-52` | Signed-in users see a flash of the "Premium Locked" wall + layout shift on every load (auth read only in `useEffect`). **Fix:** resolve auth from cookie during SSR, or render a neutral skeleton until the client check resolves. | No lock-panel flash for signed-in users |

## 7. Batch 2 — Security

| ID | Sev | Files | Symptom → Fix | Done when |
|----|-----|-------|---------------|-----------|
| SEC-1 | P0 | `app/api/v1/auth/reset-password/route.ts:42-71`, `app/api/v1/auth/verify-otp/route.ts:46` | Reset token is `base64("<id>:<timestamp>")` — unsigned, forgeable; user IDs sequential → **account takeover** of any user with a crafted POST. **Fix:** issue a signed, single-use token bound to the consumed OTP row (signed JWT like `verifyEmailToken`, or a random token persisted in `password_reset_tokens`); `reset-password` must look the token up in the DB and require the matching OTP row to be verified/used — never trust a decoded client blob. | Forged/hand-crafted token rejected; reset only succeeds after a real verified-OTP flow |
| SEC-2 | P0 | `app/api/v1/stocks/proxy-image/route.ts:78-91` | SSRF: `isPublicHttpUrl` checks only the literal initial hostname; `fetch` follows redirects and DNS names → can reach `169.254.169.254`/private IPs. **Fix:** `redirect:"manual"` + re-validate every hop; resolve hostname and block private/link-local/loopback ranges before connecting; cap redirect count. | Redirect-to-internal and DNS→private both blocked |
| SEC-3 | P1 | `app/api/v1/stocks/proxy-image/route.ts:94-103` | Serves attacker `image/svg+xml` from our origin with `ACAO:*` → XSS on top-level navigation. **Fix:** reject `image/svg+xml` (raster allowlist), or serve with `Content-Security-Policy: default-src 'none'; sandbox` + `Content-Disposition: attachment`. | SVG never served as an active document from our origin |
| SEC-4 | P1 | `lib/rate-limit.ts:20-27,39-43`, `middleware.ts:29-36` | Rate limit bypassable: leftmost `X-Forwarded-For` is trusted (fresh header = fresh bucket) and the limiter **fails open** once `MAX_BUCKETS` is hit. Enables brute-forcing SEC-1/OTP. **Fix:** derive client IP from a trusted-proxy hop (fixed hop count / platform connection info), never raw leftmost XFF; on pressure evict oldest instead of failing open; bound key cardinality. | Spoofed XFF gets no fresh bucket; bucket flooding does not disable the limiter |
| SEC-5 | P1 | `.env.local:7`, `lib/auth-utils.ts:13` (`getJwtSecret`) | Placeholder `JWT_SECRET_KEY` passes the length-only guard → forgeable tokens if that value is ever loaded. **Fix:** reject a known-placeholder/low-entropy secret in `getJwtSecret` (fail loud at boot). Real value set by OWN-2. | App refuses to sign/verify with the placeholder secret |
| SEC-5b | P2 | `app/api/v1/auth/register/route.ts:16-21` | No server-side password strength (API accepts 1-char). **Fix:** enforce min length/complexity server-side, consistent with reset. | Weak password rejected by the API, not just the client |
| SEC-6 | P2 | `app/api/v1/portfolio/parse-document/route.ts:169-209` | No upload size/type limit; whole file buffered then parsed → OOM/DoS (PDF bomb) on an unauthenticated POST. **Fix:** reject `blob.size` over a few MB before reading; enforce a content-type allowlist; cap extracted text length. | Oversized/mistyped upload rejected before buffering |
| SEC-7 | P2 | `app/api/v1/auth/forgot-password/route.ts:5-7`, `verify-otp/route.ts` | OTP from `Math.random()`; no per-account attempt limit; prior OTPs stay valid on reissue. **Fix:** `crypto.randomInt(100000,1000000)`; invalidate prior OTPs on reissue; lock/expire after N failed attempts. | OTP is CSPRNG-generated; brute-force + multi-OTP window closed |
| SEC-8 | P2 | `app/api/v1/auth/register/route.ts:55-96`, `lib/current-user.ts:20-39` | `verified_email` never enforced anywhere. **Fix:** gate the chosen sensitive actions (e.g. premium-request) on `verified_email`. | Unverified user blocked from the gated action(s) |
| SEC-9 | P2 | `app/api/v1/auth/reset-password/route.ts:77-80` | Reset deletes only `password_reset_tokens`; existing `refresh_tokens` survive → attacker session persists post-reset. **Fix:** `DELETE FROM refresh_tokens WHERE user_id = ?` on reset. | All sessions revoked on password reset |
| SEC-10 | P2 | `login/route.ts:19-24`, `verify-otp/route.ts:18-23` | User enumeration: login timing oracle (bcrypt only for known emails); `verify-otp` returns 404 vs 401. **Fix:** constant-time dummy bcrypt on unknown login; generic response for unknown/known in verify-otp. | Response time & status uniform across unknown/known emails |

## 8. Batch 3 — Data Correctness

| ID | Sev | Files | Symptom → Fix | Done when |
|----|-----|-------|---------------|-----------|
| DATA-1 | P1 | `lib/backend/scoring.ts:1077-1080` | `pyOr(normalize(...),0.5)` treats a legitimate worst-case `0.0` as "missing" → distressed stocks get `financialRisk≈0.6` instead of `~1.0`, read as "Medium". **Fix:** distinguish `null` from `0.0` (e.g. `x===null?0.5:x`), matching the smartScore side. | A distress-zone stock (low current ratio / Altman Z) scores high risk |
| DATA-2 | P1 | `lib/backend/dashboard.ts:118-127` (called at `:578`) | `syncHistoryWithLiveQuote` recomputes `fiftyTwoWeek*` as min/max over the **entire** ~5-year history, clobbering the correct 252-day/exchange value. **Fix:** window to `history.slice(-252)` (or don't overwrite an exchange-provided 52-week value). | Displayed 52-week high/low match the last-year extremes |
| DATA-3 | P1 | `providers/nse.ts:179-184,242-243`, `providers/yahoo.ts:520-534`, `providers/fmp.ts:198-200`, `derivations.ts:992`, `components/sections/quarterly-results-section.tsx:84-88` | Providers emit inconsistent order (FMP ascending; NSE/Yahoo newest-first) but `backfillQuarterlyFinancials` does `.slice(-5)` and `parsePeriod` can't parse NSE's `"01-Jan-2024 to 31-Mar-2024"` → latest 2-3 quarters dropped/unsortable. **Fix:** every quarterly provider returns one canonical ascending order and a machine-parseable/ISO date. | Latest quarters present and correctly ordered for NSE, Yahoo, and FMP sources |
| DATA-4 | P2 | `lib/backend/scoring.ts:912-915` | Negative PE/PB → `inverseNormalize`=1.0 → loss-makers scored "maximally undervalued". **Fix:** treat negative `peRatio`/`pbRatio` as null (or worst-value) before normalizing. | Loss-making / negative-book stocks are not scored as "cheap" |
| DATA-5 | P2 | `lib/backend/dashboard.ts:565-571` | FMP PE/PB fallback written to dead keys `pe`/`pb` (canonical is `peRatio`/`pbRatio`) → never reaches scoring/UI. **Fix:** write the canonical keys (also `roce`/`evToSales` if intended for scoring). | FMP-sourced PE/PB appear in the score and UI |
| DATA-6 | P2 | `lib/backend/scoring.ts:890-951,1065-1098` | All-null fundamentals still yield a confident `~2.5/5 "Moderate"` via `median/avg(...,0.5)` + always-neutral signals. **Fix:** track input coverage; emit "Unrated"/low-confidence below a threshold instead of 0.5. | A stock with no fundamentals shows "Unrated", not 2.5/5 |
| DATA-7 | P2 | `lib/api.ts:52-55,113` | Stale cache served with unbounded age and still flagged `stale:false`. **Fix:** cap max stale age; re-stamp `stale:true` on the fallback envelope. | Very old data is rejected or badged stale |
| DATA-8 | P2 | `lib/market-status.ts:75-87,104-107` | "Opens in…" is off by one trading day every evening (shifted `nowPseudo` skips the step-0 guard). **Fix:** normalize the shifted `nowPseudo` to that day's start (or drop the guard once advanced a day). | Weekday-evening "opens in" points to the next trading day |
| DATA-9 | P2 | `providers/nse.ts:226-227` | Interest earned and interest expended both read `re_int_new` → identical numbers for banks/NBFCs. **Fix:** map `interestExpended` to the correct field or set null. | The two values differ (or expended is honestly null) |
| DATA-10 | P2 | `lib/backend/ai/features.ts:829-830,833-834,873` | earnings-tldr reads non-existent `profit`/`netIncome`/`niGrowthPct` (real: `netProfit`/`netProfitGrowthPct`) → profit trend always "under pressure"; and `<5 ? v*100` turns 3% into 300%. **Fix:** read the correct fields; drop the `*100` branch (source is already percent). | TL;DR profit trend & growth reflect real numbers |
| DATA-11 | P2 | `app/api/v1/stocks/compare-analysis/route.ts:14`, `lib/backend/ai/features.ts:1069-1131` | Route passes no context → prompt gets all-null metrics; fallback is always "Close call". **Fix:** fetch quotes/metrics for both symbols and pass `{contextA,contextB}`. | Comparison returns a real, data-grounded winner |
| DATA-12 | P2 | `lib/backend/ai/features.ts:91-102` (consumers: screener `:1587`, competitor `:774`, earnings `:861`, portfolioRisk `:1220`, roast `:1355`, ipo `:1522`) | JSON features are wrapped in the prose `buildChatPrompt` scaffold ("1) Direct answer…") that contradicts "ONLY raw JSON" → lower JSON-hit rate; screener's non-nested regex can match a stray `{}` → returns the **entire universe**. **Fix:** send the raw JSON prompt for JSON features (skip the prose scaffold); harden the screener extraction. | JSON features parse reliably; screener returns the query result, never the whole universe |
| DATA-13 | P2 | `lib/backend/ai/features.ts:1197-1205`, `app/api/v1/stocks/portfolio-risk/route.ts:10`, `[symbol]/chat/route.ts:16` | Unbounded holdings/free-text into prompts → uncapped token cost/latency. **Fix:** `.slice(0,20)` holdings; clamp question/summary/title length in the routes. | Large inputs are bounded before hitting Gemini |
| DATA-14 | P2 | `lib/backend/cache.ts:13-29`, `lib/api.ts` memoryCache | Module `Map` caches never evict → unbounded per-process memory. **Fix:** LRU cap / sweep expired on write; bound `getStale`. | Cache size is bounded under sustained browsing |

## 9. Batch 4 — UI Robustness

| ID | Sev | Files | Symptom → Fix | Done when |
|----|-----|-------|---------------|-----------|
| UI-1 | P2 | `components/charts/price-chart.tsx:46-52` | `item.close.toFixed` / `item.date.includes` assume valid types; a null/string point throws → propagates to `stocks/[symbol]/error.tsx` → whole page replaced. **Fix:** coerce/guard each point and drop invalid ones (optionally a local error boundary). | A malformed history point degrades the chart, page survives |
| UI-2 | P1 | `components/sections/beginner-snapshot.tsx:80-82,134`, `app/stocks/[symbol]/page.tsx:141` | Missing analyst target (`aiTarget=0`) → "Possible downside −100.00%" and "target ₹0.00". **Fix:** when `aiTarget<=0` show "Target: N/A" and suppress the gap/tone. | No −100%/₹0 target when the target is absent |
| UI-3 | P2 | `components/sections/returns-calculator.tsx:33,42-46,73-77` | Same missing-target case → ROI simulator projects ₹0.00 / −100% across all scenarios. **Fix:** guard `aiTarget<=0` (hide projection or use a neutral CAGR). | Simulator never collapses to ₹0 on a missing target |
| UI-4 | P2 | `components/sections/technicals-section.tsx:22-33` | Absent pivots → 14 cells of "₹0.00" fabricated; RSI/MACD/EMA/trend are fetched but never shown. **Fix:** empty state when pivots missing; surface the already-fetched indicators. | No fake ₹0.00 pivot rows; real indicators visible |
| UI-5 | P2 | `components/sections/competitors-section.tsx:32` | `bg-white text-text` → white-on-white (invisible) chips in dark mode. **Fix:** theme token / `dark:` variant. | Competitor chips readable in dark mode |
| UI-6 | P2 | `components/sections/swot-analysis.tsx:169-186`, `lib/api.ts:400-425` | On failure the same generic SWOT is shown for every stock, labeled "live" AI. **Fix:** flag fallback (`isFallback`) and show a "sample/unavailable" notice. | Fallback SWOT is visibly labeled, not passed as live AI |
| UI-7 | P2 | `components/sections/news-section.tsx:73-78` | Missing `sentimentScore` → "Sentiment NaN%" (styled red). **Fix:** guard `Number.isFinite` before rendering; show "—" otherwise. | No "NaN%" sentiment badge |
| UI-8 | P2 | `hooks/useStockNews.ts:24-51`, `hooks/useQuarterlyResults.ts:45-72` | No cancellation → a slow previous-symbol response overwrites the new symbol's data. **Fix:** `cancelled` flag / `AbortController` (mirror `useStockQuote`). | Rapid symbol switches always show the current symbol's data |
| UI-9 | P2 | `app/compare/page.tsx:399-412` | "Ask AI" has `try/finally` but no `catch` and no error state → silent failure. **Fix:** add `catch` + rendered error (mirror the IPO modal `aiError`). | AI-compare failure shows a message |
| UI-10 | P2 | `lib/providers/news.ts:299` | One bad `<pubDate>` throws `RangeError` → `getGoogleNewsFallback` catch returns `[]`, dropping the whole batch (market-news then returns empty-but-OK). **Fix:** guard `isNaN(d.getTime())` per item, default to now. | One malformed item no longer empties the feed |
| UI-11 | P2 | `app/api/v1/stocks/market-news/route.ts:22-24`, `lib/providers/news.ts:18,97-109` | Returns HTTP 500 on error (siblings degrade to 200/empty); disk cache under `process.cwd()` silently fails on read-only FS → no caching + repeated OG scrapes; hardcoded `published_after`. **Fix:** return `200 {data:[]}` on failure; move to the in-memory cache layer; compute `published_after` relative to now. | Market-news degrades gracefully and caches on serverless |
| UI-12 | P1 | `app/api/v1/stocks/[symbol]/quarterly-results/route.ts:11-27` | Raw NSE `/api/results-comparision` with no cookie priming → 401/403 from server IPs (broken in prod); returns raw upstream status. **Fix:** call `getNseQuarterlyResults(symbol)` (cookie-primed, never-throws), return `{results:[]}` on failure. | Endpoint returns data (or empty) from a datacenter IP, never a raw 401 |
| UI-13 | P2 | `quote/route.ts:104,128`, `chart/route.ts:102`, `quarterly-results/route.ts:13` | Raw NSE fallback fetches have no `AbortSignal`; routes declare no `maxDuration` → hang risk. **Fix:** `signal: AbortSignal.timeout(...)` on each; set explicit `maxDuration`. | A stalled upstream times out instead of hanging the worker |
| UI-14 | P2 | `app/api/v1/stocks/ticker/route.ts:11-19`, `lib/market/indian-market.ts:736-761` | Unbounded `symbols` param → sequential fan-out amplification. **Fix:** slice to a sane max (e.g. 50). | Ticker requests are bounded regardless of input size |

## 10. Batch 5 — Cleanup & Hardening (P3, opportunistic)

Done when the surrounding file is already being edited, or quickly as a group at the end. Not gating.

- **Formatting/display:** `Rs`→`₹` (`quarterly-results-section.tsx:66`, `brokerage-summary.tsx:24`); hide 52W bar when bounds are 0 (`price-sidebar.tsx:87-89,165-166`); `||`→`??` so legitimate `0` shows (`metrics-grid-live.tsx:24-40`).
- **Route resilience:** wrap `indices/route.ts:7-12` in try-catch; normalize quote/chart response shape incl. `source`; `encodeURIComponent` symbol/day params (`quote:102,127`, `chart:100`, `quarterly:11`); validate `returns-projection/route.ts:6-10` numeric inputs.
- **Provider hygiene:** 429 backoff in `http.ts:49-86`; `clearTimeout` in `safeCall` `http.ts:106-118`; per-key in-flight dedup on the dashboard route; source-keyed `debtToEquity` conversion (`derivations.ts:463-465`); ticker empty-result stale fallback (`api.ts:273-275`).
- **AI:** `AbortController` + one 429 backoff-retry in `gemini.ts:37-49,62-83`.
- **Auth hygiene:** logout cookie path fix (`logout/route.ts:17-18`); delete dead admin creds (`auth.ts:18-20`); `requireTLS:true` SMTP (`email.ts:3-11`); align password-length min to 8 (`reset-password/page.tsx:82`).
- **Site hygiene:** remove/populate Google verification meta (`layout.tsx:110-112`); gate or remove `/email-preview`; encode `StockSearch` submit URLs (`stock-search.tsx:76,84`).
- **Dead code removal:** `insider-trading-summary.tsx`, `research-report-section.tsx`, `research-summary-card.tsx`, `charts/returns-projection-chart.tsx`, `popular-stocks.tsx`, `lib/providers/nse.ts`, `lib/nse-data-mapper.ts` (verify no imports first).
- **Layout:** screener full-height calc overflow (`screener/page.tsx:345`).

## 11. Verification Plan

- **Per batch:** `npm run build` clean; drive the affected flow in a running dev server and observe correct behavior (the specific "Done when" per row).
- **Batch 3 (data):** additionally run `python data-pipeline/scripts/validate_scoring_engine.py --base-url http://127.0.0.1:3000` and confirm no regressions; spot-check a distressed stock (DATA-1), a 5-year runner (DATA-2), and a stock with recent results (DATA-3).
- **Batch 2 (security):** prove each hole is closed with a negative test (forged reset token rejected; SSRF redirect blocked; spoofed XFF gets no fresh bucket; placeholder JWT secret refused).
- **No success claim without observed evidence.**

## 12. Risks & Rollback

- **Auth unification (RT-2)** touches the most-shared state; risk of a new inconsistency. Mitigation: one source of truth, test both entry points and sign-out.
- **Reset-token redesign (SEC-1)** changes the reset flow; mitigation: keep the OTP UX identical, only strengthen the token; test happy path + forgery.
- **Route-group rename (RT-1)** is a filesystem move; mitigation: confirm `git mv` result and that `/dashboard` resolves before relying on redirects.
- Each batch is a separate commit → easy revert if a regression surfaces.

## 13. Phases 2 & 3 (preview, not in scope)

The audit's "coverage gaps" feed these:

- **Phase 2 — Expand:** F&O/options chain + OI/PCR, FII/DII daily flows, sectoral indices + standalone index pages, market-breadth history, corporate-actions/earnings calendar, promoter-pledge, delivery%/VWAP/circuit bands, browsable gainers/losers/52w pages, mutual funds/ETFs, commodities/currency/bond yields, sector-relative scoring, peer-percentile normalization.
- **Phase 3 — Polish:** premium visual system, AI market narrative + streaming + response caching, richer technicals, accessibility.

---

*Phase 1 delivers a showcase that is navigable, secure, correct, and crash-free — the foundation the Expand and Polish phases build on.*
