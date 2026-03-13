import asyncio
from datetime import datetime, timedelta, timezone
import json
import re

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
        data = await _enrich_score_explanations(symbol=symbol, data=data)
        await redis_cache.set_json(cache_key, data, ttl_seconds=settings.cache_ttl_seconds)
        await redis_cache.set_json(stale_key, data, ttl_seconds=60 * 60 * 24 * 7)
    except Exception:
        return


async def _enrich_score_explanations(symbol: str, data: dict) -> dict:
    data = await _enrich_profile_details(symbol=symbol, data=data)
    data = await _enrich_smart_score_explanation(symbol=symbol, data=data)
    data = await _enrich_risk_score_explanation(symbol=symbol, data=data)
    return data


async def _enrich_profile_details(symbol: str, data: dict) -> dict:
    if not isinstance(data, dict):
        return data

    profile = data.get("profile")
    if not isinstance(profile, dict):
        return data

    changed = False

    description = str(profile.get("description") or "").strip()
    if (not profile.get("incorporationYear")) and description:
        match = re.search(r"\bincorporated in (\d{4})\b", description, flags=re.IGNORECASE)
        if match:
            try:
                profile["incorporationYear"] = int(match.group(1))
                changed = True
            except Exception:
                pass

    if not str(profile.get("headquarters") or "").strip() and description:
        match = re.search(r"\bheadquartered in ([A-Za-z ,.-]+?)(?:\.|, and| and is| with|$)", description, flags=re.IGNORECASE)
        if match:
            headquarters = " ".join(match.group(1).split()).strip(" ,.")
            if headquarters:
                profile["headquarters"] = headquarters
                changed = True

    needs_ai = (
        not profile.get("incorporationYear")
        or not str(profile.get("headquarters") or "").strip()
        or str(profile.get("chairman") or "").strip() in {"", "N/A"}
        or str(profile.get("previousName") or "").strip() in {"", "N/A"}
    )

    if needs_ai and bool(str(settings.gemini_api_key or "").strip()):
        try:
            raw = await asyncio.wait_for(ai_adapter.extract_profile_details(symbol=symbol, context=data), timeout=12)
            parsed = _parse_profile_json(raw)
            year_value = parsed.get("incorporationYear")
            if not profile.get("incorporationYear") and isinstance(year_value, int) and 1800 <= year_value <= datetime.now().year:
                profile["incorporationYear"] = year_value
                changed = True

            headquarters_value = str(parsed.get("headquarters") or "").strip()
            if not str(profile.get("headquarters") or "").strip() and headquarters_value:
                profile["headquarters"] = headquarters_value
                changed = True

            chairman_value = str(parsed.get("chairman") or "").strip()
            if str(profile.get("chairman") or "").strip() in {"", "N/A"} and chairman_value:
                profile["chairman"] = chairman_value
                changed = True

            previous_name_value = str(parsed.get("previousName") or "").strip()
            if str(profile.get("previousName") or "").strip() in {"", "N/A"} and previous_name_value:
                profile["previousName"] = previous_name_value
                changed = True
        except Exception:
            pass

    if not str(profile.get("chairman") or "").strip():
        profile["chairman"] = "N/A"
    if not str(profile.get("previousName") or "").strip():
        profile["previousName"] = "N/A"

    if changed:
        data["profile"] = profile
    return data


def _parse_profile_json(raw: str) -> dict:
    text = str(raw or "").strip()
    if not text:
        return {}
    fenced = re.search(r"\{.*\}", text, flags=re.DOTALL)
    candidate = fenced.group(0) if fenced else text
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


