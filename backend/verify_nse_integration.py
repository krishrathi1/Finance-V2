import asyncio
import json
from app.services.providers import MarketDataProviders

async def verify_nse_candles():
    p = MarketDataProviders()
    symbol = "HDFCBANK"
    print(f"Testing real provider method for {symbol}...")
    
    candles = await p.get_nse_candles(symbol, days=30)
    if candles:
        print(f"SUCCESS! Retrieved {len(candles)} candles.")
        print("Sample:", json.dumps(candles[0], indent=2))
        
        # Check if sorted
        dates = [c["date"] for c in candles]
        is_sorted = dates == sorted(dates)
        print("Is sorted by date:", is_sorted)
    else:
        print("FAILED to retrieve candles from NSE.")

if __name__ == "__main__":
    asyncio.run(verify_nse_candles())
