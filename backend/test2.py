import requests
from app.core.config import get_settings

s = get_settings()
# Fetch all NSE stocks from screener
url = f"https://financialmodelingprep.com/stable/stock-screener?exchange=NSE&exchangeShortName=NSE&country=IN&limit=500&apikey={s.fmp_api_key}"
try:
    data = requests.get(url).json()
    print(f"Total returned without sector: {len(data)}")
    
    sectors = {}
    for d in data:
        sec = d.get('sector', 'Unknown')
        sectors[sec] = sectors.get(sec, 0) + 1
        
    print(f"Sectors found: {sectors}")
    
    url_tech = f"https://financialmodelingprep.com/stable/stock-screener?exchange=NSE&exchangeShortName=NSE&country=IN&sector=Technology&limit=500&apikey={s.fmp_api_key}"
    data_tech = requests.get(url_tech).json()
    print(f"Total returned by FMP for Technology: {len(data_tech)}")

except Exception as e:
    print(e)
