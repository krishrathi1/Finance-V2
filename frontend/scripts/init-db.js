/**
 * Database initialization script
 * Run this once to set up the MySQL database schema
 *
 * Usage: node scripts/init-db.js
 */

const mysql = require('mysql2/promise');

async function initializeDatabase() {
  const dbName = process.env.MYSQL_DATABASE || 'financial_forensics';

  // Connect without selecting a database first and create it if missing —
  // connecting directly to `database: dbName` fails with ER_BAD_DB_ERROR on
  // a genuinely fresh MySQL server that has no pre-existing database (this
  // is masked in the docker-compose.yml path, where the mysql:8 image
  // auto-creates MYSQL_DATABASE on first boot, but bites anyone running this
  // script standalone against a bare MySQL instance).
  const bootstrapConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });
  await bootstrapConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await bootstrapConnection.end();

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: dbName,
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

    // Create watchlists table
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
    console.log('✓ watchlists table created');

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
    console.log('✓ portfolios table created');

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
