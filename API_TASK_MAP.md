# API Task Map

Updated: 2026-07-02

All endpoints are Next.js route handlers under `frontend/app/api/v1/`. There is
no separate backend server — the UI and API share one Next.js app.

## 1) API endpoints

Base path: `/api/v1`

### Auth (`app/api/v1/auth/*`)

| Endpoint | Purpose |
|---|---|
| `POST /auth/register` | Create account, set JWT cookies, send verification email |
| `POST /auth/login` | Authenticate, set JWT cookies |
| `POST /auth/refresh` | Rotate refresh token, new access token |
| `POST /auth/logout` | Invalidate refresh token, clear cookies |
| `GET /auth/me` | Current user profile (session restore) |
| `GET/POST /auth/premium-request` | Premium upgrade request status / submission |
| `GET /auth/verify-email?token=` | Email verification |
| `POST /auth/forgot-password` | Send password-reset OTP |
| `POST /auth/verify-otp` | Check OTP |
| `POST /auth/reset-password` | Set new password |

### Stocks (`app/api/v1/stocks/*`)

| Endpoint | Purpose |
|---|---|
| `GET /stocks/search?q=` | Symbol/name search |
| `GET /stocks/ticker` | Navbar ticker tape |
| `GET /stocks/indices`, `/index-heatmap` | Index data and constituent heatmap |
| `GET /stocks/market-news`, `/market-mood` | Market-wide news and mood index |
| `GET /stocks/screener`, `POST /stocks/screener/ai` | Screener (filter + AI) |
| `GET /stocks/ipo`, `/ipo/{symbol}/ai-analysis` | IPO tracking + AI analysis |
| `GET /stocks/{symbol}/dashboard` | Full stock dashboard payload |
| `GET /stocks/{symbol}/quote`, `/chart`, `/news`, `/quarterly-results` | Individual data slices |
| `GET /stocks/{symbol}/research-report` | Markdown research report |
| `GET /stocks/{symbol}/returns-projection` | ROI projection |
| `GET /stocks/{symbol}/swot`, `/earnings-tldr`, `/competitor-verdict`, `/news-analysis`, `/watchlist-analysis` | AI feature endpoints |
| `POST /stocks/compare-analysis`, `/portfolio-risk`, `/portfolio-roast` | Multi-symbol AI analysis |
| `GET /stocks/proxy-image` | Image proxy for news thumbnails |
| `GET /stocks/{symbol}/health-check` | Per-symbol debug health |
| `POST /portfolio/parse-document` | Portfolio statement parsing (PDF/DOCX) |

### Ops

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Container/LB health check |

## 2) Which provider does what

| Provider | Task |
|---|---|
| `NSE India` | Live quotes, ticker feed, index data, corporate actions |
| `Trendlyne` | Search universe, financial statements, ratio trends, shareholding |
| `Financial Modeling Prep` | Historical candles, quote fallback |
| `Yahoo Finance` | Quote and chart fallback, profile/metrics |
| `Google News RSS` | Primary market-wide news feed |
| `NewsAPI` | Symbol-level news and market-news fallback |
| `Gemini API` | Chat, score explanations, research reports, AI features |

Provider priority: quotes `NSE → Yahoo → FMP`; history `FMP → Yahoo`;
market news `Google News RSS → NewsAPI`; AI `Gemini → rule-based fallback text`.

## 3) Code reference starting points

- Route handlers: [frontend/app/api/v1/](frontend/app/api/v1/)
- Dashboard assembly: [frontend/lib/backend/dashboard.ts](frontend/lib/backend/dashboard.ts)
- Scoring engine: [frontend/lib/backend/scoring.ts](frontend/lib/backend/scoring.ts)
- Provider fetchers: [frontend/lib/backend/providers/](frontend/lib/backend/providers/)
- AI features: [frontend/lib/backend/ai/features.ts](frontend/lib/backend/ai/features.ts)
- MySQL pool: [frontend/lib/db.ts](frontend/lib/db.ts)
- Auth utilities: [frontend/lib/auth-utils.ts](frontend/lib/auth-utils.ts)
