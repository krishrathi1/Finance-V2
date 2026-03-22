import asyncio
from app.services.providers import MarketDataProviders
async def test():
    p = MarketDataProviders()
    res = await p.get_fmp_stock_screener(sector='Technology', limit=5)
    print(f'Results for Technology: {len(res)}')
    if res:
        print(res[0])
    res_all = await p.get_fmp_stock_screener(limit=5)
    print(f'Results for All: {len(res_all)}')
asyncio.run(test())
