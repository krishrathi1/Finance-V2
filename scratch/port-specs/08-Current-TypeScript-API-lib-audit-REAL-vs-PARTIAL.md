# Current TypeScript API + lib audit (REAL vs PARTIAL vs MOCK), response shapes, divergences from DashboardData, reusable helpers, catch-all behavior

## Finance-V2 Frontend (Next.js App Router) — Current Implementation Audit

All API routes live under `C:\Users\KRISH\Desktop\Finance-V2\frontend\app\api\v1\`. The frontend client wrapper is `C:\Users\KRISH\Desktop\Finance-V2\frontend\lib\api.ts`; the canonical UI contract is `DashboardData` in `C:\Users\KRISH\Desktop\Finance-V2\frontend\lib\types.ts`. There is **no Python/external backend in use** — these Next.js route handlers ARE the backend. `INTERNAL_API_BASE` / `NEXT_PUBLIC_API_BASE` are normally empty, so `getApiUrl()` produces same-origin relative paths that hit these very routes.

### Per-route classification

| Route file (under `frontend/app/api/v1/`) | Method | Class | What it does today | Response shape today |
|---|---|---|---|---|
| `stocks/[symbol]/dashboard/route.ts` | GET | **MOCK** | Returns hardcoded "ENERGY/Oil & Gas" object regardless of symbol. Ignores `?timeframe`, `?exchange`, `?refresh`. | `{ cached:false, data:{ symbol, exchange, profile:{companyName, sector, industry, marketCap, peRatio, ...}, quote:{cmp, change, ...}, candlesticks, smartScore:{score, aiExplanation, aiSource}, riskScore:{...}, technicals:{momentum,trend,support,resistance}, financials:{...flat ratios} } }` |
| `stocks/[symbol]/quote/route.ts` | GET | **REAL (fragile)** | Live `nseindia.com/api/quote-equity` + `results-comparision`. Derives marketCap, PE, EPS, NPM, EV/Sales. **No cookie priming** → frequently blocked by NSE. | Flat object: `{ symbol, companyName, industry, sector, lastPrice, open, close, previousClose, vwap, change, pChange, fiftytwoWeekHigh/Low(+dates), intraDayHigh/Low, upperCP, lowerCP, marketCapCr, peRatio, industryPE, pegRatio:null, bookValue:null, evToSales, roe:null, roce:null, roa:null, ebitdaMargin:null, netProfitMargin, eps, dividendYield, outstandingSharesCr, netProfit, profitBeforeTax, netSales, totalIncome, debtEquityRatio, faceValue, isin, listingDate, tradingStatus, timestamp }` |
| `stocks/[symbol]/chart/route.ts` | GET | **REAL (fragile/likely broken)** | Live NSE `GetSymbolChartData` via fabricated `SYMBOL+"EQN"` identifier and undocumented `NextApi` path. No cookie priming. Maps `[ts,price,...]` → `{date,close}`. | `{ identifier, name, graphData:[raw NSE arrays], history:[{date,close}], closePrice, timestamp }` |
| `stocks/[symbol]/quarterly-results/route.ts` | GET | **REAL (fragile)** | Live NSE `results-comparision`, maps `resCmpData[]` to clean keys. No cookie priming. | `{ symbol, bankNonBanking, results:[{period, endDate, startDate, type, netSales, netProfit, basicEPS, dilutedEPS, profitBeforeTax, ...ratios}], timestamp }` |
| `stocks/[symbol]/news/route.ts` | GET | **MOCK** | 4 fabricated articles with `example.com` URLs, templated titles using symbol. | `{ data:[{title, source, publishedAt, summary, url, imageUrl:null, sentimentScore}], symbol, timestamp }` |
| `stocks/[symbol]/swot/route.ts` | GET | **MOCK** | Static generic SWOT (same text for every symbol). Ignores `?refresh`. | `{ strengths[], weaknesses[], opportunities[], threats[], bullCase, bearCase }` (matches `fetchSwotAnalysis` shape; no `generatedAt`) |
| `stocks/[symbol]/chat/route.ts` | POST | **MOCK** | Echoes symbol into a canned string. Always `source:'fallback'`. | `{ answer, source:'fallback', symbol }` |
| `stocks/[symbol]/news-analysis/route.ts` | POST | **MOCK** | Canned overview/impact/watchpoint. | `{ overview, market_impact, watchpoint, source:'fallback' }` |
| `stocks/[symbol]/watchlist-analysis/route.ts` | GET | **MOCK** | Canned string. | `{ answer, source:'fallback' }` |
| `stocks/[symbol]/competitor-verdict/route.ts` | GET | **MOCK** | Canned verdict. | `{ verdict, analysis, source:'fallback' }` |
| `stocks/[symbol]/earnings-tldr/route.ts` | GET | **MOCK** | Canned summary + 3 highlights. | `{ summary, highlights[], source:'fallback' }` |
| `stocks/[symbol]/research-report/route.ts` | GET | **MOCK** | Canned report fields. | `{ title, report, recommendations, targetPrice, riskLevel, source:'fallback' }` |
| `stocks/[symbol]/health-check/route.ts` | GET | **MOCK** | Always healthy. | `{ symbol, status:'healthy', timestamp }` |
| `stocks/[symbol]/returns-projection/route.ts` | GET | **REAL (pure math)** | Compound-interest calc from `amount`/`cagr`/`years`. No external data; deterministic. | `{ investmentAmount, projectedValue, gain, cagr, years, disclaimer }` |
| `stocks/ticker/route.ts` | GET | **PARTIAL (real + mock fallback)** | Live **Yahoo Finance** spark API in 2 batches for 26 curated A–Z symbols; falls back to per-symbol simulated jitter on failure. Optional NIFTY/SENSEX via `nseProvider.getAllIndices()` with hardcoded fallback (SENSEX synthetically = Nifty×3.3). Ignores arbitrary `symbols` except NIFTY/SENSEX detection. | `{ data:[{symbol, cmp, change, changePercent, high, low}] }` |
| `stocks/index-heatmap/route.ts` | GET | **REAL (fragile)** | `nseProvider.getIndexHeatmap(index)`. 404 if NSE returns empty (no fallback). | `{ indexName, updatedAt, rows:[{symbol, cmp, change, changePercent, high, low}] }` |
| `stocks/market-news/route.ts` | GET | **REAL** | `newsProvider.getMarketNews()` (TheNewsAPI → NewsAPI → Google RSS → OG-image scrape, file-cached daily). Ignores `?refresh` (provider has its own cache). | `{ success:true, data:[{title, source, publishedAt, url, summary, imageUrl}] }` |
| `stocks/proxy-image/route.ts` | GET | **REAL (utility)** | Streams remote image via `?url=`; raw `split('url=')` parse; redirects to Unsplash placeholder on failure/non-image; 6s timeout; SSRF-relevant (only http/https checked). | Binary image stream OR 302 redirect to placeholder |
| `stocks/search/route.ts` | GET | **MOCK** | Filters a hardcoded 4-stock list by `?q`. | `{ results:[{symbol, name, exchange}] }` |
| `stocks/screener/route.ts` | GET | **MOCK** | Returns 2 hardcoded rows; **ignores all filters** (exchange/sector/PE/etc.). | `{ results:[{symbol, name, pe, pb, dividendYield, marketCap}] }` — note keys (`name`) **don't match** `ScreenerResult` (`companyName`, plus price/change/volume/roe/beta/industry) |
| `stocks/ipo/route.ts` | GET | **MOCK** | 1 hardcoded IPO. Ignores `?type` beyond echo. | `{ data:[{symbol, company, date, exchange, priceRange, shares, marketCap, actions}], type }` |
| `stocks/compare-analysis/route.ts` | POST | **MOCK** | Canned compare string. | `{ answer, source:'fallback' }` |
| `stocks/portfolio-risk/route.ts` | POST | **MOCK** | Canned risk fields; ignores submitted holdings. | `{ overallRisk, concentrationRisk, sectorConcentration, betaScore, recommendations[], source }` |
| `stocks/portfolio-roast/route.ts` | POST | **MOCK** | Canned roast fields; ignores holdings. | `{ analysis, positives[], concerns[], overallScore, source }` |
| `stocks/[...path]/route.ts` | GET/POST | **MOCK catch-all** | See below. | empty-data stubs or 404 |
| `auth/login/route.ts` | POST | **REAL** | `query('SELECT * FROM users…')` (JSON-file "db"), bcrypt verify, JWT access + sha256 refresh, sets httpOnly cookies. | User object `{id,email,name,tier,is_admin,is_banned,verified_email,created_at}` + Set-Cookie |
| `auth/register/route.ts` | POST | **REAL** | Insert user, hash pw, issue tokens, set cookies. | Same user object (201) + Set-Cookie |
| `auth/refresh/route.ts` | POST | **REAL** | Rotates refresh token (cookie `refresh_token` scoped to `/api/v1/auth/refresh`), re-issues access. `secure:true` hardcoded. | `{ access_token, token_type:'bearer' }` + Set-Cookie |
| `auth/logout/route.ts` | POST | **REAL** | Deletes refresh token, clears cookies. | `null` (204) |
| `auth/forgot-password/route.ts` | POST | **REAL (email may fail)** | Generates OTP, stores in `password_reset_tokens`, `sendOtpEmail` via nodemailer (SMTP env-dependent). Enumeration-safe. | `{ detail, message }` (200) |
| `auth/verify-otp/route.ts` | POST | **REAL** | Validates OTP, marks used, returns base64 `userId:timestamp` reset token (5-min). | `{ detail, resetToken, message }` |
| `auth/reset-password/route.ts` | POST | **REAL** | Validates reset token, updates pw hash, clears reset tokens. | `{ detail }` |
| `auth/[...path]/route.ts` | GET/POST | **MOCK catch-all** | Always 404 `{detail}`. | 404 |

### Catch-all `[...path]` behavior (important)

- **`stocks/[...path]/route.ts`**: GET checks `pathname.startsWith()` against a map and returns **empty stubs** for `/search` `{results:[]}`, `/index-heatmap` `{indexName:'NIFTY 50',rows:[]}`, `/market-news` `{data:[]}`, `/screener` `{results:[]}`, `/ipo` `{data:[]}`; everything else → 404 `{detail:"… not yet implemented"}`. POST is always 404. **In practice this catch-all is mostly shadowed** by the concrete routes above (Next.js prefers static/specific segments over catch-alls), so its stubs only fire for paths with no dedicated handler. The endpoints `api.ts` calls that have **no dedicated route and therefore hit the catch-all or 404**: `/screener/ai` (POST → 404, `fetchAIScreenerResults` throws), `/ipo/{symbol}/ai-analysis` (GET → 404, `fetchIpoAiAnalysis` returns its fallback), and `/parse-document` under the **`portfolio` type prefix** (`/api/v1/portfolio/parse-document` — no such directory exists at all → 404).
- **`auth/[...path]/route.ts`**: pure 404 fallback for unknown auth paths.

### Divergence: dashboard route vs `DashboardData` vs UI

The mock `dashboard/route.ts` payload is structurally **incompatible** with `DashboardData` and with the UI normalizer in `frontend/app/stocks/[symbol]/page.tsx` (`normalizeDashboardData`, lines ~127-246):

- UI expects **top-level** `companyName`, `sector`, `price{cmp,change,changePercent,currency,fiftyTwoWeekLow/High,aiTarget,history[],intraday[]}`, `metrics{}` (record), `returnsSummary[]`, `returnsHeatmap[]`, `financials.quarterly[]`/`yearly[]`/`incomeStatement[]`/`balanceSheet[]`/`cashFlow[]`/`growthSnapshot`/`keyRatioTrends`, `corporateActions{boardMeetings,dividends,bonus…}`, `documents{}`, `shareholding{}`, `competitors{table[],…}`, `news[]`, optional `brokerageResearch`.
- Mock route instead nests `companyName/sector/industry` under `profile`, supplies `quote` (not `price`), has **no** `history`, `metrics`, `returnsSummary`, `returnsHeatmap`, `financials.quarterly/yearly/statements`, `corporateActions`, `documents`, `shareholding`, `competitors`, or `news`. `smartScore`/`riskScore` lack `maxScore`/`dimensions`/`components`/`label`/`explanation`.
- Because `normalizeDashboardData` is heavily defensive (coalesces every missing field to 0 / "" / []), the page **won't crash** but renders an all-zero/empty dashboard with no price chart, no financials, no corporate actions. The real implementation must return the **full `DashboardData`** envelope `{ data, cached?, stale?, fallback?, warning? }` (see `DashboardEnvelope` in `api.ts`). The canonical, fully-populated reference shape already exists as `mockDashboard` in `frontend/lib/mock.ts` — this is the exact target structure to reproduce with live data.
- `api.ts` `fetchDashboardEnvelope` calls `/{symbol}/dashboard?timeframe=5Y&exchange=…[&refresh=true]`, expects `payload.data`, with 60s in-memory fresh cache, stale fallback, 2 attempts (15s then 20s+refresh). The route must honor `exchange` and `refresh`.

### Other client/route shape mismatches to fix when going REAL

- **Screener**: `fetchScreenerResults`/`fetchAIScreenerResults` expect `ScreenerResult` (`companyName`, `marketCap`, `price`, `change`, `changePercent`, `volume`, `sector`, `industry`, `pe`, `pb`, `roe`, `dividendYield`, `beta`). Route returns `{symbol,name,pe,pb,dividendYield,marketCap}` — missing most fields, wrong `name` key.
- **AI endpoints** all return `source:'fallback'`; `api.ts` only treats `source==='gemini'` as non-fallback, so a real Gemini integration must set `source:'gemini'`.
- **`/screener/ai`, `/ipo/{symbol}/ai-analysis`, `/portfolio/parse-document`** have **no route at all** (clients rely on fallback/throw).
- **`quote`/`chart`** return flat custom shapes consumed elsewhere (not the dashboard); they are real but lack NSE cookie priming and will be intermittently blocked.

### Summary counts

- **REAL**: 13 routes — quote, chart, quarterly-results, returns-projection, index-heatmap, market-news, proxy-image, login, register, refresh, logout, forgot-password, verify-otp, reset-password (reset-password = 14; counting auth = 7 real auth routes + quote/chart/quarterly/returns/heatmap/market-news/proxy-image = 7 stock real/utility).
- **PARTIAL**: 1 — ticker (Yahoo live + simulated fallback + NSE indices).
- **MOCK**: 17 — dashboard, news, swot, chat, news-analysis, watchlist-analysis, competitor-verdict, earnings-tldr, research-report, health-check, search, screener, ipo, compare-analysis, portfolio-risk, portfolio-roast, + both `[...path]` catch-alls.

### Reusable TS helpers to build on

| Helper | Location | Reuse for |
|---|---|---|
| `nseProvider` (`NSEProvider`) | `lib/providers/nse.ts` | **Has cookie priming** (`ensureCookies()` hits `nseindia.com` for `set-cookie`, 1h revalidate) + `getIndexHeatmap()`, `getAllIndices()`. The quote/chart/quarterly routes do their own un-primed NSE fetches and should be refactored onto this (and extended with `getQuote`/`getChart`/`getResults`). |
| `mapNSEQuoteData()` + `NSEDataMap` | `lib/nse-data-mapper.ts` | Maps raw NSE `quote-equity` JSON (info/metadata/securityInfo/priceInfo/industryInfo/preOpenMarket) into structured fields — directly usable to populate dashboard `price`/`metrics`/`profile`/classification. |
| `newsProvider` (`NewsProvider`) | `lib/providers/news.ts` | Multi-source news (TheNewsAPI/NewsAPI/Google-RSS) + OG-image scraping + daily file cache; reuse for per-symbol news too. |
| `getIndianMarketStatus()` | `lib/market-status.ts` | IST market open/closed + holiday calendar (NSE 2026) — for live/closed badges and deciding intraday vs EOD fetch. |
| `mockDashboard` | `lib/mock.ts` | Canonical fully-shaped `DashboardData` — use as the exact target structure / fallback payload for the real dashboard route. |
| `query()` / `getConnection()` | `lib/db.ts` | JSON-file pseudo-DB with `?`-placeholder MySQL-like dispatch (users, refresh_tokens, password_reset_tokens; watchlists/portfolios tables declared but **no query handlers yet**). Swap to real DB later by replacing this module only. |
| `hashPassword/verifyPassword/createAccessToken/createRefreshToken/verifyAccessToken/getAccessTokenFromRequest` | `lib/auth-utils.ts` | bcrypt + jose HS256 JWT (`JWT_SECRET_KEY`, 30m access) + sha256 refresh. `getAccessTokenFromRequest` parses the `access_token` cookie for protecting new routes. |
| `initializeDatabase()` | `lib/init-schema.ts` | DDL strings (no-ops against JSON db) incl. watchlists/portfolios/premium_requests schemas. |
| `sendOtpEmail/sendWelcomeEmail` | `lib/email.ts` | nodemailer transporter (SMTP_* env). |
| `api.ts` client + `DashboardEnvelope` | `lib/api.ts` | All client fetchers (timeout, in-memory fresh/stale cache, envelope) — the **contract** any new route must satisfy. |
| `fetchWithTimeout` / cache helpers | `lib/api.ts` (not exported) | Pattern for AbortController + memory cache; mirror server-side. |
| `format*`, `seo.ts`, `utils.ts` | `lib/format.ts`, etc. | Display formatting. |
| Client-only stores | `lib/watchlist.ts`, `lib/portfolio.ts`, `lib/alerts.ts` | **localStorage-based** (no server persistence) — watchlist/portfolio/alerts currently never touch the DB despite tables existing. |


## External APIs

### NSE quote-equity
- URL: `https://www.nseindia.com/api/quote-equity?symbol={SYMBOL_UPPER}`
- GET. Used by stocks/[symbol]/quote (un-primed) and is the source mapNSEQuoteData expects. Headers used by lib/providers/nse.ts (the good path): user-agent Chrome, accept-language, accept application/json, referer https://www.nseindia.com/, x-requested-with XMLHttpRequest, plus Cookie from ensureCookies(). Response: priceInfo{lastPrice,open,close,previousClose,vwap,change,pChange,weekHighLow{max,min,maxDate,minDate},intraDayHighLow{max,min},upperCP,lowerCP,pPriceBand,lowerCP}, metadata{pdSymbolPe,pdSectorPe,listingDate,pdSectorInd,pdSectorIndAll}, securityInfo{faceValue,issuedSize,tradingStatus,boardStatus,derivatives,slb}, info{companyName,isin,symbol,listingDate}, industryInfo{macro,sector,industry,basicIndustry}, preOpenMarket{IEP,finalPrice,...}. Routes that fetch it WITHOUT cookie priming get blocked intermittently.

