# Financial Forensics Database Schema

**Database Name:** `financial_forensics`  
**Database Type:** MySQL / MariaDB  
**Character Set:** UTF-8 (utf8mb4)  
**Collation:** utf8mb4_unicode_ci  

## Database Dump Location

- Main dump: `database/db_dump_*.sql`
- Import: `mysql -u root financial_forensics < database/db_dump_*.sql`

---

## Table Structure

### 1. users

**Purpose:** Store user account information and authentication  
**Primary Key:** `id` (INT, AUTO_INCREMENT)

| Column | Type | Null | Key | Default | Notes |
|--------|------|------|-----|---------|-------|
| `id` | INT | NO | PK | AUTO_INCREMENT | User identifier |
| `email` | VARCHAR(255) | NO | UNIQUE | NULL | User email address |
| `password_hash` | VARCHAR(255) | YES | | NULL | Hashed password (bcrypt) |
| `is_admin` | TINYINT(1) | YES | | 0 | Admin flag |
| `is_verified` | TINYINT(1) | YES | | 0 | Email verification status |
| `tier` | VARCHAR(50) | YES | | 'free' | User tier (free/premium/admin) |
| `created_at` | TIMESTAMP | YES | | CURRENT_TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | YES | | CURRENT_TIMESTAMP | Last update time |

**Relationships:**
- Foreign Key: `password_reset_tokens.user_id` → `users.id`
- Foreign Key: `portfolios.user_id` → `users.id`
- Foreign Key: `premium_requests.user_id` → `users.id`
- Foreign Key: `premium_requests.processed_by` → `users.id`

---

### 2. password_reset_tokens

**Purpose:** Store OTP tokens for password reset flow  
**Primary Key:** `id` (INT, AUTO_INCREMENT)

| Column | Type | Null | Key | Default | Notes |
|--------|------|------|-----|---------|-------|
| `id` | INT | NO | PK | AUTO_INCREMENT | Token identifier |
| `user_id` | INT | NO | FK | NULL | Reference to user |
| `otp` | VARCHAR(6) | NO | | NULL | 6-digit OTP code |
| `is_used` | TINYINT(1) | YES | | 0 | Whether token was used |
| `expires_at` | TIMESTAMP | NO | | NULL | Token expiration time |
| `created_at` | TIMESTAMP | YES | | CURRENT_TIMESTAMP | Token creation time |

**Relationships:**
- Foreign Key: `user_id` → `users.id` (ON DELETE CASCADE)

**Note:** Tokens expire 24 hours after creation. After expiry, user must request new OTP.

---

### 3. portfolios

**Purpose:** Store user investment portfolios (stock holdings)  
**Primary Key:** `id` (INT, AUTO_INCREMENT)

| Column | Type | Null | Key | Default | Notes |
|--------|------|------|-----|---------|-------|
| `id` | INT | NO | PK | AUTO_INCREMENT | Portfolio entry ID |
| `user_id` | INT | NO | FK | NULL | Reference to user |
| `symbol` | VARCHAR(20) | NO | | NULL | Stock symbol (e.g., RELIANCE) |
| `quantity` | INT | NO | | NULL | Number of shares owned |
| `buy_price` | DECIMAL(10,2) | NO | | NULL | Purchase price per share |
| `current_price` | DECIMAL(10,2) | YES | | NULL | Current market price (cached) |
| `sector` | VARCHAR(100) | YES | | NULL | Stock sector (Oil & Gas, IT, etc.) |
| `beta` | DECIMAL(5,2) | YES | | NULL | Stock beta (volatility measure) |
| `added_at` | TIMESTAMP | YES | | CURRENT_TIMESTAMP | When added to portfolio |
| `updated_at` | TIMESTAMP | YES | | CURRENT_TIMESTAMP | Last updated |

**Relationships:**
- Foreign Key: `user_id` → `users.id` (ON DELETE CASCADE)

**Index:** `user_id` for fast portfolio retrieval

---

### 4. premium_requests

**Purpose:** Track user requests to upgrade to premium tier  
**Primary Key:** `id` (INT, AUTO_INCREMENT)

