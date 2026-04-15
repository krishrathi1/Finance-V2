import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

async def test():
    from app.services.dashboard import StockDashboardService
    from app.core.config import get_settings
    
    service = StockDashboardService()
    
    print("Testing Screener with PE < 50...")
    results = await service.screen_stocks(
        exchange="NSE",
        pe_max=50,
        limit=50
    )
    
    print(f"Found {len(results)} stocks.")
    for r in results[:20]:
        print(f" - {r['symbol']}: PE={r.get('pe')}, MCap={r.get('marketCap')}")
    
    if len(results) > 10:
        print(f"\nSUCCESS: Found {len(results)} results!")
    else:
        print("\nFAILURE: Found only few results.")

if __name__ == "__main__":
    asyncio.run(test())