### NSE results-comparision
- URL: `https://www.nseindia.com/api/results-comparision?symbol={SYMBOL_UPPER}`
- GET. Used by quarterly-results and as financial-metric source in quote. Response: resCmpData[]{re_from_dt,re_to_dt,re_create_dt,re_res_type,re_net_sale,re_net_profit,re_basic_eps_for_cont_dic_opr,re_dilut_eps_for_cont_dic_opr,re_pro_loss_bef_tax,re_staff_cost,re_depr_und_exp,re_int_new,re_rawmat_consump,re_oth_tot_exp,re_total_inc,re_oth_inc_new,re_curr_tax,re_deff_tax,re_oth_exp,re_debt_eqt_rat,re_int_ser_cov,re_debt_ser_cov,...}, bankNonBnking. No cookie priming today.

### NSE GetSymbolChartData (NextApi)
- URL: `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolChartData&symbol={SYMBOL_UPPER}EQN&days={1W|1M|...}`
- GET. Used by stocks/[symbol]/chart. Fabricates identifier SYMBOL+'EQN' and uses an undocumented NextApi path — likely broken/unstable. Response: grapthData (typo) or graphData = array of [timestamp, price, status, null, null]; closePrice. No cookie priming.

### NSE equity-stockIndices
- URL: `https://www.nseindia.com/api/equity-stockIndices?index={INDEX_NAME}`
- GET via nseProvider.getIndexHeatmap. Headers + Cookie from ensureCookies (next.revalidate 60). Response data[]{symbol,lastPrice,change,pChange,dayHigh,dayLow}; filters out index row itself and cmp<=0; sorts by pChange desc.

