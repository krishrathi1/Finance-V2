import asyncio
import sys
sys.path.insert(0, r"d:\xamp\htdocs\Finance\Finance\backend")
from app.services.providers import MarketDataProviders

async def main():
    p = MarketDataProviders()
    symbol = "HDFCBANK"
    
    print("=== Testing Individual Providers for", symbol, "===")
    
    # 1. NSE Quote
    try:
        result = await asyncio.wait_for(p.get_nse_quote(symbol), timeout=10)
        print(f"[NSE Quote] {'OK - cmp=' + str(result.get('cmp')) if result else 'None'}")
    except Exception as e:
        print(f"[NSE Quote] ERROR: {e}")

    # 2. Groww Candles
    try:
        result = await asyncio.wait_for(p.get_groww_candles(symbol), timeout=10)
        print(f"[Groww Candles] {'OK - ' + str(len(result)) + ' candles' if result else 'None'}")
    except Exception as e:
        print(f"[Groww Candles] ERROR: {e}")

    # 3. FMP Quote (new stable endpoint)
    try:
        result = await asyncio.wait_for(p.get_fmp_quote(symbol), timeout=10)
        print(f"[FMP Quote] {'OK - cmp=' + str(result.get('cmp')) if result else 'None'}")
    except Exception as e:
        print(f"[FMP Quote] ERROR: {e}")

    # 4. FMP Candles (new stable endpoint)
    try:
        result = await asyncio.wait_for(p.get_fmp_candles(symbol, "5Y"), timeout=10)
        print(f"[FMP Candles] {'OK - ' + str(len(result)) + ' candles' if result else 'None'}")
    except Exception as e:
        print(f"[FMP Candles] ERROR: {e}")

    # 5. Yahoo Quote
    try:
        result = await asyncio.wait_for(p.get_yahoo_quote(symbol), timeout=10)
        print(f"[Yahoo Quote] {'OK' if result else 'None'}")
    except Exception as e:
        print(f"[Yahoo Quote] ERROR: {e}")

    # 6. yfinance bundle
    try:
        result = await asyncio.wait_for(p.get_yfinance_bundle(symbol, 1825), timeout=30)
        if result:
            print(f"[yfinance Bundle] OK - keys: {list(result.keys())}")
            m = result.get("metrics", {})
            print(f"  ROE={m.get('roe')}, ROCE={m.get('roce')}, EPS={m.get('eps')}")
        else:
            print(f"[yfinance Bundle] None")
    except Exception as e:
        print(f"[yfinance Bundle] ERROR: {type(e).__name__}: {e}")

    # 7. FMP Quarterly
    try:
        result = await asyncio.wait_for(p.get_fmp_quarterly_results(symbol), timeout=10)
        print(f"[FMP Quarterly] {'OK - ' + str(len(result)) + ' quarters' if result else 'None'}")
    except Exception as e:
        print(f"[FMP Quarterly] ERROR: {e}")

asyncio.run(main())
