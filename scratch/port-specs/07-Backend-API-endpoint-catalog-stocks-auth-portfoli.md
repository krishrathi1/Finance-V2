# Backend API endpoint catalog — stocks, auth, portfolio, admin endpoints + auth_service & email_service

## Backend API Endpoint Catalog

All routers mounted under `/api/v1` (per CLAUDE-described structure; refresh cookie path `/api/v1/auth/refresh` confirms prefix). Per-router prefixes shown below.

---

## 1. Stocks router (`backend/app/api/v1/endpoints/stocks.py`)

`router = APIRouter(prefix="/stocks", tags=["stocks"])`. All responses are plain `dict` unless a `response_model` is declared. Module singletons: `dashboard_service = StockDashboardService()`, `ai_adapter = AIAdapter()`, `redis_cache` (from `app.core.cache`), `settings = get_settings()`. `IST = UTC+5:30`.

### GET `/stocks/search`
- Query: `q: str` (default `""`, min_length 0, max_length 50).
- Calls `dashboard_service.search_stocks(q)`.
- Response: `{"results": <list>}`. No caching.

### GET `/stocks/ticker`
- Query: `symbols: str` (default `""`, max_length 5000, comma-separated → uppercased list), `refresh: bool` (default False).
- Cache key `ticker:{joined symbols or "default"}`. If cached present → returns `{"cached": True, "data": cached}` (returns cached even when `refresh=True` — known behavior to avoid hammering).
- On miss: `dashboard_service.get_ticker_tape(symbol_list or None)`, caches with TTL 15s → `{"cached": False, "data": data}`. On exception with stale cache → `{"cached": True, "stale": True, "data": cached}` else re-raises.

### GET `/stocks/index-heatmap`
- Query: `index: str` (default `"NIFTY 50"`, min_length 1, max_length 80), `refresh: bool` (default False).
- Cache key `index-heatmap:{INDEX_UPPER}`, stale key `index-heatmap:last:{INDEX_UPPER}`.
- Hit → `{"cached": True, **cached}` (spreads payload, which contains `rows`).
- Miss → `dashboard_service.get_index_heatmap(normalized)`; if `rows` truthy caches (TTL 30s; stale TTL 7d) → `{"cached": False, **payload}`. If no rows but stale exists → `{"cached": True, "stale": True, **stale}`, else `{"cached": False, **payload}`.

### GET `/stocks/market-news`
- Query: `refresh: bool` (default False).
- Cache key `market-news:latest`, stale key `market-news:last`. Cached payload shape: `{"date", "items": [...], "fetchedAt": iso}`.
- Returns `{"cached": bool, "date": str, "data": <items list>}`, sometimes with `"stale": True`. Background refresh via `asyncio.create_task(_refresh_market_news_cache(...))` when items older than 600s or stale. Fresh fetch: `dashboard_service.get_market_news()`; on success caches latest (TTL 30h) + stale (TTL 7d). Final fallback returns `{"cached": False, "date": today, "data": []}`.

### GET `/stocks/screener`
- Query: `exchange` (default "NSE"), `sector` (""), `industry` (""), `market_cap_min` (float 0), `market_cap_max` (0), `pe_min` (0), `pe_max` (0), `price_min` (0), `price_max` (0), `dividend_min` (0), `volume_min` (0), `limit: int` (default 100, ge 1, le 500).
- Cache key `screener:v4:{md5 of param_str}`. Hit (with results) → `{"results", "count", "cached": True}`.
- Calls `dashboard_service.screen_stocks(exchange, sector, industry, market_cap_min, market_cap_max, price_min, price_max, volume_min, dividend_min, pe_min, pe_max, limit)`. Caches results (TTL 300s) when non-empty → `{"results", "count": len(results), "cached": False}`.
- On exception: returns cached if present, else `HTTPException 502` `"Screener data unavailable: {exc}"`.

### GET `/stocks/screener/sectors`
- No params. Cache key `screener:sectors`. Returns `{"sectors": <list>, "cached": bool}`. On miss caches hardcoded `INDIAN_SECTORS` (11 sectors) for 24h.