### NSE allIndices
- URL: `https://www.nseindia.com/api/allIndices`
- GET via nseProvider.getAllIndices (cookie-primed). Response data[]{index,last,variation,percentChange}. Used by ticker route for NIFTY 50 (and synthetic SENSEX = nifty*3.3).

### NSE homepage (cookie priming)
- URL: `https://www.nseindia.com`
- GET, next.revalidate 3600. Sole purpose: capture set-cookie header for subsequent NSE API calls. Implemented ONLY inside nseProvider.ensureCookies(); the quote/chart/quarterly routes bypass it (their main fragility).

### Yahoo Finance Spark
- URL: `https://query1.finance.yahoo.com/v7/finance/spark?symbols={SYM.NS,...}&range=1d&interval=1d&indicators=close`
- GET, Chrome UA, next.revalidate 30. Used by ticker route in 2 batches (<=13 symbols each to avoid HTTP 400). Reads spark.result[].response[0].meta.{regularMarketPrice,chartPreviousClose,regularMarketDayHigh,regularMarketDayLow}. Falls back to simulated jitter per symbol on failure.

### TheNewsAPI
- URL: `https://api.thenewsapi.com/v1/news/all?search={Q}&locale=in&language=en&categories=business&domains={domains}&published_after=2026-04-12&sort=published_at&limit=8&api_token={THE_NEWS_API_KEY}`
- GET, primary news source. 5 parallel topic queries; domains=moneycontrol,economictimes,livemint,reuters,businesstoday,ndtvprofit. Response data[]{title,source,published_at,url,snippet|description,image_url}. NOTE hardcoded published_after=2026-04-12.

