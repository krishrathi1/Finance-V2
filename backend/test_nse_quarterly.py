import asyncio
import os
import sys
import json
from datetime import datetime

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app.services.providers import MarketDataProviders

async def test_nse_quarterly():
    provider = MarketDataProviders()
    symbol = "RELIANCE"
    print(f"Fetching NSE quarterly results for {symbol}...")
    
    # We call the sync version via the thread wrapper as in the service
    results = await provider.get_nse_quarterly_results(symbol)
    
    if not results:
        print("No results found or error occurred.")
        return

    print("Available keys in results:", results.keys())
    
    for mode in ["standalone", "consolidated"]:
        data = results.get(mode, [])
        print(f"\n--- {mode.upper()} ---")
        if not data:
            print("No simple data.")
        else:
            for item in data:
                print(f"Period: {item['period']}, Revenue: {item['revenue']}, Profit: {item['profit']}")

        detailed = results.get(f"{mode}Detailed", [])
        print(f"\n--- {mode.upper()} DETAILED (Last 2) ---")
        if not detailed:
            print("No detailed data.")
        else:
            for item in detailed[-2:]:
                print(f"Period: {item['period']}, Total Rev: {item['totalRevenue']}, Interest Earned: {item.get('interestEarned')}, Net Profit: {item['netProfit']}")

if __name__ == "__main__":
    asyncio.run(test_nse_quarterly())