### GET `/stocks/ipo/{symbol}/ai-analysis`
- Path: `symbol`. Cache key `ipo_ai:{SYMBOL_UPPER}`. Hit → `{"symbol", "cached": True, **cached}`.
- Loads IPO context via `MarketDataProviders().get_ipo_calendar(from_date=today-180d, to_date=today+180d)`, matches symbol. Calls `ai_adapter.generate_ipo_analysis(symbol, company, ipo_data)` (15s timeout, then retried without timeout on exception). Caches TTL 3600s → `{"symbol", "cached": False, **analysis}`.

### GET `/stocks/ipo`
- Query: `type: str` (default "upcoming"). Cache key `ipo:{type}:{today}`. Hit → `{"type", "data": cached, "cached": True}`.
- `type=="recent"` → `MarketDataProviders().get_ipo_recent()`; else `get_ipo_calendar(from_date=today, to_date=today+90d)`. Caches TTL 1800s → `{"type", "data", "cached": False}`. On exception → `HTTPException 502` `"IPO data unavailable: {exc}"`.

### POST `/stocks/screener/ai`
- Body `AIScreenerRequest`: `{ "query": str }`. Empty → `HTTPException 422` `"Query is required"`.
- `ai_adapter.parse_screener_query(query)` → param dict; then `dashboard_service.screen_stocks(...)`. On exception → `HTTPException 502` `"Screener error: {exc}"`.
- Response: `{"query", "parsedFilters": params, "results", "count": len(results)}`.

### POST `/stocks/portfolio-risk`
- Body `PortfolioRiskRequest`: `{ "holdings": [PortfolioHolding{symbol:str, quantity:float, buyPrice:float, currentPrice:float|None, sector:str|None, beta:float|None}] }`. Empty → `HTTPException 422` `"At least one holding is required"`.
- Computes `total_invested`, `total_current`, per-holding `weight`; calls `ai_adapter.analyze_portfolio_risk(enriched, [])`.
- Response: `{"totalInvested", "totalCurrentValue", "totalPnl", "holdingCount", "analysis"}`.

### POST `/stocks/portfolio-roast`
- Body `PortfolioRoastRequest`: `{ "holdings": [PortfolioRoastHolding{symbol, quantity, avgPrice, currentValue:float|None, pnl:float|None}], "totalValue": float|None }`. Empty → `HTTPException 422` `"No holdings provided"`.
- Calls `ai_adapter.roast_portfolio(holdings_dicts, total)`.
- Response: `{"holdings": count, "totalValue", "roast": result}`.

### GET `/stocks/{symbol}/competitor-verdict`
- Path `symbol`. Cache key `comp_verdict:{SYMBOL_UPPER}`. Hit → `{"symbol", "cached": True, **cached}`.
- `dashboard_service.get_dashboard(symbol)` → extracts `metrics`, `competitors.table` (peers); `ai_adapter.generate_competitor_verdict(symbol, stock_metrics, peers)`. Caches TTL 3600s → `{"symbol", "cached": False, **verdict}`. Exception → `HTTPException 502`.

### GET `/stocks/{symbol}/earnings-tldr`
- Path `symbol`. Cache key `earnings_tldr:{SYMBOL_UPPER}`. Hit → `{"symbol", "cached": True, **cached}`.
- `get_dashboard` → quarterly financials (consolidated/standalone/quarterly fallback) + company name; `ai_adapter.generate_earnings_tldr(symbol, quarterly_data, company_name)`. Caches TTL 7200s. Exception → `HTTPException 502`.

### GET `/stocks/{symbol}/swot`
- Path `symbol`; Query `refresh: bool` (default False). Cache key `swot:{SYMBOL_UPPER}`. Hit (non-refresh) → `{"symbol", "cached": True, **cached}`.
- Fresh: `get_dashboard` (20s timeout) → context; `ai_adapter.generate_swot(symbol, context)` (15s timeout), falls back to `ai_adapter._fallback_swot(...)`. `source` = "gemini" if `settings.gemini_api_key` set else "fallback". Result `{**swot, "source", "generatedAt": epoch}` cached TTL 3600s → `{"symbol", "cached": False, **result}`.