### NewsAPI.org
- URL: `https://newsapi.org/v2/everything?q={Q}&from={ISO}&sortBy=publishedAt&language=en&pageSize=10&apiKey={NEWS_API_KEY}`
- GET, secondary fallback (only if TheNewsAPI yields <3). 3 queries. Response articles[]{title,source.name,publishedAt,url,description,urlToImage}.

### Google News RSS
- URL: `https://news.google.com/rss/search?q={Q}&hl=en-IN&gl=IN&ceid=IN:en`
- GET, tertiary fallback (if still <3). Manual regex RSS parse (parseRSS) splitting on <item>; extracts title/link/pubDate/description/source/img; caps 20.

### OG-image scraper
- URL: `{article.url} (follows redirects, esp. Google News)`
- GET inside newsProvider.fetchOgImage; Chrome UA, redirect:follow, 4.5s timeout. Regex-extracts og:image then twitter:image; skips google.com finals and bad/relative/tracker URLs; else MARKET_PLACEHOLDER (Unsplash). Only top-5 imageless articles scraped.

### Image proxy target
- URL: `/api/v1/stocks/proxy-image?url={ENCODED_URL}`
- Internal route streaming remote images; raw split('url=') parse (avoids truncation), http/https only, 6s timeout, 302 to Unsplash placeholder on failure/non-image. Adds Cache-Control + ACAO:*.

