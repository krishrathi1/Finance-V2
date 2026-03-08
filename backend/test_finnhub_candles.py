import requests
import time

API_KEY = "d433rmhr01qvk0ja2ccgd433rmhr01qvk0ja2cd0"
symbol = "HDFCBANK.NS"

def test_finnhub_candles():
    print(f"Testing Finnhub Candles for {symbol}...")
    
    # 1 year range
    end = int(time.time())
    start = end - (365 * 24 * 3600)
    
    url = f"https://finnhub.io/api/v1/stock/candle"
    params = {
        "symbol": symbol,
        "resolution": "D",
        "from": start,
        "to": end,
        "token": API_KEY
    }
    
    r = requests.get(url, params=params)
    print("Status:", r.status_code)
    try:
        data = r.json()
        if data.get("s") == "ok":
            print("Successfully fetched candles!")
            print("Sample (First 2):")
            print("C:", data["c"][:2])
            print("T:", data["t"][:2])
            print("Total candles:", len(data["c"]))
        else:
            print("Finnhub response status not 'ok':", data)
    except Exception as e:
        print("Error:", e)
        print("Raw:", r.text)

if __name__ == "__main__":
    test_finnhub_candles()