### GET `/stocks/{symbol}/dashboard`
- Path `symbol`; Query `timeframe: str` (default "5Y"), `refresh: bool` (default False), `exchange: str` (default "NSE", uppercased).
- Cache key `dashboard:{SYMBOL_UPPER}:{timeframe}:{EXCHANGE}`, stale key `dashboard:last:...`.
- Hit: enriches via `_enrich_score_explanations(allow_gemini=False)`; if `_dashboard_needs_ai_refresh` spawns background `_refresh_dashboard_cache`; re-caches (TTL `settings.cache_ttl_seconds`; stale 7d) → `{"cached": True, "data": cached}`.
- Miss: `dashboard_service.get_dashboard(symbol, timeframe, exchange)` (12s timeout) → enrich → cache → `{"cached": False, "data": data}`; spawns background gemini refresh if key set.
- On exception/timeout: serves stale (`{"cached": True, "stale": True, "data": stale}`) or `get_sample_dashboard(symbol)` fallback (`{"cached": True, "stale": True, "fallback": True, "warning": "...", "data": fallback}`). Always spawns background refresh.

### POST `/stocks/{symbol}/chat`
- `response_model=ChatResponse`. Path `symbol`; Body `ChatRequest` (has `.question`).
- `get_dashboard` → `ai_adapter.chat(symbol, question, context)` → `(answer, source)`. Response `ChatResponse(answer, source)`.

### GET `/stocks/{symbol}/watchlist-analysis`
- `response_model=ChatResponse`. Path `symbol`. Cache key `watchlist-analysis:{SYMBOL_UPPER}`. Hit → `ChatResponse` from cached `{answer, source}`.
- `get_dashboard` (20s timeout; sample fallback on exception) → `ai_adapter.generate_watchlist_review(symbol, context)`. Caches `{answer, source}` TTL 1800s.

### POST `/stocks/compare-analysis`
- `response_model=ChatResponse`. Body `CompareAnalysisRequest` (`.symbol_a`, `.symbol_b`). Validates both present (`422` "Both symbols are required") and different (`422` "Choose two different symbols").
- Cache key `compare-analysis:{A}:{B}`. Loads both dashboards (20s timeout each, sample fallback) concurrently via `asyncio.gather`; `ai_adapter.generate_compare_analysis(symbol_a, symbol_b, context_a, context_b)`. Caches TTL 1800s.

### POST `/stocks/{symbol}/news-analysis`
- `response_model=NewsAnalysisResponse`. Path `symbol`; Body `NewsAnalysisRequest` (`.title`, `.summary`, `.source`, `.published_at`, `.sentiment_score`).
- `get_dashboard` (20s timeout; `{symbol}` context fallback) → `ai_adapter.analyze_news(symbol, article={title,summary,source,publishedAt,sentimentScore}, context)` → `(analysis, source)`. Response `NewsAnalysisResponse(source=source, **analysis)`.

### GET `/stocks/{symbol}/research-report`
- `response_model=ReportResponse`. Path `symbol`. `get_dashboard` → `ai_adapter.generate_report(symbol, context)`. Response `ReportResponse(symbol=SYMBOL_UPPER, report_markdown=report)`.

### GET `/stocks/{symbol}/returns-projection`
- Path `symbol`; Query `amount: float` (required, gt 0), `cagr: float` (required, ge 0 le 100), `years: int` (required, ge 1 le 40).
- Pure compute (compound growth). Response `{"symbol", "amount", "cagr", "years", "futureValue", "series": [{"year","value"}...]}`. No service call.

### GET `/stocks/{symbol}/health-check`
- Path `symbol`. Empty/whitespace → `HTTPException 400` "Invalid symbol". Response `{"symbol": SYMBOL_UPPER, "status": "ok"}`.

---

## 2. Auth router (`backend/app/api/v1/endpoints/auth.py`)

`router = APIRouter(prefix="/auth", tags=["authentication"])`. DB via `Depends(get_db_session)` (`AsyncSession`). Uses models `User`, `RefreshToken`, `PremiumRequest`.

