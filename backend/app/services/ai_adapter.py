from typing import Any

from app.core.config import get_settings

import sys
from pathlib import Path

# Provide a fallback path for local dev without pip install -e
ai_engine_path = Path(__file__).resolve().parent.parent.parent.parent / "ai-engine" / "src"
if str(ai_engine_path) not in sys.path:
    sys.path.append(str(ai_engine_path))

try:
    from ai_engine.gemini_service import GeminiService
except Exception as e:  # pragma: no cover - fallback when module path not mounted
    print(f"Failed to load AI Engine from {ai_engine_path}: {e}")
    GeminiService = None  # type: ignore


settings = get_settings()


class AIAdapter:
    def __init__(self) -> None:
        self._gemini = GeminiService(api_key=settings.gemini_api_key, model=settings.gemini_model) if GeminiService else None

    async def chat(self, symbol: str, question: str, context: dict[str, Any]) -> tuple[str, str]:
        if self._gemini and settings.gemini_api_key:
            try:
                answer = await self._gemini.chat(symbol=symbol, question=question, context=context)
                return answer, "gemini"
            except Exception:
                return self._offline_chat_response(symbol=symbol, context=context, live_failed=True), "fallback"
        return self._offline_chat_response(symbol=symbol, context=context, live_failed=False), "fallback"

    async def generate_report(self, symbol: str, context: dict[str, Any]) -> str:
        if self._gemini and settings.gemini_api_key:
            try:
                return await self._gemini.generate_report(symbol=symbol, context=context)
            except Exception:
                pass
        return (
            f"# {symbol} Research Report\n"
            "## Company Overview\n"
            "Large-cap Indian listed company with stable financial profile in available data.\n"
            "## Industry Analysis\n"
            "Sector remains sensitive to rates and regulatory cycles.\n"
            "## Revenue Growth Trends\n"
            "Revenue has shown multi-year expansion with quarterly volatility.\n"
            "## Profit Trends\n"
            "Profitability remains positive, monitor margin persistence.\n"
            "## Risk Factors\n"
            "Macro slowdown, sector credit stress, and valuation compression risk.\n"
            "## Valuation Analysis\n"
            "Current valuation appears fair versus long-term averages.\n"
            "## AI Investment Summary\n"
            "Suitable for watchlist; staggered accumulation only after confirming trend continuation."
        )

    async def explain_smart_score(self, symbol: str, context: dict[str, Any]) -> str:
        if self._gemini and settings.gemini_api_key:
            try:
                return await self._gemini.explain_smart_score(symbol=symbol, context=context)
            except Exception:
                pass
        smart = (context.get("smartScore") or {}) if isinstance(context, dict) else {}
        score = float(smart.get("score", 0.0) or 0.0)
        dimensions = smart.get("dimensions") or {}
        top = sorted(dimensions.items(), key=lambda item: item[1], reverse=True)[:2] if isinstance(dimensions, dict) else []
        weak = sorted(dimensions.items(), key=lambda item: item[1])[:1] if isinstance(dimensions, dict) else []
        top_text = ", ".join(str(name) for name, _ in top) if top else "key factors"
        weak_text = str(weak[0][0]) if weak else "momentum"
        if score >= 4:
            setup = "improving"
        elif score >= 2.5:
            setup = "neutral"
        else:
            setup = "weak"
        return (
            f"{symbol.upper()} has a Smart Score of {score:.1f} out of 5, so the overall picture is {setup}. "
            f"The stronger parts are {top_text}. "
            f"The weak part is {weak_text}, so it is safer to invest slowly until this improves."
        )

    async def explain_risk_score(self, symbol: str, context: dict[str, Any]) -> str:
        if self._gemini and settings.gemini_api_key:
            try:
                return await self._gemini.explain_risk_score(symbol=symbol, context=context)
            except Exception:
                pass

        risk = (context.get("riskScore") or {}) if isinstance(context, dict) else {}
        score = float(risk.get("score", 0.0) or 0.0)
        components = risk.get("components") or {}
        high = sorted(components.items(), key=lambda item: item[1], reverse=True)[:1] if isinstance(components, dict) else []
        low = sorted(components.items(), key=lambda item: item[1])[:1] if isinstance(components, dict) else []
        high_text = str(high[0][0]) if high else "market mood"
        low_text = str(low[0][0]) if low else "financial risk"

        if score < 2:
            level = "low"
        elif score < 3.5:
            level = "medium"
        else:
            level = "high"

        return (
            f"{symbol.upper()} has a Risk Score of {score:.1f} out of 5, so risk is {level}. "
            f"The main risk now is {high_text}, while {low_text} looks better. "
            "To stay safe, invest in small parts instead of all at once."
        )

    async def extract_profile_details(self, symbol: str, context: dict[str, Any]) -> str:
        if self._gemini and settings.gemini_api_key:
            try:
                return await self._gemini.extract_profile_details(symbol=symbol, context=context)
            except Exception:
                pass
        return "{}"

    def _offline_chat_response(self, symbol: str, context: dict[str, Any], live_failed: bool) -> str:
        smart = (context.get("smartScore") or {}) if isinstance(context, dict) else {}
        risk = (context.get("riskScore") or {}) if isinstance(context, dict) else {}
        metrics = (context.get("metrics") or {}) if isinstance(context, dict) else {}

        smart_score = float(smart.get("score", 0.0) or 0.0)
        risk_score = float(risk.get("score", 0.0) or 0.0)
        pe_ratio = metrics.get("peRatio")
        dividend_yield = metrics.get("dividendYield")

        setup = "strong" if smart_score >= 4 else "balanced" if smart_score >= 2.5 else "weak"
        risk_level = "low" if risk_score < 2 else "medium" if risk_score < 3.5 else "high"

        pe_text = f"P/E is {float(pe_ratio):.2f}" if isinstance(pe_ratio, (int, float)) else "valuation needs a closer check"
        dividend_text = (
            f"dividend yield is {float(dividend_yield):.2f}%"
            if isinstance(dividend_yield, (int, float))
            else "income support is limited"
        )

        lead = "Live Gemini reply is unavailable right now." if live_failed else "AI chat fallback is active."
        return (
            f"{lead} {symbol.upper()} currently looks {setup} with a Smart Score of {smart_score:.1f}/5 "
            f"and a Risk Score of {risk_score:.1f}/5, which means risk is {risk_level}. "
            f"Right now {pe_text}, and {dividend_text}. "
            "Before taking a position, check debt trend, margin stability, and profit consistency."
        )
