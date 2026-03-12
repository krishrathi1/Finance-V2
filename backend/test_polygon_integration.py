
import asyncio
import os
import sys
from pathlib import Path

# Add the backend root to sys.path
backend_path = Path(__file__).resolve().parent
if str(backend_path) not in sys.path:
    sys.path.append(str(backend_path))

from app.services.providers import MarketDataProviders
from app.core.config import get_settings

async def test_polygon_integration():
    settings = get_settings()
    if not settings.polygon_api_key:
        print("Error: POLYGON_API_KEY not found in .env")
        return

    providers = MarketDataProviders()
    symbol = "RELIANCE"
    
    print(f"--- Testing Polygon Quote for {symbol} ---")
    quote = await providers.get_polygon_quote(symbol)
    if quote:
        print(f"Success! Quote: {quote}")
    else:
        print("Failed to fetch Polygon quote.")

    print(f"\n--- Testing Polygon Candles for {symbol} ---")
    candles = await providers.get_polygon_candles(symbol, timeframe="1M")
    if candles:
        print(f"Success! Fetched {len(candles)} candles.")
        if len(candles) > 0:
            print(f"First candle: {candles[0]}")
            print(f"Last candle: {candles[-1]}")
    else:
        print("Failed to fetch Polygon candles.")

if __name__ == "__main__":
    asyncio.run(test_polygon_integration())
