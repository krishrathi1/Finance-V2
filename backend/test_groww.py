import asyncio
import httpx
from datetime import datetime

async def test_groww_chart():
    symbol_raw = "HDFCBANK"
    url = f"https://groww.in/v1/api/charting_service/v2/chart/exchange/NSE/segment/CASH/{symbol_raw}?intervalInMinutes=1440&minimal=true"
    
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
        print("Status Code:", r.status_code)
        if r.status_code == 200:
            data = r.json()
            candles = data.get("candles", [])
            print(f"Candles count: {len(candles)}")
            if candles:
                c = candles[0]
                print(f"First raw candle: {c}")
                try:
                    # Let's see if c[0] is seconds or ms
                    dt_s = datetime.fromtimestamp(c[0])
                    print(f"Parsed directly (seconds?): {dt_s}")
                except Exception as e:
                    print("Direct parse failed:", e)
                try:
                    dt_ms = datetime.fromtimestamp(c[0] / 1000)
                    print(f"Parsed / 1000 (ms?): {dt_ms}")
                except Exception as e:
                    print("Parse / 1000 failed:", e)

if __name__ == "__main__":
    asyncio.run(test_groww_chart())
