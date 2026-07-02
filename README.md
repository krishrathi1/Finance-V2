# Financial Forensics AI

A professional-grade quantitative trading platform and AI-powered Indian stock research dashboard. Built to deliver real-time market data, advanced charting, and intelligent financial analysis through a modern, responsive, and glassmorphic UI.

## 🚀 Features

- **Modern Trading Dashboard**: Professional-grade UI featuring glassmorphism, neon accents, and responsive design.
- **Advanced Charting**: Integrated with the official TradingView Advanced Chart Widget for live, interactive market analysis.
- **Quantitative Scoring**: Smart Score and Risk Score computed locally from historical market data with AI-generated explanations.
- **AI-Powered Insights**: AI research reports, interactive chat assistant, SWOT analysis, earnings TL;DRs, and screeners (powered by Gemini).
- **Comprehensive Financial Data**: Real-time quotes, financial statements, corporate actions, shareholding patterns, IPO tracking, and news.
- **Accounts & Premium**: Email/password auth with JWT cookies, email verification, password reset via OTP, and a premium-request flow.
- **Indian Markets Focus**: NSE/BSE stock analysis with broad global stock search.

## 🛠 Tech Stack

Single application: **Next.js 14 (App Router)** serves both the UI and the entire API (`app/api/v1/**` route handlers).

- **UI**: Tailwind CSS, Framer Motion, Radix UI, Recharts, TradingView Widget
- **API/backend logic**: Next.js route handlers + `frontend/lib/backend/` (dashboard assembly, scoring engine, provider fetchers, AI features)
- **Database**: MySQL 8 (`mysql2` pool) — users, sessions, premium requests, watchlists, portfolios
- **AI**: Gemini API (chat, explanations, reports) with rule-based fallbacks
- **Data providers**: NSE India, Trendlyne, Financial Modeling Prep, Yahoo Finance, Google News RSS, NewsAPI
- **Email**: SMTP via nodemailer (verification + password-reset OTP)

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
