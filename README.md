 # Financial Forensics AI

AI-powered Indian stock research platform built with Next.js 14 + FastAPI + PostgreSQL + Redis + Gemini.

## Monorepo Structure

- `frontend/` - Next.js app (App Router)
- `backend/` - FastAPI API server
- `ai-engine/` - Gemini prompt and orchestration layer
- `data-pipeline/` - Data ingestion/fetch scripts

## Implemented MVP Features

- Global stock search and SSR stock detail pages (`/stocks/[symbol]`)
- Interactive price chart (1D/1W/1M/1Y/5Y views)
- Key metrics cards with formula tooltips
- Smart Score (0-5) and Risk Score (weighted model)
- AI chat assistant (floating orange button)
- AI-generated research report
- Returns calculator with projection chart
- Financial statements tabs (income statement, balance sheet, cash flow)
- Corporate actions, insider trades, bulk/block deals tables
- Shareholding pie chart and competitor table
- Documents section and news sentiment feed
- Redis caching for dashboard payloads

## Quick Start

1. Copy env templates:
   - `backend/.env.example` -> `backend/.env`
   - `frontend/.env.example` -> `frontend/.env.local`
2. Start infra + apps:
   ```bash
   docker compose up --build
   ```
3. Open:
   - Frontend: `http://localhost:3000`
   - Backend docs: `http://localhost:8000/docs`

## Local Without Docker

### Backend
```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Notes

- External providers are integrated with graceful fallback demo data for MVP reliability.
- Redis is used for response caching.
- Stock pages are SSR in Next.js.
- Smart score/risk score now run on a normalized factor pipeline (profitability, growth, valuation, momentum, financial health) with a bounded walk-forward ML adjustment.
- `data-pipeline/sql/schema.sql` contains starter tables for persistent ingestion.
- Use `data-pipeline/scripts/fetch_market_data.py` and `data-pipeline/scripts/scrape_nse_bse.py` for snapshots/scraping.
- Use `data-pipeline/scripts/scrape_google_market_news.py` for daily Google News market snapshots.
- Use `data-pipeline/scripts/validate_scoring_engine.py` to monitor scoring quality across a symbol basket.
- Groww integration now uses the official Python SDK (`growwapi`) instead of `GROWW_API_BASE`.
- Configure one Groww auth flow in backend env:
  - `GROWW_AUTH_MODE=access_token` + `GROWW_ACCESS_TOKEN`
  - `GROWW_AUTH_MODE=api_secret` + `GROWW_API_KEY` + `GROWW_API_SECRET`
  - `GROWW_AUTH_MODE=totp` + `GROWW_TOTP_TOKEN` + `GROWW_TOTP_SECRET`
