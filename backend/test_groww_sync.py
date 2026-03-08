import requests
from datetime import datetime

symbol_raw = "HDFCBANK"
url = f"https://groww.in/v1/api/charting_service/v2/chart/exchange/NSE/segment/CASH/{symbol_raw}?intervalInMinutes=1440&minimal=true"

try:
    r = requests.get(url)
    with open("groww_dump.txt", "w") as f:
        f.write(f"Status: {r.status_code}\n")
        if r.status_code == 200:
            data = r.json()
            candles = data.get("candles", [])
            f.write(f"Count: {len(candles)}\n")
            if candles:
                c = candles[0]
                f.write(f"First candle: {c}\n")
                try:
                    dt = datetime.fromtimestamp(c[0])
                    f.write(f"Seconds parsed: {dt}\n")
                except Exception as e:
                    f.write(f"Seconds parse failed: {e}\n")
                
                try:
                    dt_ms = datetime.fromtimestamp(c[0] / 1000.0)
                    f.write(f"Ms parsed: {dt_ms}\n")
                except Exception as e:
                    f.write(f"Ms parse failed: {e}\n")
except Exception as e:
    with open("groww_dump.txt", "w") as f:
        f.write(f"Error: {e}\n")
