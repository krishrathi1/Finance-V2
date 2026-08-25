/**
 * Database initialization script
 * Run this once to set up the MySQL database schema
 *
 * Usage: node scripts/init-db.js
 */

const mysql = require('mysql2/promise');

// Load .env.local / .env exactly as `next dev` does.
//
// This script runs under plain Node, which — unlike the Next server — does not
// read .env files on its own. Without this, every MYSQL_* lookup below fell
// back to its default and the script connected as root with an empty password,
// failing with "Access denied (using password: NO)" on a setup where the app
// itself connects perfectly. That is a confusing way to discover the problem,
// and `npm run init-db` is the documented first step in the README.
//
// @next/env ships with Next and applies the same file precedence, so the
// script and the app can never disagree about which database they mean.
require('@next/env').loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

async function initializeDatabase() {
  const dbName = process.env.MYSQL_DATABASE || 'financial_forensics';

  // Connect without selecting a database first and create it if missing —
  // connecting directly to `database: dbName` fails with ER_BAD_DB_ERROR on
  // a genuinely fresh MySQL server that has no pre-existing database (this
  // is masked in the docker-compose.yml path, where the mysql:8 image
  // auto-creates MYSQL_DATABASE on first boot, but bites anyone running this
  // script standalone against a bare MySQL instance).
  // MYSQL_PORT is honoured here as well as in the app's pool (server/
  // infrastructure/db.ts). Without it this script silently targets 3306 while
  // the running app talks to the configured port — the app works and only the
  // schema init fails, which is a confusing way to find out.
  const port = Number(process.env.MYSQL_PORT || 3306);
  const sslConfig = process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  const bootstrapConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    ssl: sslConfig,
  });
  await bootstrapConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await bootstrapConnection.end();

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: dbName,
    ssl: sslConfig,
  });

  try {
    console.log('Creating database schema...');

    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        tier VARCHAR(50) DEFAULT 'free',
        is_admin BOOLEAN DEFAULT FALSE,
        is_banned BOOLEAN DEFAULT FALSE,
        verified_email BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ users table created');

    // Create refresh tokens table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ refresh_tokens table created');

    // Create premium requests table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS premium_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        reason TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // MySQL has no partial/filtered unique index, so a column that's only
    // non-NULL for pending rows (unique indexes allow multiple NULLs) is the
    // standard workaround — makes "one pending request per user" an actual DB
    // constraint instead of a racy SELECT-then-INSERT check. This is a plain
    // (not generated/STORED) column set explicitly by the app on INSERT —
    // ADD COLUMN ... GENERATED STORED reliably hit InnoDB's "Cannot add
    // foreign key constraint" (errno 1215) on this FK-referencing table
    // across MySQL 8.0 builds, unrelated to FOREIGN_KEY_CHECKS.
    try {
      await connection.execute(
        'ALTER TABLE premium_requests ADD COLUMN pending_marker INT DEFAULT NULL'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    try {
      await connection.execute(
        'ALTER TABLE premium_requests ADD UNIQUE INDEX unique_pending_request (pending_marker)'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    }
    console.log('✓ premium_requests table created');

    // Create watchlists table (one row per symbol-in-a-list)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(20) DEFAULT 'NSE',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_watchlist (user_id, symbol)
      )
    `);
    // Multiple named watchlists per user (mirrors the client's localStorage
    // model) — list_name/note added via idempotent ALTERs below so the table
    // upgrades cleanly for DBs created before this feature existed. The old
    // (user_id, symbol) unique key can't express "same symbol in two lists",
    // so it's replaced with (user_id, list_name, symbol).
    try {
      await connection.execute(
        "ALTER TABLE watchlists ADD COLUMN list_name VARCHAR(120) NOT NULL DEFAULT 'My Watchlist'"
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    try {
      await connection.execute('ALTER TABLE watchlists ADD COLUMN note VARCHAR(500) NULL');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    // Add the replacement index before dropping the old one — InnoDB uses
    // unique_watchlist (user_id, symbol) to satisfy the table's user_id FK
    // constraint, so dropping it first fails with ER_DROP_INDEX_FK unless
    // another user_id-prefixed index already exists to take over that job.
    try {
      await connection.execute(
        'ALTER TABLE watchlists ADD UNIQUE INDEX unique_watchlist_item (user_id, list_name, symbol)'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    }
    try {
      await connection.execute('ALTER TABLE watchlists DROP INDEX unique_watchlist');
    } catch (error) {
      if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error;
    }
    console.log('✓ watchlists table created');

    // Tracks list *names* independently of items, so an empty named list
    // (created but nothing added yet) still survives a reload — a plain
    // "distinct list_name in watchlists" query can't represent that.
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS watchlist_lists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_watchlist_list (user_id, name)
      )
    `);
    console.log('✓ watchlist_lists table created');

    // Create portfolios table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS portfolios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        quantity INT NOT NULL,
        buy_price DECIMAL(10, 2) NOT NULL,
        current_price DECIMAL(10, 2),
        sector VARCHAR(100),
        beta DECIMAL(5, 2),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // The portfolio UI (lib/portfolio.ts) models a holding with more fields
    // than the original table carried, and it keys rows by a client-generated
    // id so localStorage and the server agree on identity across devices.
    // Added via idempotent ALTERs so existing databases upgrade in place.
    const portfolioColumns = [
      // Mirrors the `${SYMBOL}_${timestamp}` id lib/portfolio.ts already mints.
      // Nullable because rows predating this column have no client identity;
      // MySQL unique indexes permit repeated NULLs, so they don't collide.
      'ADD COLUMN client_id VARCHAR(64) NULL',
      'ADD COLUMN company_name VARCHAR(255) NULL',
      'ADD COLUMN buy_date DATE NULL',
      'ADD COLUMN notes VARCHAR(500) NULL',
      'ADD COLUMN target_price DECIMAL(18, 4) NULL',
    ];
    for (const clause of portfolioColumns) {
      try {
        await connection.execute(`ALTER TABLE portfolios ${clause}`);
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
    // quantity was INT, but the add/edit form accepts step="0.001" — fractional
    // units are real (ETF SIPs, bonus fractions), and an INT column silently
    // truncated them, corrupting invested value and P&L. buy_price widens from
    // DECIMAL(10,2) for the same reason: precision, and headroom past the
    // ~1e8 cap that column imposed. Both MODIFYs are no-ops once applied.
    await connection.execute('ALTER TABLE portfolios MODIFY COLUMN quantity DECIMAL(18, 4) NOT NULL');
    await connection.execute('ALTER TABLE portfolios MODIFY COLUMN buy_price DECIMAL(18, 4) NOT NULL');
    try {
      await connection.execute(
        'ALTER TABLE portfolios ADD UNIQUE INDEX unique_portfolio_item (user_id, client_id)'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    }
    console.log('✓ portfolios table created');

    // Append-only transaction ledger.
    //
    // `portfolios` records what you hold *now*; this records what you did. The
    // distinction matters because a sale removes a holding, and with only the
    // holdings table a sold position leaves no trace — so realised profit, the
    // actual return on money, and any tax view are all unrecoverable. Deleting
    // a row here is the user's choice; nothing in the app rewrites history.
    //
    // Quantities and prices are DECIMAL for the same reason as portfolios:
    // fractional units are real and an INT silently truncates them.
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS portfolio_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id VARCHAR(64) NULL,
        symbol VARCHAR(20) NOT NULL,
        company_name VARCHAR(255) NULL,
        side VARCHAR(4) NOT NULL,
        quantity DECIMAL(18, 4) NOT NULL,
        price DECIMAL(18, 4) NOT NULL,
        fees DECIMAL(18, 4) NOT NULL DEFAULT 0,
        traded_on DATE NOT NULL,
        notes VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_transaction (user_id, client_id)
      )
    `);
    // FIFO matching walks a single symbol's trades in trade-date order, which
    // is exactly this index — without it every realised-gain calculation
    // scans the user's whole ledger.
    try {
      await connection.execute(
        'ALTER TABLE portfolio_transactions ADD INDEX idx_txn_symbol_date (user_id, symbol, traded_on)'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    }
    console.log('✓ portfolio_transactions table created');

    // Price alerts. Previously browser-only (localStorage), which meant they
    // were lost on cache clear, invisible on a second device, and impossible
    // to act on while the tab was closed — the last of which is the whole
    // point of an alert. `alert_condition` rather than `condition`: the latter
    // is a reserved word in MySQL 8 and would need quoting at every call site.
    //
    // triggered_at/notified_at are separate so delivery is exactly-once:
    // evaluation only considers rows with triggered_at IS NULL, and the mailer
    // only considers rows that are triggered but not yet notified. A crash
    // between the two leaves a triggered alert that the next sweep will mail,
    // rather than a mail storm or a silently dropped alert.
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id VARCHAR(64) NULL,
        symbol VARCHAR(20) NOT NULL,
        target_price DECIMAL(18, 4) NOT NULL,
        alert_condition VARCHAR(10) NOT NULL DEFAULT 'above',
        note VARCHAR(500) NULL,
        armed BOOLEAN NOT NULL DEFAULT TRUE,
        triggered_at TIMESTAMP NULL DEFAULT NULL,
        triggered_price DECIMAL(18, 4) NULL,
        notified_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_price_alert (user_id, client_id)
      )
    `);
    // Drives the delivery sweep across all users, which filters on exactly
    // this pair; without it that query degrades to a full scan as alerts grow.
    try {
      await connection.execute(
        'ALTER TABLE price_alerts ADD INDEX idx_alert_delivery (triggered_at, notified_at)'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error;
    }
    console.log('✓ price_alerts table created');

    // Create password reset tokens table
    // `otp` stores a SHA-256 hex hash (64 chars), not the raw 6-digit code —
    // same pattern as refresh_tokens.token_hash, so a DB read (backup leak,
    // read replica, SQLi elsewhere) doesn't hand out live reset credentials.
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        otp VARCHAR(64) NOT NULL,
        failed_attempts INT NOT NULL DEFAULT 0,
        is_used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    try {
      await connection.execute(
        'ALTER TABLE password_reset_tokens ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0 AFTER otp'
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    // Widen `otp` for any DB created before the hash-instead-of-plaintext
    // change above; idempotent (no-ops once already VARCHAR(64)).
    await connection.execute('ALTER TABLE password_reset_tokens MODIFY COLUMN otp VARCHAR(64) NOT NULL');
    console.log('✓ password_reset_tokens table created');

    console.log('\n✅ Database initialized successfully!');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Tables already exist, no action needed');
    } else {
      console.error('❌ Error initializing database:', error);
      process.exit(1);
    }
  } finally {
    await connection.end();
  }
}

initializeDatabase();
