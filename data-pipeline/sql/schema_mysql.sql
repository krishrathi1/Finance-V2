CREATE TABLE IF NOT EXISTS stocks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    symbol VARCHAR(32) NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    sector TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_candles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stock_id INT NOT NULL,
    candle_date DATE NOT NULL,
    open DECIMAL(18,4),
    high DECIMAL(18,4),
    low DECIMAL(18,4),
    close DECIMAL(18,4),
    volume BIGINT,
    UNIQUE (stock_id, candle_date),
    FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financial_metrics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stock_id INT NOT NULL,
    period_label VARCHAR(20) NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    pe_ratio DECIMAL(18,4),
    pb_ratio DECIMAL(18,4),
    roe DECIMAL(18,4),
    roce DECIMAL(18,4),
    debt_to_equity DECIMAL(18,4),
    eps DECIMAL(18,4),
    dividend_yield DECIMAL(18,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS corporate_actions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stock_id INT NOT NULL,
    action_type VARCHAR(40) NOT NULL,
    event_date DATE,
    announcement_date DATE,
    details TEXT,
    client TEXT,
    order_type VARCHAR(20),
    quantity DECIMAL(18,4),
    avg_price DECIMAL(18,4),
    exchange VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shareholding_patterns (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stock_id INT NOT NULL,
    quarter VARCHAR(20) NOT NULL,
    promoters DECIMAL(8,4),
    fii DECIMAL(8,4),
    dii DECIMAL(8,4),
    public_holding DECIMAL(8,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stock_id, quarter),
    FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stock_id INT NOT NULL,
    document_type VARCHAR(30) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS news_sentiment (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stock_id INT NOT NULL,
    headline TEXT NOT NULL,
    source TEXT,
    published_at TIMESTAMP,
    url VARCHAR(512),
    sentiment_score DECIMAL(8,4),
    narrative_flags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);
