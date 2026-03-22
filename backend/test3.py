import urllib.request
import json
from app.core.config import get_settings

s = get_settings()
url = f"https://financialmodelingprep.com/stable/stock-screener?exchange=NSE&exchangeShortName=NSE&country=IN&sector=Technology&limit=5&apikey={s.fmp_api_key}"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        with open('test3_out.json', 'w') as f:
            json.dump(data, f)
except Exception as e:
    with open('test3_out.json', 'w') as f:
        json.dump({"error": str(e)}, f)