### SMTP (nodemailer)
- URL: `smtp://{SMTP_SERVER:mail.voreva.in}:{SMTP_PORT:587}`
- lib/email.ts transporter, secure:false, auth SMTP_EMAIL/SMTP_PASSWORD. sendOtpEmail/sendWelcomeEmail. Failures swallowed (return false), so forgot-password still 200s.


## Gotchas
- The Next.js route handlers ARE the backend — INTERNAL_API_BASE/NEXT_PUBLIC_API_BASE are normally empty, so api.ts hits these same-origin routes. There is no separate Python service in play for these endpoints.
- The dashboard route is fully MOCK and its shape (profile.companyName, quote{}, flat smartScore/riskScore) is incompatible with DashboardData (top-level companyName, price{}, metrics{}, returnsSummary, corporateActions, etc.). normalizeDashboardData in app/stocks/[symbol]/page.tsx coalesces all missing fields to 0/''/[] so the page renders empty but never crashes — making the mock easy to miss.
- lib/mock.ts mockDashboard is the canonical, complete DashboardData shape and the exact target for a real dashboard implementation / fallback payload.
- NSE cookie priming exists ONLY in nseProvider.ensureCookies(); quote, chart, and quarterly-results routes fetch NSE directly without it and are therefore intermittently blocked. Refactor them onto nseProvider (extend it with getQuote/getChart/getResults).
- The chart route builds a fabricated identifier (SYMBOL+'EQN') and calls an undocumented /api/NextApi/... path, and even handles a 'grapthData' typo key — it is likely already broken; do not trust it as a working reference.
- Screener route returns {symbol,name,pe,pb,dividendYield,marketCap} but ScreenerResult requires companyName + price/change/changePercent/volume/sector/industry/roe/beta — wrong key (name) and missing fields. It also ignores ALL filter query params.
- Three client-called endpoints have NO route handler: POST /screener/ai (fetchAIScreenerResults throws), GET /ipo/{symbol}/ai-analysis (fetchIpoAiAnalysis silently returns fallback), and /api/v1/portfolio/parse-document (api.ts uses type='portfolio' prefix; no portfolio directory exists → 404).
- All AI routes hardcode source:'fallback'; api.ts treats only source==='gemini' as a real answer. A real LLM integration MUST return source:'gemini' or the UI shows fallback styling.
- The stocks/[...path] catch-all returns empty stubs for /search,/index-heatmap,/market-news,/screener,/ipo but is shadowed by the concrete routes — its stubs only fire where no dedicated route exists; POST always 404s.
- lib/db.ts is a JSON file (db.json) faking MySQL via regex on ? placeholders. It only implements users/refresh_tokens/password_reset_tokens. watchlists & portfolios tables are declared in init-schema.ts but have NO query handlers and fall through to return [] — server-side watchlist/portfolio persistence does not work yet.
- watchlist.ts, portfolio.ts, alerts.ts are 100% client-side localStorage; they never call the DB despite the schema existing. Migrating to server persistence requires new routes + db.ts query handlers.
- auth/refresh hardcodes cookie secure:true (breaks over plain HTTP/localhost) whereas login/register gate secure on NODE_ENV==='production' — inconsistent.
- ticker route ignores arbitrary ?symbols except detecting NIFTY/SENSEX substrings; SENSEX is synthetically derived as Nifty50*3.3 (not real data).
- TheNewsAPI query has a hardcoded published_after=2026-04-12 date that will stale over time.
- proxy-image uses raw request.url.split('url=')[1] and only validates http/https protocol — a potential SSRF vector to lock down when hardening.
- market-news route ignores ?refresh; the NewsProvider has its own once-per-day file cache (cache/market_news.json), so 'force refresh' from the client is a no-op server-side.
- reset flow uses a base64 userId:timestamp 'reset token' (not signed) — fine functionally but weak; verify-otp returns it and reset-password re-validates the 5-min window.