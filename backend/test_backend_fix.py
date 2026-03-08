import asyncio
from app.services.dashboard import StockDashboardService

async def test_dashboard_logic():
    print("Initializing dashboard service...")
    service = StockDashboardService()
    symbol = "RELIANCE"
    print(f"Fetching dashboard for {symbol}...")
    try:
        # Mocking or just calling it to see if it crashes before async calls
        # We'll just test if the class can be instantiated and methods are there
        print("Service methods:", [m for m in dir(service) if not m.startswith("__")])
        print("Provider methods:", [m for m in dir(service.providers) if not m.startswith("__")])
        
        # Test a small part of get_dashboard if possible or just check imports
        print("Basic import test successful.")
    except Exception as e:
        print(f"CRASH: {e}")

if __name__ == "__main__":
    asyncio.run(test_dashboard_logic())
