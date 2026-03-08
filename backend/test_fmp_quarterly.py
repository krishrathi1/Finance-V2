import asyncio
import os
import sys

# Add the project root to sys.path
sys.path.append(os.getcwd())

from app.services.providers import MarketDataProviders

async def test_fmp_quarterly():
    provider = MarketDataProviders()
    symbol = "HDFCBANK.NS"  # Using a bank to test bank-specific fields
    print(f"Fetching quarterly results for {symbol}...")
    results = await provider.get_fmp_quarterly_results(symbol)
    
    if not results:
        print("No results found or error occurred.")
        return

    print(f"Found {len(results)} quarters.")
    for res in results[-2:]:  # Print last two quarters
        print("\nQuarter:", res["period"])
        print("  Revenue:", res["totalRevenue"])
        print("  Net Profit:", res["netProfit"])
        print("  Operating Profit:", res["operatingProfit"])
        print("  Interest Earned:", res.get("interestEarned"))
        print("  Net Interest Income:", res.get("netInterestIncome"))
        print("  EPS:", res["basicEps"])
        print("  OPM %:", res["opmPct"])

if __name__ == "__main__":
    asyncio.run(test_fmp_quarterly())