async def _enrich_smart_score_explanation(symbol: str, data: dict) -> dict:
    smart = data.get("smartScore") if isinstance(data, dict) else None
    if not isinstance(smart, dict):
        return data

    methodology = (
        "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. "
        "A bounded walk-forward ML signal validates trend persistence before applying a small score adjustment."
    )
    smart["methodology"] = smart.get("methodology") or methodology
    dims = smart.get("dimensions") if isinstance(smart.get("dimensions"), dict) else {}
    weak_hint = None
    if dims:
        weakest = sorted(dims.items(), key=lambda item: float(item[1]))[0][0]
        weak_hint = str(weakest)

    gemini_enabled = bool(str(settings.gemini_api_key or "").strip())
    ai_explanation = str(smart.get("aiExplanation") or "").strip()
    ai_source = str(smart.get("aiSource") or "").strip().lower()

    # If Gemini is now enabled, refresh non-Gemini (or missing) explanations once and cache them.
    if gemini_enabled and (not ai_explanation or ai_source != "gemini"):
        try:
            generated = await asyncio.wait_for(ai_adapter.explain_smart_score(symbol=symbol, context=data), timeout=12)
            if generated and str(generated).strip():
                smart["aiExplanation"] = _to_plain_language_ai_text(
                    symbol=symbol,
                    score=float(smart.get("score", 0.0) or 0.0),
                    label=str(smart.get("label") or "Moderate"),
                    text=str(generated).strip(),
                    weak_hint=weak_hint,
                )
                smart["aiSource"] = "gemini"
                return data
        except Exception:
            pass

    if ai_explanation:
        smart["aiExplanation"] = _to_plain_language_ai_text(
            symbol=symbol,
            score=float(smart.get("score", 0.0) or 0.0),
            label=str(smart.get("label") or "Moderate"),
            text=ai_explanation,
            weak_hint=weak_hint,
        )
        if ai_source not in {"gemini", "fallback"}:
            smart["aiSource"] = "fallback"
        return data

    score_value = float(smart.get("score", 0.0) or 0.0)
    label = str(smart.get("label") or "Moderate")
    smart["aiExplanation"] = _to_plain_language_ai_text(
        symbol=symbol,
        score=score_value,
        label=label,
        text=(
            f"{symbol.upper()} has a Smart Score of {score_value:.1f} out of 5 ({label}). "
            "Some parts are good, but some parts are weak right now, so it is better to invest slowly."
        ),
        weak_hint=weak_hint,
    )
    smart["aiSource"] = "fallback"
    return data


def _to_plain_language_ai_text(symbol: str, score: float, label: str, text: str, weak_hint: str | None = None) -> str:
    simplified = " ".join(str(text or "").split())
    replacements = {
        r"\bsetup\b": "overall picture",
        r"\bposition sizing\b": "how much money to put",
        r"\ballocation\b": "money split",
        r"\bconviction\b": "confidence",
        r"\bdrawdown\b": "price fall",
        r"\bvolatility\b": "price ups and downs",
        r"\bmomentum\b": "recent price trend",
        r"\bprofitability\b": "profit strength",
        r"\bfinancialHealth\b": "financial safety",
        r"\bfinancial health\b": "financial safety",
        r"\bneutral setup\b": "middle rating",
        r"\bbullish\b": "positive",
        r"\bbearish\b": "weak",
    }
    for pattern, target in replacements.items():
        simplified = re.sub(pattern, target, simplified, flags=re.IGNORECASE)

    if "smart score" not in simplified.lower():
        simplified = (
            f"{symbol.upper()} has a Smart Score of {score:.1f} out of 5 ({label}). "
            f"{simplified}"
        ).strip()

    # Keep text short and easy to scan in the UI.
    if len(simplified) > 220:
        chunks = re.split(r"(?<=[.!?])\s+", simplified)
        simplified = " ".join(chunks[:2]).strip()
    if not re.search(r"\b(weak|caution|careful|risk|go slowly|invest slowly|watch)\b", simplified, flags=re.IGNORECASE):
        hint = (weak_hint or "momentum").replace("financialHealth", "financial safety")
        hint = hint.replace("momentum", "recent price trend").replace("profitability", "profit strength")
        base = simplified.strip()
        if base and base[-1] not in ".!?":
            base += "."
        simplified = f"{base} The weak part right now is {hint}, so invest slowly."
    return simplified


