import asyncio
import time
import os
from app.services.providers import MarketDataProviders

def log(msg):
    print(msg, flush=True)
    with open("diag_results.txt", "a") as f:
        f.write(msg + "\n")

async def diag():
    if os.path.exists("diag_results.txt"):
        os.remove("diag_results.txt")
        
    p = MarketDataProviders()
    symbol = "TCS"
    log(f"--- API Health Diagnostics for {symbol} ---")
    
    tests = [
        ("NSE Quote", p.get_nse_quote(symbol)),
        ("NSE Corp Events", p.get_nse_corporate_events(symbol)),
        ("NSE Quarterly Results", p.get_nse_quarterly_results(symbol)),
        ("NSE Market Ticker", p.get_nse_market_ticker()),
        ("FMP Quote", p.get_fmp_quote(symbol)),
        ("FMP Quarterly Results", p.get_fmp_quarterly_results(symbol)),
        ("Yahoo Finance Quote", p.get_yahoo_quote(symbol)),
        ("yfinance Bundle", p.get_yfinance_bundle(symbol)),
        ("Groww Candles", p.get_groww_candles(symbol)),
        ("Google News", p.get_news(f"{symbol} stock")),
    ]
    
    for name, coro in tests:
        start = time.perf_counter()
        log(f"Testing {name:25}...")
        try:
            res = await asyncio.wait_for(coro, timeout=20)
            duration = time.perf_counter() - start
            if res:
                log(f" [OK] in {duration:.2f}s")
            else:
                log(f" [FAILED/EMPTY] in {duration:.2f}s")
        except asyncio.TimeoutError:
            duration = time.perf_counter() - start
            log(f" [TIMEOUT] after {duration:.2f}s")
        except Exception as e:
            duration = time.perf_counter() - start
            log(f" [ERROR] {e} in {duration:.2f}s")

if __name__ == "__main__":
    asyncio.run(diag())
