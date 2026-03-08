import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from app.core.cache import redis_cache
from app.core.config import get_settings
from app.schemas.stock import ChatRequest, ChatResponse, ReportResponse
from app.services.ai_adapter import AIAdapter
from app.services.dashboard import StockDashboardService


router = APIRouter(prefix="/stocks", tags=["stocks"])
settings = get_settings()
dashboard_service = StockDashboardService()
ai_adapter = AIAdapter()
IST = timezone(timedelta(hours=5, minutes=30))


async def _refresh_market_news_cache(today: str, cache_key: str, stale_key: str) -> None:
    try:
        data = await dashboard_service.get_market_news()
        if data:
            payload = {"date": today, "items": data, "fetchedAt": datetime.now(IST).isoformat()}
            await redis_cache.set_json(cache_key, payload, ttl_seconds=60 * 60 * 30)
            await redis_cache.set_json(stale_key, payload, ttl_seconds=60 * 60 * 24 * 7)
    except Exception:
        return


async def _refresh_dashboard_cache(symbol: str, timeframe: str, cache_key: str, stale_key: str) -> None:
    try:
        data = await asyncio.wait_for(dashboard_service.get_dashboard(symbol=symbol, timeframe=timeframe), timeout=55)
        await redis_cache.set_json(cache_key, data, ttl_seconds=settings.cache_ttl_seconds)
        await redis_cache.set_json(stale_key, data, ttl_seconds=60 * 60 * 24 * 7)
    except Exception:
        return


@router.get("/search")
async def search_stocks(q: str = Query("", min_length=0, max_length=50)) -> dict:
    return {"results": await dashboard_service.search_stocks(q)}

@router.get("/ticker")
async def get_ticker(
    symbols: str = Query("", max_length=5000),
    refresh: bool = Query(False),
) -> dict:
    symbol_list = [item.strip().upper() for item in symbols.split(",") if item.strip()] if symbols else []
    key_part = ",".join(symbol_list) if symbol_list else "default"
    cache_key = f"ticker:{key_part}"
    cached = await redis_cache.get_json(cache_key)
    if cached and not refresh:
        return {"cached": True, "data": cached}

    try:
        data = await dashboard_service.get_ticker_tape(symbol_list or None)
        await redis_cache.set_json(cache_key, data, ttl_seconds=15)
        return {"cached": False, "data": data}
    except Exception:
        if cached:
            return {"cached": True, "stale": True, "data": cached}
        raise

@router.get("/index-heatmap")
async def get_index_heatmap(
    index: str = Query("NIFTY 50", min_length=1, max_length=80),
    refresh: bool = Query(False),
) -> dict:
    normalized = index.strip() or "NIFTY 50"
    cache_key = f"index-heatmap:{normalized.upper()}"
    stale_key = f"index-heatmap:last:{normalized.upper()}"
    cached = await redis_cache.get_json(cache_key) if not refresh else None
    if cached:
        return {"cached": True, **cached}

    payload = await dashboard_service.get_index_heatmap(normalized)
    rows = payload.get("rows") if isinstance(payload, dict) else []
    if rows:
        await redis_cache.set_json(cache_key, payload, ttl_seconds=30)
        await redis_cache.set_json(stale_key, payload, ttl_seconds=60 * 60 * 24 * 7)
        return {"cached": False, **payload}

    stale = await redis_cache.get_json(stale_key)
    if stale:
        return {"cached": True, "stale": True, **stale}
    return {"cached": False, **payload}


