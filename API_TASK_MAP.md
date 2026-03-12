# API Task Map

Updated: 2026-03-12

This is a quick reference for which API/provider does which task in this project.

## 1) Internal APIs (used by frontend)

Base path: `/api/v1/stocks/*`

| Endpoint | Used for | Frontend function |
|---|---|---|
| `GET /search?q=` | Stock symbol/name search (currently local universe list) | `searchStocks` |
| `GET /ticker` | Navbar ticker rows (symbol, CMP, change, change%) | `fetchTickerTape` |
| `GET /index-heatmap?index=` | Heatmap rows for index constituents | `fetchIndexHeatmap` |
| `GET /market-news` | Market-wide news cards | `fetchMarketNews` |
| `GET /{symbol}/dashboard` | Full stock dashboard data (price, metrics, financials, scores, news) | `fetchDashboard` |
| `POST /{symbol}/chat` | AI Q&A response for a stock | `sendAiQuestion` |
| `GET /{symbol}/research-report` | AI-generated markdown research report | `fetchResearchReport` |
| `GET /{symbol}/returns-projection` | SIP/lumpsum projection utility | `fetchReturnsProjection` |
| `GET /{symbol}/health-check` | Simple endpoint health check | (not used directly in frontend) |

## 2) External providers and exact tasks

| Provider/API | What it does in this app |
|---|---|
| **NSE India (`nseindia.com`)** | Primary live quote (`cmp/change/%`), market ticker feed, index constituents, quarterly results, corporate actions/events. |
| **Financial Modeling Prep (FMP)** | Primary historical candles for charting; quote fallback; quarterly financial fallback section. |
| **Polygon** | Backup quote and backup candles when higher-priority sources are unavailable. |
| **Yahoo Finance HTTP (`query1.finance.yahoo.com`)** | Quote/candles fallback for price and basic metrics. |
| **`yfinance` (Python library)** | Extended bundle fallback: quote, candles/intraday, profile, metrics, financial statements, news, shareholding. |
| **Groww public chart API (`groww.in`)** | Extra daily candles fallback. |
| **Groww authenticated API (`growwapi`)** | Optional profile/shareholding/price enrichment if Groww auth credentials are configured. |
| **Google News RSS** | Primary source for **market-wide news** endpoint (`/market-news`). |
| **NewsAPI (`newsapi.org`)** | Fallback for market-wide news; also symbol-level dashboard news. |
| **Trendlyne (`trendlyne.com`)** | Brokerage/analyst research details per symbol (latest reports, action mix, targets) and bulk/block deal rows for corporate actions tables. |
| **Gemini API (`generativelanguage.googleapis.com`)** | AI chat, research report, smart-score explanation, and risk-score explanation. |

## 3) Source priority used by dashboard

- **Price history candles:** `FMP -> Polygon -> yfinance -> Yahoo -> Groww candles`
- **Live quote fields:** `NSE` has highest priority, then fallbacks (Yahoo/yfinance/FMP/Polygon depending on availability checks in code).
- **Symbol news in dashboard:** `NewsAPI` (if available) is used for transformed news payload.
- **Market-wide news endpoint:** `Google News RSS` first, then `NewsAPI`.
- **Scores (Smart/Risk):** computed locally in backend (`scoring.py`), then optionally explained by Gemini.

## 4) Current config status (from `backend/.env`)

- Configured: `POLYGON_API_KEY`, `FMP_API_KEY`, `NEWS_API_KEY`
- Not configured: `GEMINI_API_KEY`
- Groww authenticated fields are empty (`GROWW_ACCESS_TOKEN`, `GROWW_API_KEY`, `GROWW_API_SECRET`, `GROWW_TOTP_*`)

Because `GEMINI_API_KEY` is empty, AI endpoints return fallback plain-language text instead of live Gemini responses.
