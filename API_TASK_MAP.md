# API Task Map

Updated: 2026-03-13

This document maps the current app sections to the actual backend endpoints and third-party providers used in this repo.

## 1) Internal API endpoints used by the frontend

Base path: `/api/v1/stocks/*`

| Endpoint | Frontend use | What it returns |
|---|---|---|
| `GET /search?q=` | `searchStocks` | Indian stock symbol/name search results |
| `GET /ticker` | `fetchTickerTape` | Navbar ticker tape rows |
| `GET /index-heatmap?index=` | `fetchIndexHeatmap` | Index constituent heatmap rows |
| `GET /market-news` | `fetchMarketNews` | Market-wide news cards |
| `GET /{symbol}/dashboard` | `fetchDashboard` | Full stock dashboard payload |
| `POST /{symbol}/chat` | `sendAiQuestion` | Chat answer plus `source: gemini|fallback` |
| `GET /{symbol}/research-report` | backend-only endpoint currently available | Markdown research report |
| `GET /{symbol}/returns-projection` | `fetchReturnsProjection` | ROI projection series and future value |
| `GET /{symbol}/health-check` | debugging only | Minimal per-symbol health response |

## 2) Which provider does what

| Provider | Current task in this app |
|---|---|
| `NSE India` | Live quote, ticker feed, index data, quarterly results, corporate actions, insider trades, NSE-side bulk/block fallback |
| `Trendlyne` | Search universe, brokerage reports, financial statements, ratio trends, shareholding pattern, top shareholders, document library, bulk/block deals |
| `Financial Modeling Prep` | Historical candles, quote fallback, quarterly results fallback |
| `Yahoo Finance HTTP` | Quote fallback and chart fallback |
| `yfinance` | Extended fallback bundle: profile, metrics, statements, candles, intraday, news, shareholding |
| `Groww public chart API` | Extra daily candle fallback |
| `Groww authenticated API` | Optional profile/shareholding/price enrichment when credentials exist |
| `Google News RSS` | Primary market-wide news feed |
| `NewsAPI` | Symbol-level news and market-news fallback |
| `Gemini API` | Chat, Smart Score explanation, Risk Score explanation, profile enrichment, research report generation |

## 3) Dashboard section to data-source mapping

| UI section | Primary source | Fallback / enrichment |
|---|---|---|
| Price CMP / change / 52W | NSE quote | Yahoo, yfinance, FMP, Groww |
| Price chart / range chart | FMP candles | yfinance, Yahoo, Groww |
| Company overview / profile | yfinance profile + Groww | Gemini fills missing incorporation/headquarters/chairman/previous name only when needed |
| Essentials metric cards | NSE + yfinance metrics | Trendlyne ratio trends used to fill bank-specific gaps like CASA/NIM |
| Smart Score | Local backend scoring in `scoring.py` | Gemini explanation if runtime call succeeds |
| Risk Score | Local backend scoring in `scoring.py` | Gemini explanation if runtime call succeeds |
| ROI calculator | Local projection endpoint | Uses score/technical context and backend projection logic |
| Brokerage summary | Trendlyne research-reports pages | None |
| Corporate actions | NSE corporate APIs | Trendlyne bulk/block deal merge |
| Quarterly results | Trendlyne financials page | NSE quarterly results, then FMP quarterly fallback |
| Financial statements / CAGR snapshot | Trendlyne financials | yfinance annual statements where needed |
| Shareholding pattern / top holders | Trendlyne share-holding page | Groww / yfinance fallback data |
| Key ratio trends | Trendlyne annual ratio dump | Backend-derived fallback series where necessary |
| Documents | Trendlyne documents and filings pages | None |
| News | NewsAPI for symbol news | yfinance news items if needed |
| Search panel | Trendlyne stock sitemap | No hardcoded runtime symbol list in current path |

## 4) Provider priority order in code

- Live quote fields: `NSE -> Yahoo/yfinance -> FMP -> Groww`
- Price history: `FMP -> yfinance -> Yahoo -> Groww`
- Quarterly results: `Trendlyne -> NSE -> FMP`
- Corporate actions: `NSE -> Trendlyne merge for deals`
- Shareholding: `Trendlyne -> Groww -> yfinance`
- Market news: `Google News RSS -> NewsAPI`
- AI explanation layer: `Gemini -> backend fallback text`

## 5) Current configuration status from `backend/.env`

| Key | Status |
|---|---|
| `FMP_API_KEY` | set |
| `NEWS_API_KEY` | set |
| `GEMINI_API_KEY` | set |
| `GROWW_ACCESS_TOKEN` | empty |
| `GROWW_API_KEY` | empty |
| `GROWW_API_SECRET` | empty |
| `GROWW_TOTP_TOKEN` | empty |
| `GROWW_TOTP_SECRET` | empty |

## 6) Important runtime note

`GEMINI_API_KEY` is configured, but Gemini can still fall back at runtime if the request is blocked, rate-limited, or rejected. The chatbot now exposes `AI Source: Gemini` or `AI Source: Fallback` in the UI so you can see the actual source used for each reply.

## 7) Code reference starting points

- Backend endpoint router: [stocks.py](/c:/Users/KRISH/Desktop/Finance/backend/app/api/v1/endpoints/stocks.py)
- Dashboard assembly: [dashboard.py](/c:/Users/KRISH/Desktop/Finance/backend/app/services/dashboard.py)
- Provider fetchers/parsers: [providers.py](/c:/Users/KRISH/Desktop/Finance/backend/app/services/providers.py)
- AI adapter: [ai_adapter.py](/c:/Users/KRISH/Desktop/Finance/backend/app/services/ai_adapter.py)
- Gemini client: [gemini_service.py](/c:/Users/KRISH/Desktop/Finance/ai-engine/src/ai_engine/gemini_service.py)
