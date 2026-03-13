from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any


IST = timezone(timedelta(hours=5, minutes=30))


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


def _avg(values: list[float | None], fallback: float) -> float:
    valid = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    return mean(valid) if valid else fallback


def _normalize(value: float | None, low: float, high: float) -> float | None:
    if value is None:
        return None
    if high <= low:
        return None
    return _clamp((value - low) / (high - low), 0.0, 1.0)


def _inverse_normalize(value: float | None, low: float, high: float) -> float | None:
    score = _normalize(value, low, high)
    return None if score is None else 1.0 - score


def _pct_change(current: float | None, base: float | None) -> float | None:
    if current is None or base is None or abs(base) < 1e-9:
        return None
    return ((current - base) / abs(base)) * 100.0


def _daily_returns(closes: list[float]) -> list[float]:
    if len(closes) < 2:
        return []
    out: list[float] = []
    for idx in range(1, len(closes)):
        prev = closes[idx - 1]
        curr = closes[idx]
        if prev <= 0:
            continue
        out.append((curr / prev) - 1.0)
    return out


def _std(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    avg = mean(values)
    var = sum((v - avg) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(var)


def _max_drawdown(closes: list[float]) -> float | None:
    if not closes:
        return None
    peak = closes[0]
    max_dd = 0.0
    for price in closes:
        if price > peak:
            peak = price
        if peak > 0:
            dd = (peak - price) / peak
            if dd > max_dd:
                max_dd = dd
    return max_dd


def _latest_nonempty_rows(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _statement_value(row: dict[str, Any], keys: list[str]) -> float | None:
    normalized_keys = [re.sub(r"[^a-z0-9]", "", k.lower()) for k in keys]
    for key, value in row.items():
        key_norm = re.sub(r"[^a-z0-9]", "", str(key).lower())
        if any(candidate in key_norm for candidate in normalized_keys):
            numeric = _num(value)
            if numeric is not None:
                return numeric
    return None


def _parse_trade_date(raw: str) -> datetime | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    date_part = raw.split(" ")[0]
    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%B-%Y", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(date_part, fmt)
            return dt.replace(tzinfo=IST)
        except Exception:
            continue
    return None


def _extract_growth_features(financials: dict[str, Any]) -> dict[str, float | None]:
    quarterly = _latest_nonempty_rows(financials.get("quarterly"))
    yearly = _latest_nonempty_rows(financials.get("yearly"))
    qd_cons = _latest_nonempty_rows(financials.get("quarterlyDetailedConsolidated"))
    qd_standalone = _latest_nonempty_rows(financials.get("quarterlyDetailedStandalone"))
    qd = qd_cons or qd_standalone

    revenue_growth = None
    profit_growth = None
    if len(quarterly) >= 5:
        revenue_growth = _pct_change(_num(quarterly[-1].get("revenue")), _num(quarterly[-5].get("revenue")))
        profit_growth = _pct_change(_num(quarterly[-1].get("profit")), _num(quarterly[-5].get("profit")))
    elif len(yearly) >= 2:
        revenue_growth = _pct_change(_num(yearly[-1].get("revenue")), _num(yearly[-2].get("revenue")))
        profit_growth = _pct_change(_num(yearly[-1].get("profit")), _num(yearly[-2].get("profit")))

    eps_growth = None
    if len(qd) >= 5:
        latest_eps = _num(qd[-1].get("basicEps")) or _num(qd[-1].get("dilutedEps"))
        prev_eps = _num(qd[-5].get("basicEps")) or _num(qd[-5].get("dilutedEps"))
        eps_growth = _pct_change(latest_eps, prev_eps)

    fcf_growth = None
    if len(yearly) >= 2:
        latest_fcf = _num(yearly[-1].get("cashFlow"))
        previous_fcf = _num(yearly[-2].get("cashFlow"))
        fcf_growth = _pct_change(latest_fcf, previous_fcf)

    return {
        "revenueGrowth": revenue_growth,
        "profitGrowth": profit_growth,
        "epsGrowth": eps_growth,
        "freeCashFlowGrowth": fcf_growth,
    }


def _compute_altman_z(metrics: dict[str, Any], financials: dict[str, Any]) -> float | None:
    balance_sheet_rows = _latest_nonempty_rows(financials.get("balanceSheet"))
    income_rows = _latest_nonempty_rows(financials.get("incomeStatement"))
    if not balance_sheet_rows or not income_rows:
        return None

    bs = balance_sheet_rows[0]
    inc = income_rows[0]
    total_assets = _statement_value(bs, ["totalAssets", "assets"])
    total_liabilities = _statement_value(bs, ["totalLiabilities", "liabilities"])
    retained_earnings = _statement_value(bs, ["retainedEarnings"])
    current_assets = _statement_value(bs, ["currentAssets"])
    current_liabilities = _statement_value(bs, ["currentLiabilities"])
    working_capital = (
        _statement_value(bs, ["workingCapital"])
        if _statement_value(bs, ["workingCapital"]) is not None
        else (
            (current_assets - current_liabilities)
            if current_assets is not None and current_liabilities is not None
            else None
        )
    )
    ebit = _statement_value(inc, ["ebit", "operatingIncome"])
    sales = _statement_value(inc, ["revenue", "sales"])
    market_value_equity = _num(metrics.get("marketCap"))

    if (
        total_assets is None
        or abs(total_assets) < 1e-9
        or total_liabilities is None
        or abs(total_liabilities) < 1e-9
        or market_value_equity is None
        or working_capital is None
        or retained_earnings is None
        or ebit is None
        or sales is None
    ):
        return None

    z_score = (
        1.2 * (working_capital / total_assets)
        + 1.4 * (retained_earnings / total_assets)
        + 3.3 * (ebit / total_assets)
        + 0.6 * (market_value_equity / total_liabilities)
        + 1.0 * (sales / total_assets)
    )
    return z_score if math.isfinite(z_score) else None


def _insider_signal(corporate_actions: dict[str, Any] | None) -> float:
    actions = corporate_actions or {}
    rows = actions.get("insiderTrades") if isinstance(actions, dict) else []
    if not isinstance(rows, list):
        return 0.5
    now = datetime.now(IST)
    cutoff = now - timedelta(days=180)
    buys = 0
    sells = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        trade_date = _parse_trade_date(str(row.get("date") or ""))
        if trade_date and trade_date < cutoff:
            continue
        signal_text = f"{row.get('transactionType', '')} {row.get('orderType', '')}".lower()
        if any(token in signal_text for token in ["buy", "acquire", "purchase"]):
            buys += 1
        elif any(token in signal_text for token in ["sell", "dispose", "pledge"]):
            sells += 1
    if buys + sells == 0:
        return 0.5
    net_ratio = (buys - sells) / (buys + sells)
    return _clamp((net_ratio + 1.0) / 2.0, 0.0, 1.0)


def _institutional_signal(shareholding: dict[str, Any] | None) -> float:
    if not isinstance(shareholding, dict):
        return 0.5
    fii = _num(shareholding.get("fii"))
    dii = _num(shareholding.get("dii"))
    promoters = _num(shareholding.get("promoters"))
    institutional = fii + dii if fii is not None and dii is not None else None
    components = [
        _normalize(institutional, 15.0, 75.0),
        _normalize(promoters, 20.0, 75.0),
    ]
    return _avg(components, 0.5)


def _extract_price_features(price_history: list[dict[str, Any]] | None) -> dict[str, float | None]:
    history = price_history or []
    closes = [float(item.get("close")) for item in history if _num(item.get("close")) is not None]
    if len(closes) < 10:
        return {
            "return1M": None,
            "return3M": None,
            "return6M": None,
            "volatility3M": None,
            "drawdown1Y": None,
        }
    returns = _daily_returns(closes)
    return_1m = _pct_change(closes[-1], closes[-22]) if len(closes) > 22 else None
    return_3m = _pct_change(closes[-1], closes[-64]) if len(closes) > 64 else None
    return_6m = _pct_change(closes[-1], closes[-127]) if len(closes) > 127 else None
    last_63_returns = returns[-63:] if len(returns) >= 63 else returns
    vol_3m = _std(last_63_returns)
    if vol_3m is not None:
        vol_3m *= math.sqrt(252)
    window = closes[-252:] if len(closes) >= 252 else closes
    drawdown_1y = _max_drawdown(window)
    return {
        "return1M": return_1m,
        "return3M": return_3m,
        "return6M": return_6m,
        "volatility3M": vol_3m,
        "drawdown1Y": drawdown_1y,
    }


def _sigmoid(value: float) -> float:
    if value < -35:
        return 0.0
    if value > 35:
        return 1.0
    return 1.0 / (1.0 + math.exp(-value))


def _walk_forward_ml_adjustment(
    price_history: list[dict[str, Any]] | None,
    financial_health_score: float,
    valuation_score: float,
) -> tuple[float, float, dict[str, Any]]:
    history = price_history or []
    closes = [float(item.get("close")) for item in history if _num(item.get("close")) is not None]
    if len(closes) < 220:
        return 0.0, 0.0, {"samples": 0, "horizonDays": 63, "hitRate": None}

    samples: list[tuple[list[float], int]] = []
    horizon = 63
    for idx in range(130, len(closes) - horizon):
        p_now = closes[idx]
        p_1m = closes[idx - 21]
        p_3m = closes[idx - 63]
        p_6m = closes[idx - 126]
        future = closes[idx + horizon]
        if min(p_now, p_1m, p_3m, p_6m) <= 0:
            continue
        mom_1m = (p_now / p_1m) - 1.0
        mom_3m = (p_now / p_3m) - 1.0
        mom_6m = (p_now / p_6m) - 1.0
        window_returns = _daily_returns(closes[idx - 63:idx + 1])
        vol = _std(window_returns) or 0.0
        drawdown = _max_drawdown(closes[idx - 126:idx + 1]) or 0.0
        label = 1 if ((future / p_now) - 1.0) > 0 else 0
        samples.append(([mom_1m, mom_3m, mom_6m, vol, drawdown], label))

    if len(samples) < 60:
        return 0.0, 0.0, {"samples": len(samples), "horizonDays": 63, "hitRate": None}

    features = [row[0] for row in samples]
    labels = [row[1] for row in samples]
    mins = [min(col) for col in zip(*features)]
    maxs = [max(col) for col in zip(*features)]

    def scale_row(row: list[float]) -> list[float]:
        scaled: list[float] = []
        for idx, value in enumerate(row):
            spread = maxs[idx] - mins[idx]
            if spread <= 1e-12:
                scaled.append(0.5)
            else:
                scaled.append((value - mins[idx]) / spread)
        return scaled

    x_rows = [scale_row(row) for row in features]
    weights = [0.0 for _ in range(len(x_rows[0]) + 1)]
    learning_rate = 0.15

    for _ in range(140):
        grad = [0.0 for _ in weights]
        for row, label in zip(x_rows, labels):
            z = weights[0] + sum(w * x for w, x in zip(weights[1:], row))
            pred = _sigmoid(z)
            err = pred - label
            grad[0] += err
            for idx, value in enumerate(row, start=1):
                grad[idx] += err * value
        inv_n = 1.0 / len(x_rows)
        for idx in range(len(weights)):
            weights[idx] -= learning_rate * grad[idx] * inv_n

    correct = 0
    for row, label in zip(x_rows, labels):
        z = weights[0] + sum(w * x for w, x in zip(weights[1:], row))
        pred = _sigmoid(z)
        if (pred >= 0.5 and label == 1) or (pred < 0.5 and label == 0):
            correct += 1
    accuracy = correct / len(labels)
    confidence = _clamp((abs(accuracy - 0.5) * 2.0) * min(1.0, len(labels) / 220.0), 0.0, 1.0)

    latest_idx = len(closes) - 1
    latest_row = [
        (closes[latest_idx] / closes[latest_idx - 21]) - 1.0,
        (closes[latest_idx] / closes[latest_idx - 63]) - 1.0,
        (closes[latest_idx] / closes[latest_idx - 126]) - 1.0,
        _std(_daily_returns(closes[-64:])) or 0.0,
        _max_drawdown(closes[-127:]) or 0.0,
    ]
    latest_scaled = scale_row(latest_row)
    z_latest = weights[0] + sum(w * x for w, x in zip(weights[1:], latest_scaled))
    p_up = _sigmoid(z_latest)

    fundamentals_bias = (financial_health_score - 0.5) * 0.08 + (valuation_score - 0.5) * 0.06
    raw_adjustment = ((p_up - 0.5) * 0.20) + fundamentals_bias
    details = {
        "samples": len(samples),
        "horizonDays": horizon,
        "hitRate": round(accuracy, 4),
        "upProbability": round(p_up, 4),
    }
    return _clamp(raw_adjustment, -0.08, 0.08), confidence, details


def compute_smart_score(
    metrics: dict[str, Any],
    technicals: dict[str, Any],
    financials: dict[str, Any] | None = None,
    price_history: list[dict[str, Any]] | None = None,
    returns_summary: list[dict[str, Any]] | None = None,
    news_items: list[dict[str, Any]] | None = None,
    corporate_actions: dict[str, Any] | None = None,
    shareholding: dict[str, Any] | None = None,
) -> dict[str, Any]:
    financials = financials or {}
    _ = returns_summary or []
    _ = news_items or []

    growth_features = _extract_growth_features(financials)
    price_features = _extract_price_features(price_history)

    roe = _num(metrics.get("roe"))
    roa = _num(metrics.get("roa"))
    roce = _num(metrics.get("roce"))
    profit_margin = _num(metrics.get("profitMargin"))
    pe_ratio = _num(metrics.get("peRatio"))
    pb_ratio = _num(metrics.get("pbRatio"))
    ev_to_sales = _num(metrics.get("evToSales"))
    peg_ratio = _num(metrics.get("pegRatio"))
    dividend_yield = _num(metrics.get("dividendYield"))
    debt_to_equity = _num(metrics.get("debtToEquity"))
    current_ratio = _num(metrics.get("currentRatio"))
    rsi14 = _num(technicals.get("rsi14"))
    macd = _num(technicals.get("macd"))
    ema20 = _num(technicals.get("ema20"))
    ema50 = _num(technicals.get("ema50"))
    trend = str(technicals.get("trend") or "Neutral").lower()

    altman_z = _compute_altman_z(metrics, financials)
    interest_coverage = _num(metrics.get("interestCoverage"))
    if interest_coverage is None:
        income_rows = _latest_nonempty_rows(financials.get("incomeStatement"))
        if income_rows:
            ebit = _statement_value(income_rows[0], ["ebit", "operatingIncome"])
            interest = _statement_value(income_rows[0], ["interestExpense", "interestCost"])
            if ebit is not None and interest is not None and abs(interest) > 1e-9:
                interest_coverage = ebit / abs(interest)

    profitability = _avg(
        [
            _normalize(roe, 5.0, 25.0),
            _normalize(roa, 1.0, 10.0),
            _normalize(roce, 8.0, 30.0),
            _normalize(profit_margin, 5.0, 25.0),
        ],
        fallback=0.5,
    )

    growth = _avg(
        [
            _normalize(growth_features.get("revenueGrowth"), 0.0, 25.0),
            _normalize(growth_features.get("profitGrowth"), 0.0, 25.0),
            _normalize(growth_features.get("epsGrowth"), 0.0, 20.0),
            _normalize(growth_features.get("freeCashFlowGrowth"), 0.0, 20.0),
        ],
        fallback=0.5,
    )

    valuation = _avg(
        [
            _inverse_normalize(pe_ratio, 8.0, 45.0),
            _inverse_normalize(pb_ratio, 1.0, 8.0),
            _inverse_normalize(peg_ratio, 0.5, 3.0),
            _inverse_normalize(ev_to_sales, 1.0, 12.0),
            _normalize(dividend_yield, 0.0, 4.0),
        ],
        fallback=0.5,
    )

    rsi_score = None
    if rsi14 is not None:
        rsi_score = _clamp(1.0 - abs(rsi14 - 55.0) / 45.0, 0.0, 1.0)
    macd_score = None
    if macd is not None:
        macd_score = _sigmoid(macd / 2.5)
    trend_score = 0.7 if trend == "bullish" else 0.35 if trend == "bearish" else 0.5
    ema_score = None
    if ema20 is not None and ema50 is not None:
        ema_score = 1.0 if ema20 >= ema50 else 0.25

    momentum = _avg(
        [
            rsi_score,
            macd_score,
            ema_score,
            trend_score,
            _normalize(price_features.get("return3M"), -15.0, 35.0),
            _normalize(price_features.get("return6M"), -20.0, 50.0),
        ],
        fallback=0.5,
    )

    financial_health = _avg(
        [
            _inverse_normalize(debt_to_equity, 0.0, 2.5),
            _normalize(current_ratio, 1.0, 3.0),
            _normalize(interest_coverage, 1.5, 8.0),
            _normalize(altman_z, 1.8, 4.0),
            _insider_signal(corporate_actions),
            _institutional_signal(shareholding),
        ],
        fallback=0.5,
    )

    base_score_01 = (
        0.25 * profitability
        + 0.20 * growth
        + 0.20 * valuation
        + 0.20 * momentum
        + 0.15 * financial_health
    )

    ml_adjustment, ml_confidence, validation = _walk_forward_ml_adjustment(price_history, financial_health, valuation)
    final_score_01 = _clamp(base_score_01 + (ml_adjustment * ml_confidence), 0.0, 1.0)
    score_5 = round(final_score_01 * 5.0, 2)

    dimensions = {
        "profitability": round(profitability * 5.0, 2),
        "growth": round(growth * 5.0, 2),
        "valuation": round(valuation * 5.0, 2),
        "momentum": round(momentum * 5.0, 2),
        "financialHealth": round(financial_health * 5.0, 2),
    }
    return {
        "score": score_5,
        "maxScore": 5,
        "dimensions": dimensions,
        "label": "Strong" if score_5 >= 4 else "Moderate" if score_5 >= 2.5 else "Weak",
        "explanation": (
            "Factor score uses normalized profitability, growth, valuation, momentum, and balance-sheet health. "
            "A bounded walk-forward ML signal validates trend persistence before applying a small score adjustment."
        ),
        "score10": round(final_score_01 * 10.0, 2),
        "mlAdjustment": round(ml_adjustment * ml_confidence * 5.0, 2),
        "mlConfidence": round(ml_confidence, 2),
        "validation": validation,
        "modelVersion": "factor-v2",
    }


def compute_risk_score(
    news_items: list[dict[str, Any]],
    metrics: dict[str, Any],
    technicals: dict[str, Any],
    price_history: list[dict[str, Any]] | None = None,
    financials: dict[str, Any] | None = None,
    brokerage_research: dict[str, Any] | None = None,
) -> dict[str, Any]:
    financials = financials or {}
    sentiments: list[float] = []
    narrative_risk_scores: list[float] = []

    high_risk_keywords = [
        "fraud",
        "default",
        "lawsuit",
        "forensic",
        "bankruptcy",
        "insolvency",
        "probe",
        "raid",
        "downgrade",
        "restatement",
    ]
    medium_risk_keywords = [
        "decline",
        "fall",
        "debt",
        "pledge",
        "regulatory",
        "penalty",
        "miss",
        "volatility",
        "outflow",
        "delay",
    ]

    for article in news_items:
        sentiment = _num(article.get("sentimentScore"), 0.5)
        sentiments.append(_clamp(sentiment if sentiment is not None else 0.5, 0.0, 1.0))
        text = (str(article.get("title", "")) + " " + str(article.get("summary", ""))).lower()
        if any(key in text for key in high_risk_keywords):
            narrative_risk_scores.append(0.85)
        elif any(key in text for key in medium_risk_keywords):
            narrative_risk_scores.append(0.65)
        else:
            narrative_risk_scores.append(0.35)

    if isinstance(brokerage_research, dict):
        summary = brokerage_research.get("summary") or {}
        total = _num(summary.get("total"))
        buys = _num(summary.get("buy"))
        sells = _num(summary.get("sell"))
        holds = _num(summary.get("hold"))
        if total not in {None, 0} and buys is not None and sells is not None:
            structured_sentiment = _clamp(0.5 + (((buys - sells) / total) * 0.35), 0.0, 1.0)
            sentiments.append(structured_sentiment)
            if holds is not None and holds / total > 0.55:
                narrative_risk_scores.append(0.5)

    sentiment_risk = _clamp(1.0 - (_avg(sentiments, 0.5)), 0.0, 1.0)
    narrative_risk = _clamp(_avg(narrative_risk_scores, 0.45), 0.0, 1.0)

    debt_to_equity = _num(metrics.get("debtToEquity"))
    current_ratio = _num(metrics.get("currentRatio"))
    roa = _num(metrics.get("roa"))
    altman_z = _compute_altman_z(metrics, financials)
    interest_coverage = _num(metrics.get("interestCoverage"))

    financial_risk = _avg(
        [
            _normalize(debt_to_equity, 0.4, 2.5),
            1.0 - (_normalize(current_ratio, 1.0, 3.0) or 0.5),
            1.0 - (_normalize(roa, 1.0, 10.0) or 0.5),
            1.0 - (_normalize(interest_coverage, 1.5, 8.0) or 0.5),
            1.0 - (_normalize(altman_z, 1.8, 4.0) or 0.5),
        ],
        fallback=0.5,
    )

    price_features = _extract_price_features(price_history)
    rsi14 = _num(technicals.get("rsi14"))
    macd = _num(technicals.get("macd"))
    trend = str(technicals.get("trend") or "Neutral").lower()
    technical_risk = _avg(
        [
            _normalize(abs((rsi14 or 50.0) - 50.0), 0.0, 35.0),
            _normalize(price_features.get("volatility3M"), 0.15, 0.55),
            _normalize(price_features.get("drawdown1Y"), 0.08, 0.45),
            0.35 if trend == "bullish" else 0.7 if trend == "bearish" else 0.5,
            0.35 if macd is not None and macd > 0 else 0.65 if macd is not None and macd < 0 else 0.5,
        ],
        fallback=0.5,
    )

    weighted_risk = (
        0.25 * sentiment_risk
        + 0.25 * financial_risk
        + 0.30 * narrative_risk
        + 0.20 * technical_risk
    )
    risk_score = round(_clamp(weighted_risk, 0.0, 1.0) * 5.0, 2)
    return {
        "score": risk_score,
        "maxScore": 5,
        "components": {
            "sentiment": round(sentiment_risk * 5.0, 2),
            "financialRisk": round(financial_risk * 5.0, 2),
            "narrativeRisk": round(narrative_risk * 5.0, 2),
            "technicalRisk": round(technical_risk * 5.0, 2),
        },
        "label": "Low" if risk_score < 2 else "Medium" if risk_score < 3.5 else "High",
        "explanation": (
            "Risk score blends sentiment risk, financial stress, narrative red flags, and technical instability "
            "using weighted normalized factors."
        ),
        "modelVersion": "risk-v2",
    }