async def _enrich_risk_score_explanation(symbol: str, data: dict) -> dict:
    risk = data.get("riskScore") if isinstance(data, dict) else None
    if not isinstance(risk, dict):
        return data

    methodology = (
        "Risk score combines market mood, company financial stress, negative news signals, and price instability."
    )
    risk["methodology"] = risk.get("methodology") or methodology

    components = risk.get("components") if isinstance(risk.get("components"), dict) else {}
    high_hint = None
    if components:
        highest = sorted(components.items(), key=lambda item: float(item[1]), reverse=True)[0][0]
        high_hint = str(highest)

    gemini_enabled = bool(str(settings.gemini_api_key or "").strip())
    ai_explanation = str(risk.get("aiExplanation") or "").strip()
    ai_source = str(risk.get("aiSource") or "").strip().lower()

    # If Gemini is now enabled, refresh non-Gemini (or missing) explanations once and cache them.
    if gemini_enabled and (not ai_explanation or ai_source != "gemini"):
        try:
            generated = await asyncio.wait_for(ai_adapter.explain_risk_score(symbol=symbol, context=data), timeout=12)
            if generated and str(generated).strip():
                risk["aiExplanation"] = _to_plain_language_risk_text(
                    symbol=symbol,
                    score=float(risk.get("score", 0.0) or 0.0),
                    label=str(risk.get("label") or "Medium"),
                    text=str(generated).strip(),
                    high_hint=high_hint,
                )
                risk["aiSource"] = "gemini"
                return data
        except Exception:
            pass

    if ai_explanation:
        risk["aiExplanation"] = _to_plain_language_risk_text(
            symbol=symbol,
            score=float(risk.get("score", 0.0) or 0.0),
            label=str(risk.get("label") or "Medium"),
            text=ai_explanation,
            high_hint=high_hint,
        )
        if ai_source not in {"gemini", "fallback"}:
            risk["aiSource"] = "fallback"
        return data

    score_value = float(risk.get("score", 0.0) or 0.0)
    label = str(risk.get("label") or "Medium")
    risk["aiExplanation"] = _to_plain_language_risk_text(
        symbol=symbol,
        score=score_value,
        label=label,
        text=(
            f"{symbol.upper()} has a Risk Score of {score_value:.1f} out of 5 ({label}). "
            "Risk is not very low right now, so it is better to invest slowly and watch news and price moves."
        ),
        high_hint=high_hint,
    )
    risk["aiSource"] = "fallback"
    return data


def _to_plain_language_risk_text(symbol: str, score: float, label: str, text: str, high_hint: str | None = None) -> str:
    simplified = " ".join(str(text or "").split())
    replacements = {
        r"\bsetup\b": "overall picture",
        r"\bposition sizing\b": "how much money to put",
        r"\ballocation\b": "money split",
        r"\bconviction\b": "confidence",
        r"\bdrawdown\b": "price fall",
        r"\bvolatility\b": "price ups and downs",
        r"\bmomentum\b": "recent price trend",
        r"\bfinancialRisk\b": "financial risk",
        r"\bnarrativeRisk\b": "news risk",
        r"\btechnicalRisk\b": "price trend risk",
        r"\bsentiment\b": "market mood",
        r"\bbullish\b": "positive",
        r"\bbearish\b": "weak",
    }
    for pattern, target in replacements.items():
        simplified = re.sub(pattern, target, simplified, flags=re.IGNORECASE)

    if "risk score" not in simplified.lower():
        simplified = (
            f"{symbol.upper()} has a Risk Score of {score:.1f} out of 5 ({label}). "
            f"{simplified}"
        ).strip()

    if len(simplified) > 220:
        chunks = re.split(r"(?<=[.!?])\s+", simplified)
        simplified = " ".join(chunks[:2]).strip()

    if not re.search(r"\b(invest slowly|careful|risk|watch)\b", simplified, flags=re.IGNORECASE):
        hint = (high_hint or "technicalRisk").replace("technicalRisk", "price trend risk")
        hint = hint.replace("narrativeRisk", "news risk").replace("financialRisk", "financial risk")
        base = simplified.strip()
        if base and base[-1] not in ".!?":
            base += "."
        simplified = f"{base} The main risk now is {hint}, so invest slowly."
    return simplified


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
        cached = await _enrich_score_explanations(symbol=symbol, data=cached)
        await redis_cache.set_json(cache_key, cached, ttl_seconds=settings.cache_ttl_seconds)
        await redis_cache.set_json(stale_key, cached, ttl_seconds=60 * 60 * 24 * 7)
        return {"cached": True, "data": cached}

    try:
        data = await asyncio.wait_for(dashboard_service.get_dashboard(symbol=symbol, timeframe=timeframe), timeout=45)
        data = await _enrich_score_explanations(symbol=symbol, data=data)
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
    answer, source = await ai_adapter.chat(symbol=symbol, question=payload.question, context=dashboard)
    return ChatResponse(answer=answer, source=source)


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
