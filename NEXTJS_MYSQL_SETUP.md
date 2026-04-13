# Next.js + MySQL Backend Setup Guide

Your application has been migrated from a Python backend to a **Next.js-only architecture with MySQL database**.

## Architecture Changes

✅ **Before:** Next.js Frontend + Python FastAPI Backend  
✅ **Now:** Next.js Frontend + MySQL Database (No external backend server)

## Setup Instructions

### 1. Create MySQL Database

```bash
# Login to MySQL
mysql -u root

# Create database
CREATE DATABASE financial_forensics;
EXIT;
```

### 2. Install Dependencies

```bash
cd frontend
npm install
```

### 3. Initialize Database Schema

```bash
# This creates all necessary tables
npm run init-db
```

You should see:
```
✓ users table created
✓ refresh_tokens table created
✓ premium_requests table created
✓ watchlists table created
✓ portfolios table created
✅ Database initialized successfully!
```

### 4. Start Development Server

```bash
npm run dev
```

The app runs on **http://localhost:3000**

## API Endpoints (All in Next.js)

### Authentication
- `POST /api/v1/auth/register` - Create new account
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh` - Refresh token

### Stocks (Currently Returns Mock Data)
- `GET /api/v1/stocks/ticker` - Market ticker
- `GET /api/v1/stocks/[symbol]/dashboard` - Stock dashboard

## Current Status

### ✅ Completed
- Authentication system (register, login, JWT tokens)
- MySQL database integration
- User session management
- Token refresh mechanism
- Basic stock endpoints (prevent 404 errors)

### ⏳ TODO (Phase 2)

You'll need to implement real market data:

1. **Stock Data Endpoints**
   - Fetch real NSE data
   - Historical candle data
   - Real quote data
   - Market news

2. **Advanced Features**
   - Portfolio tracking
   - Watchlist management
   - Stock analysis & scoring
   - AI insights (Gemini integration)
   - News analysis

3. **Admin Features**
   - Premium request management
   - User administration

## Key Files

- `frontend/lib/db.ts` - MySQL connection pool
- `frontend/lib/auth-utils.ts` - JWT and password utilities
- `frontend/app/api/v1/auth/*` - Authentication routes
- `frontend/app/api/v1/stocks/*` - Stock data routes
- `frontend/.env.local` - Configuration

## Environment Variables

```env
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=financial_forensics
JWT_SECRET_KEY=your-secret-key-here
```

## Troubleshooting

### 404 on `/api/v1/auth/me`
- Ensure MySQL is running
- Check `.env.local` has correct MySQL credentials
- Run `npm run init-db` to create tables

### Cannot connect to MySQL
```bash
# Check MySQL is running
mysql -u root -e "SELECT 1;"

# If error, start MySQL service
# Windows: net start MySQL80
# Mac: brew services start mysql
# Linux: sudo service mysql start
```

### Database already exists
If tables already exist, the `init-db` script will skip creation safely.

## Next Steps

1. Test authentication flow: Register → Login → Check profile
2. Implement real stock data APIs (integrate with data providers)
3. Add portfolio & watchlist features
4. Build premium tier logic
5. Deploy to production

## Database Schema

Users can:
- Register with email/password
- Login and get JWT tokens
- Maintain watchlists
- Track portfolios
- Request premium upgrades

All data persists in MySQL database.