### POST `/auth/register`
- `response_model=UserOut`, `status_code=201`. Body `RegisterRequest` (`email`, `name`, `password`).
- DB: `SELECT User WHERE email==body.email`; if exists → `HTTPException 400` "Email already registered". Creates `User(email, name, password_hash=hash_password(password), tier="free", is_admin=False, is_banned=False, verified_email=False)`, `db.add` + `db.flush()` (to get id).
- `create_verification_token(user.id)` → `send_verification_email(user.email, v_token)` → `db.commit()`.
- Token issuance: `create_access_token(user.id, is_admin, tier)`; `create_refresh_token()` → `(raw_refresh, refresh_hash)`. Stores `RefreshToken(user_id, token_hash=refresh_hash, expires_at=utcnow + refresh_token_expire_days)`, `db.add` + `db.commit()`.
- Cookies (httponly; `secure = app_env != "development"`; samesite lax): `access_token` (path `/`, max_age `access_token_expire_minutes*60`), `refresh_token` (path `/api/v1/auth/refresh`, max_age `refresh_token_expire_days*86400`).
- Returns `User` (serialized as `UserOut`).

### POST `/auth/login`
- `response_model=UserOut`. Body `LoginRequest` (`email`, `password`).
- DB: `SELECT User WHERE email`. If not found OR `verify_password` fails → `HTTPException 401` "Invalid email or password". If `user.is_banned` → `HTTPException 403` "This account has been banned".
- Issues access + refresh tokens, stores `RefreshToken`, commits, sets same two cookies as register. Returns `User`.

### POST `/auth/refresh`
- `response_model=TokenOut`. Reads `refresh_token` from Cookie (alias `refresh_token`). DB session injected.
- Missing cookie → `401` "Refresh token missing". Hashes cookie `sha256` → `SELECT RefreshToken WHERE token_hash`. Not found → `401` "Invalid refresh token". Expired (`expires_at < utcnow`) → delete row, commit, `401` "Refresh token expired".
- `SELECT User WHERE id==refresh_obj.user_id`; missing/banned → `401` "User not found or banned".
- Rotation (sliding window): new access token + new refresh token; `db.delete(old)`, add new `RefreshToken`, commit. Sets new cookies (NOTE: here `secure=True` hardcoded, unlike register/login which compute `secure`).
- Returns `{"access_token": access_token, "token_type": "bearer"}`.

### POST `/auth/logout`
- `status_code=204`. Depends `get_current_user`; reads `refresh_token` Cookie.
- If cookie present: sha256 → `SELECT RefreshToken WHERE token_hash`; if found `db.delete` + commit. Clears `access_token` (path `/`) and `refresh_token` (path `/api/v1/auth/refresh`) cookies. Returns None.

### GET `/auth/me`
- `response_model=UserOut`. Depends `get_current_user`. Returns the current `User`.

### POST `/auth/premium-request`
- `response_model=PremiumRequestOut`, `status_code=201`. Body `PremiumRequestCreate` (`reason`). Depends `get_current_user`.
- DB: `SELECT PremiumRequest WHERE user_id==current_user.id AND status=="pending"`; if exists → `400` "You already have a pending premium request". Creates `PremiumRequest(user_id, reason, status="pending")`, add + commit. Returns the request.

### GET `/auth/premium-request`
- `response_model=PremiumRequestOut | None`. Depends `get_current_user`.
- DB: `SELECT PremiumRequest WHERE user_id ORDER BY requested_at DESC` → `scalar_one_or_none()`. Returns latest request or None.

### GET `/auth/verify-email`
- Query: `token: str`. Calls `verify_email_token(token)` → `user_id` (raises `400` on bad/expired token). DB: `SELECT User WHERE id==user_id`; missing → `404` "User not found".
- If `user.verified_email` already True → `{"msg": "Email already verified"}`. Else sets `verified_email=True`, commit → `{"msg": "Email successfully verified"}`.

---

## 3. Portfolio router (`backend/app/api/v1/endpoints/portfolio.py`)

`router = APIRouter()` (NO prefix in file — mounted prefix decided by aggregator). Singleton `ai_adapter = AIAdapter()`. NOTE: This file contains NO DB/watchlist operations — it is a document-parsing endpoint only.