@router.get("/market-news")
async def get_market_news(refresh: bool = Query(False)) -> dict:
    today = datetime.now(IST).date().isoformat()
    cache_key = "market-news:latest"
    stale_key = "market-news:last"
    cached = await redis_cache.get_json(cache_key) if not refresh else None
    if isinstance(cached, dict):
        cached_date = str(cached.get("date") or "")
        cached_rows = cached.get("items") if isinstance(cached.get("items"), list) else []
        fetched_at_raw = str(cached.get("fetchedAt") or "")
        fetched_at = None
        if fetched_at_raw:
            try:
                fetched_at = datetime.fromisoformat(fetched_at_raw)
            except Exception:
                fetched_at = None
        age_seconds = (datetime.now(IST) - fetched_at).total_seconds() if fetched_at else 0
        if cached_rows and cached_date == today:
            if age_seconds > 600:
                asyncio.create_task(_refresh_market_news_cache(today, cache_key, stale_key))
            return {"cached": True, "date": cached_date, "data": cached_rows}
        if cached_rows:
            asyncio.create_task(_refresh_market_news_cache(today, cache_key, stale_key))
            return {"cached": True, "stale": True, "date": cached_date, "data": cached_rows}

    stale = await redis_cache.get_json(stale_key)
    if not refresh and isinstance(stale, dict):
        stale_rows = stale.get("items") if isinstance(stale.get("items"), list) else []
        stale_date = str(stale.get("date") or today)
        if stale_rows:
            asyncio.create_task(_refresh_market_news_cache(today, cache_key, stale_key))
            return {"cached": True, "stale": True, "date": stale_date, "data": stale_rows}

    data = await dashboard_service.get_market_news()
    if data:
        payload = {"date": today, "items": data, "fetchedAt": datetime.now(IST).isoformat()}
        await redis_cache.set_json(cache_key, payload, ttl_seconds=60 * 60 * 30)
        await redis_cache.set_json(stale_key, payload, ttl_seconds=60 * 60 * 24 * 7)
        return {"cached": False, "date": today, "data": data}

    if isinstance(cached, dict):
        fallback_rows = cached.get("items") if isinstance(cached.get("items"), list) else []
        fallback_date = str(cached.get("date") or today)
        if fallback_rows:
            return {"cached": True, "date": fallback_date, "data": fallback_rows}

    if isinstance(stale, dict):
        stale_rows = stale.get("items") if isinstance(stale.get("items"), list) else []
        stale_date = str(stale.get("date") or today)
        if stale_rows:
            return {"cached": True, "stale": True, "date": stale_date, "data": stale_rows}

    return {"cached": False, "date": today, "data": []}


@router.get("/{symbol}/dashboard")
async def get_stock_dashboard(
    symbol: str,
    timeframe: str = Query("5Y"),
    refresh: bool = Query(False),
) -> dict:
    cache_key = f"dashboard:{symbol.upper()}:{timeframe}"
    stale_key = f"dashboard:last:{symbol.upper()}:{timeframe}"
    cached = await redis_cache.get_json(cache_key) if not refresh else None
    if cached:
        return {"cached": True, "data": cached}

    try:
        data = await asyncio.wait_for(dashboard_service.get_dashboard(symbol=symbol, timeframe=timeframe), timeout=45)
        await redis_cache.set_json(cache_key, data, ttl_seconds=settings.cache_ttl_seconds)
        await redis_cache.set_json(stale_key, data, ttl_seconds=60 * 60 * 24 * 7)
        return {"cached": False, "data": data}
    except Exception as exc:
        stale = await redis_cache.get_json(stale_key)
        if stale:
            asyncio.create_task(_refresh_dashboard_cache(symbol=symbol, timeframe=timeframe, cache_key=cache_key, stale_key=stale_key))
            return {"cached": True, "stale": True, "data": stale}
        raise HTTPException(status_code=504, detail="Dashboard data source timed out or returned an error") from exc


@router.post("/{symbol}/chat", response_model=ChatResponse)
async def chat_with_ai(symbol: str, payload: ChatRequest) -> ChatResponse:
    dashboard = await dashboard_service.get_dashboard(symbol=symbol)
    answer = await ai_adapter.chat(symbol=symbol, question=payload.question, context=dashboard)
    return ChatResponse(answer=answer)


@router.get("/{symbol}/research-report", response_model=ReportResponse)
async def get_research_report(symbol: str) -> ReportResponse:
    dashboard = await dashboard_service.get_dashboard(symbol=symbol)
    report = await ai_adapter.generate_report(symbol=symbol, context=dashboard)
    return ReportResponse(symbol=symbol.upper(), report_markdown=report)


@router.get("/{symbol}/returns-projection")
async def get_returns_projection(
    symbol: str,
    amount: float = Query(..., gt=0),
    cagr: float = Query(..., ge=0, le=100),
    years: int = Query(..., ge=1, le=40),
) -> dict:
    points = []
    for year in range(0, years + 1):
        value = amount * ((1 + cagr / 100) ** year)
        points.append({"year": year, "value": round(value, 2)})
    return {
        "symbol": symbol.upper(),
        "amount": amount,
        "cagr": cagr,
        "years": years,
        "futureValue": points[-1]["value"],
        "series": points,
    }


@router.get("/{symbol}/health-check")
async def stock_health(symbol: str) -> dict:
    if not symbol.strip():
        raise HTTPException(status_code=400, detail="Invalid symbol")
    return {"symbol": symbol.upper(), "status": "ok"}
