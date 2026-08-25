# Financial Forensics AI

A professional-grade quantitative trading platform and AI-powered Indian stock research dashboard. Built to deliver real-time market data, advanced charting, and intelligent financial analysis through a modern, responsive, and glassmorphic UI.

## 🚀 Features

- **Modern Trading Dashboard**: Professional-grade UI featuring glassmorphism, neon accents, and responsive design.
- **Advanced Charting**: Integrated with the official TradingView Advanced Chart Widget for live, interactive market analysis.
- **Quantitative Scoring**: Smart Score and Risk Score computed locally from historical market data with AI-generated explanations.
- **AI-Powered Insights**: AI research reports, SWOT analysis, earnings TL;DRs, and screeners (powered by Gemini).
- **Comprehensive Financial Data**: Real-time quotes, financial statements, corporate actions, shareholding patterns, IPO tracking, and news.
- **Accounts & Premium**: Email/password auth with JWT cookies, email verification, password reset via OTP, and a premium-request flow.
- **Synced Watchlist, Portfolio & Alerts**: All three persist to MySQL and follow the same offline-first model — localStorage stays the synchronous source of truth, mutations sync in the background, and signing in merges anything created while signed out.
- **Capital Gains & Tax (India)**: Realised FIFO lots are grouped by *financial year* (1 Apr – 31 Mar) and taxed under sections 111A/112A, including the ₹1.25L long-term exemption, the one-way loss set-off rule (a short-term loss offsets both buckets; a long-term loss only offsets long-term gains), 4% cess, and the 23 July 2024 rate change — so a year spanning it charges each sale at the rate in force on its own date. Surfaces unused exemption as harvesting headroom before 31 March.
- **Concentration Risk**: Deterministic, locally-computed diversification measure (HHI → *effective holdings*) that weights positions by current value and merges duplicate tranches, so twelve rows with one dominant name don't read as a diversified portfolio.
- **Rolling Returns**: Return distribution across *every* start date in the history (1Y/3Y/5Y windows) — worst, median, best, share of windows that ended positive, and share that beat a fixed deposit. A trailing return is one observation; this shows whether a strong headline number was typical or one lucky entry.
- **SIP Simulator**: Backtests a fixed monthly investment against the daily history, reporting units accumulated, average cost, money-weighted XIRR, and the lump-sum counterfactual — the comparison every trailing-return figure silently assumes away.
- **Rebalancing Plan**: Turns the concentration diagnosis into executable trades — whole shares only, a minimum trade size so brokerage doesn't exceed the drift being corrected, and (by default) trimming only positions above the cap rather than churning the whole book for perfect equal weight. Reports turnover and the concentration actually achieved, not the target.
- **Time Underwater**: How long the stock spends below a previous high and how long it takes to recover. A 30% fall that recovers in four months and one still unrecovered three years later give an identical max-drawdown figure and are entirely different things to hold.
- **Price Alert Notifications**: Alerts are evaluated server-side and emailed when a target is crossed, so they fire with the app closed. Alerts arm on a genuine crossing rather than firing the instant they're created.
- **Indian Markets Focus**: NSE/BSE stock analysis with broad global stock search.

## 🛠 Tech Stack

Single application: **Next.js 14 (App Router)** serves both the UI and the entire API (`app/api/v1/**` route handlers).

- **UI**: Tailwind CSS, Framer Motion, Radix UI, Recharts, TradingView Widget
- **API/backend logic**: Next.js route handlers + `frontend/lib/backend/` (dashboard assembly, scoring engine, provider fetchers, AI features)
- **Database**: MySQL 8 (`mysql2` pool) — users, sessions, premium requests, watchlists, portfolios, price alerts
- **AI**: Gemini API (explanations, reports) with rule-based fallbacks
- **Data providers**: NSE India, Trendlyne, Financial Modeling Prep, Yahoo Finance, Google News RSS, NewsAPI
- **Email**: SMTP via nodemailer (verification, password-reset OTP, price alert notifications)

## 📂 Monorepo Structure

```text
Finance-V2/
├── frontend/             # The entire application (Next.js UI + API + backend logic)
│   ├── app/api/v1/       # All API endpoints (auth, stocks, portfolio)
│   ├── lib/backend/      # Dashboard assembly, scoring, providers, AI
│   └── scripts/init-db.js# Idempotent MySQL schema setup
├── data-pipeline/        # Standalone data ingestion/validation scripts + SQL schemas
├── database/             # DB schema documentation
├── deploy/               # VPS deployment scripts and nginx config
└── docs/                 # Design specs
```

> The legacy Python FastAPI backend (`backend/`) and `ai-engine/` were removed
> after the migration to Next.js-only architecture (see
> `docs/superpowers/specs/2026-07-02-nextjs-migration-completion-design.md`).
> Their history is preserved in git.

## 🏁 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [MySQL](https://dev.mysql.com/) 8 (or Docker)
- API keys: FMP, NewsAPI, Gemini (optional — features degrade gracefully)

### Local development

```bash
cd frontend
cp .env.example .env.local     # fill in JWT_SECRET_KEY, MYSQL_*, API keys
npm install
npm run init-db                # creates MySQL tables (idempotent)
npm run dev
```

App runs at `http://localhost:3000` (UI and API on the same port).

### Running with Docker

```bash
docker compose up --build      # MySQL + Next.js dev server
```

### Production (VPS)

```bash
cp .env.prod.example .env                          # set MYSQL_ROOT_PASSWORD
cp frontend/.env.prod.example frontend/.env.prod   # set JWT/SMTP/API keys
docker compose -f docker-compose.prod.yml up -d --build
```

nginx terminates TLS and proxies everything to the Next.js app on port 3000
(`deploy/nginx/mystockvision.conf`). Health check: `GET /api/health`.

### Price alert delivery (scheduled)

Alert emails are sent by a sweep endpoint, so they need a scheduler. Set
`ALERTS_CRON_SECRET` in `frontend/.env.prod`, then add a cron entry that POSTs
to it during market hours:

```cron
# every 5 min, 09:00-16:00 IST (03:30-10:30 UTC), Mon-Fri
*/5 3-10 * * 1-5 curl -fsS -X POST http://127.0.0.1:3000/api/v1/alerts/evaluate \
  -H "x-cron-secret: $ALERTS_CRON_SECRET" >/dev/null
```

Without it, alerts are still evaluated — but only while a signed-in user has
the alerts page open, which defeats the purpose of an alert. Notifications go
only to verified, unbanned accounts, and delivery is claimed before sending so
a triggered alert is emailed once rather than once per sweep.

## 🏗 Architecture & Data Flow

The API relies on multi-tiered provider fallbacks so data stays available:
- **Live quotes**: `NSE → Yahoo/yfinance → FMP`
- **Charting**: `FMP → Yahoo`
- **Scores**: computed locally in `frontend/lib/backend/scoring.ts`, with AI explanations generated on the fly.
- **Caching**: in-memory per-instance caches with TTL + stale-while-revalidate for dashboard payloads.

To validate scoring changes:
```bash
python data-pipeline/scripts/validate_scoring_engine.py --base-url http://127.0.0.1:3000
```

---
*Disclaimer: This platform is for educational and research purposes only. None of the AI-generated reports or insights should be considered financial advice.*