### POST `/parse-document`
- Multipart: `file: UploadFile = File(...)`.
- Detects type by filename suffix: `.pdf` (pdfplumber extracts text per page), `.docx` (python-docx paragraphs), `.txt`/`.csv` (decode utf-8, fallback latin-1). Unsupported → `HTTPException 400` "Unsupported file format...". Empty text → `400` "The document appears to be empty...".
- Calls `ai_adapter.parse_portfolio_document(text[:12000])` (truncated to 12k chars).
- Response: `{"success": True, "filename": file.filename, "holdings": holdings}`. Generic exception → `HTTPException 500` "Failed to process document: {e}".

---

## 4. Admin router (`backend/app/api/v1/endpoints/admin.py`)

`router = APIRouter(prefix="/admin", tags=["admin"])`. Every route depends on `require_admin` (403 if not admin; 401 if unauthenticated). Models: `User`, `PremiumRequest`, enums `UserTier`, `PremiumRequestStatus`.

### GET `/admin/stats`
- Depends `require_admin`. DB: 4 `SELECT func.count(...)` queries — total users, premium users (`tier==UserTier.premium`), pending requests (`status==PremiumRequestStatus.pending`), banned users (`is_banned==True`).
- Response: `{"total_users", "premium_users", "free_users" (total-premium), "pending_requests", "banned_users"}`.

### GET `/admin/users`
- `response_model=dict`. Query: `page: int` (default 1, ge 1), `limit: int` (default 50, ge 1 le 100), `search: str` (""), `tier: str|None`.
- DB: `SELECT User`; if search → `WHERE email ILIKE %search% OR name ILIKE %search%`; if tier in {"free","premium"} → `WHERE tier==tier`. Separate count query with same filters. `ORDER BY created_at DESC OFFSET (page-1)*limit LIMIT limit`.
- Response: `{"users": [UserOut...], "total", "page", "limit", "pages": ceil(total/limit)}`.

### GET `/admin/users/{user_id}`
- `response_model=UserOut`. Path `user_id: int`. DB: `SELECT User WHERE id`; missing → `404` "User not found". Returns User.

### PATCH `/admin/users/{user_id}/ban`
- Returns `UserOut` (no `response_model` declared; return-annotated). Path `user_id: int`.
- DB: `SELECT User WHERE id`; missing → `404`. If `user.is_admin` → `400` "Cannot ban admin users". Toggles `is_banned = not is_banned`, sets `updated_at=utcnow`, commit. Returns user.

### PATCH `/admin/users/{user_id}/tier`
- Returns `UserOut`. Path `user_id: int`; Body `dict` with `tier` field. Tier not in {"free","premium"} → `400` "Tier must be 'free' or 'premium'".
- DB: `SELECT User WHERE id`; missing → `404`. Sets `user.tier=tier`, `updated_at=utcnow`, commit. Returns user.

### GET `/admin/premium-requests`
- `response_model=dict`. Query: `status` (alias of `status_filter: str|None`), `page: int` (1, ge 1), `limit: int` (50, ge 1 le 100).
- DB: `SELECT PremiumRequest ORDER BY requested_at DESC`; if status_filter in {"pending","approved","rejected"} → `WHERE status==filter`. Count query w/ same filter. `OFFSET LIMIT`. Then per request: `SELECT User WHERE id==req.user_id` (N+1 pattern).
- Response: `{"requests": [{"request": PremiumRequestOut, "user": UserOut|None}...], "total", "page", "limit", "pages"}`.

### PATCH `/admin/premium-requests/{request_id}/approve`
- Returns `dict`. Path `request_id: int`. Depends `require_admin` (as `admin_user`).
- DB: `SELECT PremiumRequest WHERE id`; missing → `404` "Request not found". If `status != "pending"` → `400` "Cannot approve {status} request". `SELECT User WHERE id==req.user_id`; missing → `404`.
- Updates: `req.status="approved"`, `req.processed_at=utcnow`, `req.processed_by=admin_user.id`; `user.tier="premium"`, `user.updated_at=utcnow`; single commit.
- Response: `{"request": PremiumRequestOut, "user": UserOut}`.

