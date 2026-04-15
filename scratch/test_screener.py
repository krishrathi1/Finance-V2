import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

async def test():
    from app.services.dashboard import StockDashboardService
    from app.core.config import get_settings
    
    service = StockDashboardService()
    
    print("Testing Screener with PE < 25...")
    results = await service.screen_stocks(
        exchange="NSE",
        pe_max=25,
        limit=20
    )
    
    print(f"Found {len(results)} stocks.")
    for r in results[:10]:
        print(f" - {r['symbol']}: PE={r.get('pe')}, MCap={r.get('marketCap')}")
    
    if len(results) > 2:
        print("\nSUCCESS: Found more than 2 results!")
    else:
        print("\nFAILURE: Still found 2 or fewer results.")

if __name__ == "__main__":
    asyncio.run(test())
