# Financial Forensics AI

A professional-grade quantitative trading platform and AI-powered Indian stock research dashboard. Built to deliver real-time market data, advanced charting, and intelligent financial analysis through a modern, responsive, and glassmorphic UI.

## 🚀 Features

- **Modern Trading Dashboard**: Stunning, professional-grade UI featuring glassmorphism, neon accents, and responsive design.
- **Advanced Charting**: Integrated with the official TradingView Advanced Chart Widget for live, interactive market analysis.
- **Quantitative Trading Model**: Quant-grade system forecasting daily price movements with high accuracy using historical market data and advanced mathematical modeling.
- **AI-Powered Insights**: AI-generated research reports, interactive chat assistants (powered by Gemini & Groq), and intelligent Smart/Risk scoring with transparent explanations.
- **Comprehensive Financial Data**: Supports real-time quote feeds, detailed financial statements (income, balance sheet, cash flow), corporate actions, insider trades, and more.
- **Global & Indian Markets**: Primary focus on NSE/BSE stock analysis with broad global stock search capabilities.

## 🛠 Tech Stack

### Frontend Architecture
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS, PostCSS, Framer Motion, Radix UI
- **Data Visualization**: Recharts, TradingView Widget
- **Deployment**: Supports Cloudflare Pages & Vercel (Supabase CORS optimized)

### Backend Services
- **Framework**: FastAPI (Python)
- **Database Architecture**: PostgreSQL (asyncpg), Redis (caching), SQLite (fallback/local)
- **ORM**: SQLAlchemy
- **Data Providers**: yFinance, FMP, NewsAPI, Trendlyne, NSE India, Google News RSS

### AI Engine & Pipelines
- **Models**: Gemini API, Groq (fallback and alternative verification)
- **Pipelines**: Scheduled Python scripts for market data ingestion (`fetch_market_data.py`), web scraping (`scrape_nse_bse.py`), and Google News mapping.

## 📂 Monorepo Structure

```text
financial-forensics-ai/
├── frontend/             # Next.js 14 frontend application
├── backend/              # FastAPI server handling API routes and business logic
├── ai-engine/            # LLM orchestration (Gemini/Groq) and prompt generation
├── data-pipeline/        # Data ingestion scripts and SQL schemas
├── project/              # Documentation and planning models
└── deploy/               # Deployment configurations and scripts
```

## 🏁 Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose
- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.10+
- API Keys: FMP, NewsAPI, Gemini, Groq, Supabase (optional if fully self-hosting)

### Running with Docker (Recommended)

1. Clone the repository and navigate to the root directory.
2. Initialize environment variables from templates:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   ```
3. Inject your API keys into the respective `.env` files.
4. Spin up the containers:
   ```bash
   docker-compose up --build
   ```
5. Access the application:
   - **Frontend**: `http://localhost:3000`
   - **Backend API Docs**: `http://localhost:8000/docs`

### Running Locally (Without Docker)

**Backend Setup**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

## 🏗 Architecture & Data Flow

This application is built for resilience. The API heavily relies on a multi-tiered fallback mechanism to ensure data is always available:
- **Live Quotes**: `NSE -> Yahoo/yfinance -> FMP`
- **Charting**: `FMP -> yfinance -> Yahoo`
- **Scores**: Calculated locally via `scoring.py` with AI-generated explainers on the fly.
- **Caching**: Redis caches costly dashboard payloads and AI responses to drastically improve rendering times and reduce latency.

## 🤝 Contributing

Pull requests and code reviews are welcome. Please ensure your code passes all type checks (Pyre2) and ESLint warnings before merging.

To validate your quantitative trading changes, run the scoring quality validation script:
```bash
python data-pipeline/scripts/validate_scoring_engine.py
```

---
*Disclaimer: This platform is for educational and research purposes only. None of the AI-generated reports or insights should be considered financial advice.*
