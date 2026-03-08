import requests
import json

API_KEY = "1kCAXeLnkaQ3GF2L5yuuu2AqCDMGFquq"
# FMP uses .NS or .BO
symbol = "RELIANCE.NS"

def test_fmp_candles():
    print(f"Testing FMP Candles for {symbol}...")
    
    # Daily candles
    url = f"https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}?apikey={API_KEY}"
    
    r = requests.get(url)
    print("Status:", r.status_code)
    try:
        data = r.json()
        if "historical" in data:
            print("Successfully fetched candles!")
            print("Sample (First 2):", json.dumps(data["historical"][:2], indent=2))
            print("Total candles:", len(data["historical"]))
        else:
            print("FMP response error:", data)
    except Exception as e:
        print("Error:", e)
        print("Raw:", r.text[:500])

if __name__ == "__main__":
    test_fmp_candles()
