import requests
import json
import time

API_KEY = "yeBDQbGRTPpEpvQoqs5ToXnDzid7XnBN"
# Polygon usually uses X:NSE:SYMBOL for Indian stocks
symbol = "X:NSE:RELIANCE"

def test_polygon():
    print(f"Testing Polygon for {symbol}...")
    
    # 1. Quote (Snapshot)
    url_quote = f"https://api.polygon.io/v2/snapshot/locale/global/markets/stocks/tickers/{symbol}?apiKey={API_KEY}"
    r_quote = requests.get(url_quote)
    print("Snapshot Status:", r_quote.status_code)
    print("Snapshot Data:", r_quote.text[:500])

    # 2. Aggregates (Candles)
    end = int(time.time() * 1000)
    start = end - (7 * 24 * 3600 * 1000)
    url_aggs = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{start}/{end}?adjusted=true&sort=asc&apiKey={API_KEY}"
    r_aggs = requests.get(url_aggs)
    print("Aggs Status:", r_aggs.status_code)
    print("Aggs Data:", r_aggs.text[:500])

if __name__ == "__main__":
    test_polygon()