### PATCH `/admin/premium-requests/{request_id}/reject`
- Returns `dict`. Path `request_id: int`. Depends `require_admin` (`admin_user`).
- DB: `SELECT PremiumRequest WHERE id`; missing → `404`. If `status != "pending"` → `400` "Cannot reject {status} request". Sets `req.status="rejected"`, `processed_at=utcnow`, `processed_by=admin_user.id`, commit.
- Response: `{"request": PremiumRequestOut}`.

---

## 5. Auth service (`backend/app/services/auth_service.py`)

- **Password hashing**: `pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")`. `hash_password(plain)` → argon2 hash. `verify_password(plain, hashed)` → bool. (Argon2 chosen for Python 3.13+ support.)

- **`create_access_token(user_id, is_admin, tier)`**: JWT. Claims `{"sub": str(user_id), "admin": is_admin, "tier": tier, "exp": utcnow + access_token_expire_minutes}`. Signed `jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)`. (Library: python-jose `jose.jwt`.)

- **`create_refresh_token()`** → `(raw_token, sha256_hash)`. `raw_token = secrets.token_urlsafe(48)`; hash = `hashlib.sha256(raw.encode()).hexdigest()`. Only the hash is stored in DB; raw goes in the cookie. Refresh tokens are opaque random strings, NOT JWTs.

- **`get_current_user(access_token: Cookie(alias="access_token"), db)`**: FastAPI dependency. Missing token → `401` "Not authenticated" (`WWW-Authenticate: Bearer`). Decodes `jwt.decode(token, jwt_secret_key, algorithms=[jwt_algorithm])`; `user_id = int(payload["sub"])`. On `JWTError/KeyError/ValueError/TypeError` → 401. DB: `SELECT User WHERE id==user_id`; if missing or `is_banned` → 401. Returns User.

- **`require_admin(current_user=Depends(get_current_user))`**: if `not current_user.is_admin` → `403` "Admin access required". Else returns user.

- **`create_verification_token(user_id)`**: JWT, claims `{"sub": str(user_id), "type": "email_verification", "exp": utcnow + 24 hours}`, same secret/algorithm.

- **`verify_email_token(token)`** → `user_id: int`. Decodes JWT; if `payload["type"] != "email_verification"` raises ValueError → caught → `400` "Invalid or expired verification token". Returns `int(payload["sub"])`. Same exception group → 400.

**JWT summary**: single symmetric secret `settings.jwt_secret_key`, algorithm `settings.jwt_algorithm` (e.g. HS256). Access token expiry `access_token_expire_minutes`. Refresh tokens: opaque, sha256-hashed in DB, expiry `refresh_token_expire_days`, rotated on each refresh. Email-verification JWT: separate token with `type` claim, 24h expiry.

---

## 6. Email service (`backend/app/services/email_service.py`)

