CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(32) NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    sector TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    candle_date DATE NOT NULL,
    open NUMERIC(18,4),
    high NUMERIC(18,4),
    low NUMERIC(18,4),
    close NUMERIC(18,4),
    volume INTEGER,
    UNIQUE (stock_id, candle_date)
);

CREATE TABLE IF NOT EXISTS financial_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    period_label VARCHAR(20) NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    pe_ratio NUMERIC(18,4),
    pb_ratio NUMERIC(18,4),
    roe NUMERIC(18,4),
    roce NUMERIC(18,4),
    debt_to_equity NUMERIC(18,4),
    eps NUMERIC(18,4),
    dividend_yield NUMERIC(18,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS corporate_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    action_type VARCHAR(40) NOT NULL,
    event_date DATE,
    announcement_date DATE,
    details TEXT,
    client TEXT,
    order_type VARCHAR(20),
    quantity NUMERIC(18,4),
    avg_price NUMERIC(18,4),
    exchange VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shareholding_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    quarter VARCHAR(20) NOT NULL,
    promoters NUMERIC(8,4),
    fii NUMERIC(8,4),
    dii NUMERIC(8,4),
    public_holding NUMERIC(8,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stock_id, quarter)
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    document_type VARCHAR(30) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    headline TEXT NOT NULL,
    source TEXT,
    published_at TIMESTAMP,
    url TEXT,
    sentiment_score NUMERIC(8,4),
    narrative_flags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