| Column | Type | Null | Key | Default | Notes |
|--------|------|------|-----|---------|-------|
| `id` | INT | NO | PK | AUTO_INCREMENT | Request ID |
| `user_id` | INT | NO | FK | NULL | Reference to requesting user |
| `reason` | TEXT | NO | | NULL | User's reason for upgrade request |
| `status` | ENUM | NO | | 'pending' | Status (pending/approved/rejected) |
| `requested_at` | DATETIME | YES | | CURRENT_TIMESTAMP | When request was made |
| `processed_at` | DATETIME | YES | | NULL | When request was processed |
| `processed_by` | INT | YES | FK | NULL | Admin user who processed |

**Relationships:**
- Foreign Key: `user_id` → `users.id` (ON DELETE CASCADE)
- Foreign Key: `processed_by` → `users.id` (admin)

**Indexes:**
- `status`: For finding pending requests
- `user_id`: For user's request history

---

## Data Relationships Diagram

```
users (1) ─────────────────(M) portfolios
  │                           │
  │                           └─> Stores individual stock holdings
  │
  ├─────────────────(M) password_reset_tokens
  │                    └─> OTP codes for password reset
  │
  └─────────────────(M) premium_requests
                         ├─> Upgrade requests (user_id)
                         └─> Processing info (processed_by)
```

---

## Sample Data Queries

### Get User Portfolio

```sql
SELECT 
  p.id,
  p.symbol,
  p.quantity,
  p.buy_price,
  p.current_price,
  (p.quantity * p.current_price) AS total_value,
  ((p.current_price - p.buy_price) * p.quantity) AS gain_loss
FROM portfolios p
WHERE p.user_id = 1
ORDER BY p.added_at DESC;
```

### Get User by Email

```sql
SELECT * FROM users WHERE email = 'user@example.com';
```

### Get Pending Premium Requests

```sql
SELECT 
  pr.id,
  pr.user_id,
  u.email,
  pr.reason,
  pr.requested_at
FROM premium_requests pr
JOIN users u ON pr.user_id = u.id
WHERE pr.status = 'pending'
ORDER BY pr.requested_at ASC;
```

### Get User's Verification Status

```sql
SELECT email, is_verified, created_at 
FROM users 
WHERE id = 1;
```

### Check OTP Validity

```sql
SELECT * FROM password_reset_tokens
WHERE user_id = 1 
  AND is_used = 0 
  AND expires_at > NOW()
ORDER BY created_at DESC
LIMIT 1;
```

---

## Backup Information

**Last Dump Created:** 2026-04-13 23:49:29  
**Database Size:** ~8.8 KB (empty or minimal data)  
**Character Set:** utf8mb4  
**Collation:** utf8mb4_unicode_ci  

### To Restore

```bash
# Create new database
mysql -u root -e "CREATE DATABASE financial_forensics CHARACTER SET utf8mb4;"

# Import dump
mysql -u root financial_forensics < database/db_dump_20260413_234929.sql

# Verify
mysql -u root -e "SHOW TABLES;" financial_forensics
```

---

## Important Notes

1. **Foreign Keys:** All relationships use ON DELETE CASCADE, meaning deleting a user will delete:
   - All their password reset tokens
   - All their portfolios
   - All their premium requests

2. **Timestamps:** All timestamps are in UTC (`CURRENT_TIMESTAMP`)

3. **Data Types:**
   - Prices stored as DECIMAL (10,2) for financial accuracy
   - Quantities as INT (whole shares only)
   - User tier as VARCHAR for flexibility (future tiers)

4. **Indexes:** Keep indexes on:
   - `users.email` (for login)
   - `portfolios.user_id` (for portfolio queries)
   - `password_reset_tokens.user_id` (for OTP lookup)
   - `premium_requests.status` (for admin dashboard)

---

## Missing/Future Tables

The following tables should be created:

- **stock_quotes**: Cache real-time stock prices from NSE
- **stock_metrics**: Store P/E ratio, market cap, other metrics
- **news_articles**: Cache news articles with sentiment scores
- **audit_logs**: Track sensitive user actions
- **sessions**: Optional (if not using JWT tokens)

---

**Last Updated:** 2026-04-13  
**Database Version:** MariaDB 10.11  
**Maintenance:** Regular backups recommended