- **`send_verification_email(email, token)`** → bool. Builds `verification_link = f"{settings.frontend_url}/verify-email?token={token}"`.
- Creates `MIMEMultipart("alternative")`: Subject "Verify your email - Stock Vision", From `f"Stock Vision <{settings.smtp_email}>"`, To `email`. Attaches plain-text + HTML parts (branded HTML with the verify link/button).
- SMTP send: `smtplib.SMTP(settings.smtp_server, settings.smtp_port)` → `server.starttls()` → `server.login(settings.smtp_email, settings.smtp_password)` → `server.sendmail(settings.smtp_email, email, message.as_string())`. Logs success/failure. Returns `True` on success, `False` on any exception (errors swallowed, never raised — so a registration won't fail if email send fails).
- Uses settings: `frontend_url`, `smtp_server`, `smtp_port`, `smtp_email`, `smtp_password`.

## External APIs

### SMTP (verification email)
- URL: `smtplib.SMTP({settings.smtp_server}, {settings.smtp_port})`
- STARTTLS upgrade then login(smtp_email, smtp_password); sendmail(from=smtp_email, to=user_email, MIMEMultipart 'alternative' with text+HTML). From header 'Stock Vision <smtp_email>'. Verification link {frontend_url}/verify-email?token={jwt}. Errors are caught and logged; returns bool (True/False), never raises. Defined in email_service.send_verification_email.

### Gemini (via AIAdapter)
- URL: `(indirect — AIAdapter methods, gated on settings.gemini_api_key)`
- Not called over HTTP directly in these files. ai_adapter methods used: search_stocks N/A; parse_screener_query, analyze_portfolio_risk, roast_portfolio, generate_competitor_verdict, generate_earnings_tldr, generate_swot (+_fallback_swot), chat, generate_watchlist_review, generate_compare_analysis, analyze_news, generate_report, generate_ipo_analysis, parse_portfolio_document, extract_profile_details, explain_smart_score, explain_risk_score. 'gemini' vs 'fallback' source selected by bool(settings.gemini_api_key).

### Market data providers (FMP/Yahoo via MarketDataProviders)
- URL: `(indirect — app.services.providers.MarketDataProviders)`
- Used by /stocks/ipo and /stocks/ipo/{symbol}/ai-analysis: get_ipo_calendar(from_date,to_date), get_ipo_recent(). dashboard_service (StockDashboardService) backs search_stocks, get_ticker_tape, get_index_heatmap, get_market_news, screen_stocks, get_dashboard. Actual external URLs live in those service modules, not in the endpoint files reviewed.


## Gotchas
- /stocks/ticker returns cached data even when refresh=True (intentional anti-hammer behavior, comment says first ~10s window) — refresh flag is effectively a no-op when a cache entry exists.
- Auth cookies: register & login compute secure = (app_env != 'development'), but /auth/refresh HARDCODES secure=True on the reissued cookies — inconsistency that can break refresh in local dev over http.
- refresh_token cookie path is scoped to /api/v1/auth/refresh (not /), confirming the global /api/v1 mount prefix; access_token cookie path is /.
- Refresh token rotation: each /auth/refresh deletes the old RefreshToken row and inserts a new one (sliding window). Reusing an old refresh token after rotation yields 401 'Invalid refresh token'.
- Refresh tokens are opaque secrets.token_urlsafe(48), sha256-hashed before DB storage — only the hash is in the DB; lookups hash the incoming cookie. They are NOT JWTs.
- Email verification uses a SEPARATE JWT with claim type='email_verification' and 24h expiry; verify_email_token rejects tokens missing that type claim with 400.
- send_verification_email swallows all exceptions and returns False — registration still succeeds (commits) even if email delivery fails. No retry/queue.
- register() calls db.flush() to obtain user.id before generating the verification token, then commits twice (once after email send, once after storing refresh token).
- portfolio.py despite its name has NO DB/watchlist logic — it is solely a /parse-document multipart upload endpoint using pdfplumber/python-docx; document text truncated to 12000 chars before AI parsing.
- admin /premium-requests has an N+1 query: it loops requests and issues a separate SELECT User per request.
- admin ban endpoint refuses to ban users where is_admin is True (400); tier update only accepts 'free' or 'premium'.
- Several stocks GET endpoints spread cached payloads directly into the response (**cached / **payload), so the response shape varies by what the service stored (e.g. index-heatmap rows, market-news date/items).
- Dashboard endpoint has layered resilience: live (12s timeout) → stale cache (7d) → get_sample_dashboard fallback with warning + fallback:true flags; AI enrichment on cache hits runs with allow_gemini=False and only triggers a background gemini refresh when _dashboard_needs_ai_refresh is true.
- JWT 'sub' is stored as str(user_id) and parsed with int(); admin flag in token ('admin' claim) is NOT trusted for authorization — require_admin re-reads is_admin from the DB user. Banned status is also re-checked on every authenticated request via get_current_user.
- Password hashing is argon2 (passlib CryptContext), chosen explicitly for Python 3.13+ compatibility — not bcrypt.
- There is NO password reset / OTP flow in any of the reviewed files. The task mentioned 'password reset OTP flow' but it is not implemented in auth.py, auth_service.py, or email_service.py — only email verification exists. email_service only has send_verification_email (no OTP / no password-reset email function).