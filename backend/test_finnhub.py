import requests

API_KEY = "d433rmhr01qvk0ja2ccgd433rmhr01qvk0ja2cd0"
symbol = "HDFCBANK.NS"

def test_finnhub():
    print(f"Testing Finnhub for {symbol}...")
    
    # Quote
    r = requests.get(f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={API_KEY}")
    print("Quote:", r.json())
    
    # Profile
    r = requests.get(f"https://finnhub.io/api/v1/stock/profile2?symbol={symbol}&token={API_KEY}")
    print("Profile:", r.json())
    
    # Basic Financials
    r = requests.get(f"https://finnhub.io/api/v1/stock/metric?symbol={symbol}&metric=all&token={API_KEY}")
    print("Metrics keys:", r.json().keys() if r.status_code == 200 else r.text)

if __name__ == "__main__":
    test_finnhub()
