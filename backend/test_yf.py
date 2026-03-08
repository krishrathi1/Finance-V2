import asyncio
from app.services.dashboard import StockDashboardService
from app.services.providers import MarketDataProviders

async def main():
    service = StockDashboardService()
    # Let's test get_dashboard for HDFCBANK 
    res = await service.get_dashboard('HDFCBANK')
    print("Dashboard Metrics:")
    print(res.get('metrics'))
    res2 = await service.providers.get_yfinance_bundle('HDFCBANK')
    print("\n\nYFinance bundle Metrics:")
    if res2:
        print(res2.get('metrics'))
    else:
        print("No yfinance bundle")
        
if __name__ == "__main__":
    asyncio.run(main())
