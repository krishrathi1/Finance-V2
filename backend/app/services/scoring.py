import math
from statistics import mean
from typing import Any


def _clamp(value: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, value))


def _num(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None:
            return default
        numeric = float(value)
        if not math.isfinite(numeric):
            return default
        return numeric
    except Exception:
        return default


def _avg(values: list[float], fallback: float) -> float:
    valid = [value for value in values if value is not None]
    return mean(valid) if valid else fallback


def compute_smart_score(metrics: dict[str, Any], technicals: dict[str, Any]) -> dict[str, Any]:
    roe = _num(metrics.get("roe"))
    roa = _num(metrics.get("roa"))
    roce = _num(metrics.get("roce"))
    pe_ratio = _num(metrics.get("peRatio"))
    pb_ratio = _num(metrics.get("pbRatio"))
    ev_to_sales = _num(metrics.get("evToSales"))
    peg_ratio = _num(metrics.get("pegRatio"))
    eps = _num(metrics.get("eps"))
    debt_to_equity = _num(metrics.get("debtToEquity"))
    current_ratio = _num(metrics.get("currentRatio"))
    rsi14 = _num(technicals.get("rsi14"))
    macd = _num(technicals.get("macd"))
    trend = str(technicals.get("trend") or "Neutral").lower()

    profitability = _avg(
        [
            _clamp((roe / 25) * 5, 0, 5) if roe is not None else None,
            _clamp((roa / 10) * 5, 0, 5) if roa is not None else None,
            _clamp((roce / 25) * 5, 0, 5) if roce is not None else None,
        ],
        fallback=2.5,
    )

    growth = _avg(
        [
            _clamp(5 - abs(peg_ratio - 1.2) * 1.8, 0, 5) if peg_ratio is not None and peg_ratio > 0 else None,
            _clamp((eps / 120) * 5, 0, 5) if eps is not None else None,
        ],
        fallback=2.5,
    )

    valuation = _avg(
        [
            _clamp(5 - ((pe_ratio - 15) / 20) * 5, 0, 5) if pe_ratio is not None and pe_ratio > 0 else None,
            _clamp(5 - ((pb_ratio - 2.5) / 3) * 5, 0, 5) if pb_ratio is not None and pb_ratio > 0 else None,
            _clamp(5 - ((ev_to_sales - 2) / 4) * 5, 0, 5) if ev_to_sales is not None and ev_to_sales > 0 else None,
        ],
        fallback=2.5,
    )

    momentum = _avg(
        [
            _clamp(5 - abs(rsi14 - 55) / 6, 0, 5) if rsi14 is not None else None,
            4.0 if trend == "bullish" else 2.0 if trend == "bearish" else 3.0,
            3.8 if macd is not None and macd > 0 else 2.2 if macd is not None and macd < 0 else None,
        ],
        fallback=2.5,
    )

    financial_health = _avg(
        [
            _clamp(5 - (debt_to_equity * 2.5), 0, 5) if debt_to_equity is not None else None,
            _clamp(5 - abs(current_ratio - 2.0) * 1.5, 0, 5) if current_ratio is not None and current_ratio > 0 else None,
        ],
        fallback=2.5,
    )

    dimensions = {
        "profitability": round(profitability, 2),
        "growth": round(growth, 2),
        "valuation": round(valuation, 2),
        "momentum": round(momentum, 2),
        "financialHealth": round(financial_health, 2),
    }
    score = round(mean(dimensions.values()), 2)
    return {
        "score": score,
        "maxScore": 5,
        "dimensions": dimensions,
        "label": "Strong" if score >= 4 else "Moderate" if score >= 2.5 else "Weak",
        "explanation": "Smart score combines profitability, growth, valuation, momentum and financial health.",
    }


def compute_risk_score(news_items: list[dict], metrics: dict[str, Any], technicals: dict[str, Any]) -> dict[str, Any]:
    sentiments: list[float] = []
    narrative_risk_scores: list[float] = []

    high_risk_keywords = ["fraud", "default", "lawsuit", "forensic", "bankruptcy", "insolvency", "probe", "raid"]
    medium_risk_keywords = ["downgrade", "decline", "fall", "debt", "pledge", "regulatory", "penalty", "miss"]

    for article in news_items:
        sentiments.append(float(article.get("sentimentScore", 0.5)))
        text = (article.get("title", "") + " " + article.get("summary", "")).lower()
        if any(key in text for key in high_risk_keywords):
            narrative_risk_scores.append(0.85)
        elif any(key in text for key in medium_risk_keywords):
            narrative_risk_scores.append(0.65)
        else:
            narrative_risk_scores.append(0.35)

    sentiment_risk = _clamp(1 - (mean(sentiments) if sentiments else 0.55), 0, 1)
    narrative_risk = _clamp(mean(narrative_risk_scores) if narrative_risk_scores else 0.45, 0, 1)

    debt_to_equity = _num(metrics.get("debtToEquity"))
    current_ratio = _num(metrics.get("currentRatio"))
    roa = _num(metrics.get("roa"))
    financial_risk = _avg(
        [
            _clamp(debt_to_equity / 2.5, 0, 1) if debt_to_equity is not None else None,
            _clamp((1.5 - current_ratio) / 1.5, 0, 1) if current_ratio is not None and current_ratio > 0 else None,
            _clamp((2.0 - roa) / 2.0, 0, 1) if roa is not None else None,
        ],
        fallback=0.5,
    )

    rsi14 = _num(technicals.get("rsi14"))
    macd = _num(technicals.get("macd"))
    trend = str(technicals.get("trend") or "Neutral").lower()
    technical_risk = _avg(
        [
            _clamp(abs(rsi14 - 50) / 40, 0, 1) if rsi14 is not None else None,
            0.35 if trend == "bullish" else 0.7 if trend == "bearish" else 0.5,
            0.35 if macd is not None and macd > 0 else 0.65 if macd is not None and macd < 0 else None,
        ],
        fallback=0.5,
    )

    weighted_risk = (
        0.25 * sentiment_risk
        + 0.25 * financial_risk
        + 0.30 * narrative_risk
        + 0.20 * technical_risk
    )
    risk_score = round(weighted_risk * 5, 2)
    return {
        "score": risk_score,
        "maxScore": 5,
        "components": {
            "sentiment": round(sentiment_risk * 5, 2),
            "financialRisk": round(financial_risk * 5, 2),
            "narrativeRisk": round(narrative_risk * 5, 2),
            "technicalRisk": round(technical_risk * 5, 2),
        },
        "label": "Low" if risk_score < 2 else "Medium" if risk_score < 3.5 else "High",
        "explanation": "Risk score uses weighted sentiment (25%), financial risk (25%), narrative signals (30%), and technical trend (20%).",
    }
