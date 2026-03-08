import asyncio
import os
import sys

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app.core.config import get_settings
from app.services.providers import MarketDataProviders

async def check_recent_data():
    settings = get_settings()
    provider = MarketDataProviders()
    symbol = "RELIANCE.NS"
    
    fmp_symbol = symbol.upper()
    if not fmp_symbol.endswith(".NS") and not fmp_symbol.endswith(".BO"):
        fmp_symbol = f"{fmp_symbol}.NS"
        
    url = f"https://financialmodelingprep.com/api/v3/income-statement/{fmp_symbol}"
    params = {"period": "quarter", "limit": 12, "apikey": settings.fmp_api_key}
    
    print(f"Checking data for {fmp_symbol} using API Key: {settings.fmp_api_key[:5]}...")
    
    try:
        # Use the internal _get which handle httpx
        payload = await provider._get(url, params=params)
        if not payload:
            print("No data returned.")
            return

        print(f"Retrieved {len(payload)} quarters.")
        for item in payload:
            print(f"Date: {item.get('date')}, Revenue: {item.get('revenue')}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_recent_data())
