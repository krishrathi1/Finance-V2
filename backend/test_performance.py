print("Importing modules...")
import asyncio
import time
import os
print("Importing StockDashboardService...")
from app.services.dashboard import StockDashboardService
print("Modules imported.")

async def main():
    service = StockDashboardService()
    symbol = "TCS"
    print(f"Testing performance for {symbol}...")
    
    start = time.perf_counter()
    try:
        # Check specific steps in _fetch_provider_data
        print("Calling get_dashboard (this involves multiple parallel provider calls)...")
        data = await service.get_dashboard(symbol)
        duration = time.perf_counter() - start
        print(f"Success! Dashboard loaded in {duration:.2f} seconds.")
        print(f"Result count: {len(data)}")
    except Exception as e:
        duration = time.perf_counter() - start
        print(f"Failed after {duration:.2f} seconds.")
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
