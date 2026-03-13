import asyncio
import os
import httpx
from dotenv import load_dotenv
import asyncpg
import redis.asyncio as redis
import sys

# Force UTF-8 encoding for stdout or just avoid emojis. We'll avoid emojis.
load_dotenv()

async def test_postgres():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("[FAILED] PostgreSQL: DATABASE_URL not set in .env")
        return
    try:
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(url)
        await conn.close()
        print("[SUCCESS] PostgreSQL: Connected successfully")
    except Exception as e:
        print(f"[FAILED] PostgreSQL: Connection failed - {e}")

async def test_redis():
    url = os.getenv("REDIS_URL")
    if not url:
        print("[FAILED] Redis: REDIS_URL not set in .env")
        return
    try:
        r = redis.from_url(url)
        await r.ping()
        await r.aclose()
        print("[SUCCESS] Redis: Connected successfully")
    except Exception as e:
        print(f"[FAILED] Redis: Connection failed - {e}")

async def test_api(name, url, headers=None, params=None, json_data=None, method="GET"):
    try:
        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, headers=headers, params=params, timeout=5)
            else:
                response = await client.post(url, headers=headers, params=params, json=json_data, timeout=5)
            
            if response.status_code == 200:
                print(f"[SUCCESS] {name}: Connected successfully (Status: {response.status_code})")
            elif response.status_code in [401, 403]:
                print(f"[FAILED] {name}: Authentication failed (Status: {response.status_code}) - Your API key might be invalid or expired.")
            else:
                print(f"[WARNING] {name}: Connected but returned status {response.status_code}. Response: {response.text[:100]}")
    except Exception as e:
        print(f"[FAILED] {name}: Connection failed - {e}")

async def main():
    print("\\n--- Testing Connections based on .env ---")
    await test_postgres()
    await test_redis()
    
    # FMP
    fmp_key = os.getenv("FMP_API_KEY")
    if fmp_key:
        await test_api("Financial Modeling Prep", f"https://financialmodelingprep.com/stable/profile", params={"symbol": "AAPL", "apikey": fmp_key})
    else:
        print("[FAILED] FMP: missing FMP_API_KEY")
        
    # News API
    news_key = os.getenv("NEWS_API_KEY")
    if news_key:
        await test_api("News API", "https://newsapi.org/v2/top-headlines", params={"country": "us", "apiKey": news_key})
    else:
        print("[FAILED] News API: missing NEWS_API_KEY")

    # Gemini
    gemini_key = os.getenv("GEMINI_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    if gemini_key:
        await test_api(
            "Gemini API", 
            f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent",
            params={"key": gemini_key},
            method="POST",
            json_data={"contents": [{"parts": [{"text": "Hello"}]}]}
        )
    else:
        print("[FAILED] Gemini API: missing GEMINI_API_KEY")

    # Yahoo Finance (public, just checking connection)
    yahoo_url = os.getenv("YAHOO_FINANCE_BASE", "https://query1.finance.yahoo.com")
    headers = {'User-Agent': 'Mozilla/5.0'}
    await test_api("Yahoo Finance", f"{yahoo_url}/v8/finance/chart/AAPL", headers=headers)
    print("-------------------------------------------\\n")

if __name__ == "__main__":
    asyncio.run(main())
