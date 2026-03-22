from typing import Any
import json

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

    async def analyze_news(self, symbol: str, article: dict[str, Any], context: dict[str, Any]) -> tuple[dict[str, str], str]:
        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.analyze_news(symbol=symbol, article=article, context=context)
                parsed = self._parse_news_analysis(raw)
                if parsed:
                    return parsed, "gemini"
            except Exception:
                pass
        return self._offline_news_analysis(symbol=symbol, article=article), "fallback"

    async def generate_swot(self, symbol: str, context: dict[str, Any]) -> dict[str, Any]:
        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.generate_swot(symbol=symbol, context=context)
                parsed = self._parse_swot_json(raw)
                if parsed:
                    return parsed
            except Exception:
                pass
        return self._fallback_swot(symbol=symbol, context=context)

    def _parse_swot_json(self, raw: str) -> dict[str, Any] | None:
        import re as _re
        text = str(raw or "").strip()
        if not text:
            return None
        match = _re.search(r"\{.*\}", text, flags=_re.DOTALL)
        candidate = match.group(0) if match else text
        try:
            parsed = json.loads(candidate)
        except Exception:
            return None
        if not isinstance(parsed, dict):
            return None
        strengths = parsed.get("strengths")
        weaknesses = parsed.get("weaknesses")
        opportunities = parsed.get("opportunities")
        threats = parsed.get("threats")
        bull_case = parsed.get("bullCase", "")
        bear_case = parsed.get("bearCase", "")
        if not (isinstance(strengths, list) and isinstance(weaknesses, list)
                and isinstance(opportunities, list) and isinstance(threats, list)):
            return None
        return {
            "strengths": [str(s) for s in strengths],
            "weaknesses": [str(w) for w in weaknesses],
            "opportunities": [str(o) for o in opportunities],
            "threats": [str(t) for t in threats],
            "bullCase": str(bull_case),
            "bearCase": str(bear_case),
        }

    def _fallback_swot(self, symbol: str, context: dict[str, Any]) -> dict[str, Any]:
        smart = (context.get("smartScore") or {}) if isinstance(context, dict) else {}
        risk = (context.get("riskScore") or {}) if isinstance(context, dict) else {}
        metrics = (context.get("metrics") or {}) if isinstance(context, dict) else {}
        profile = (context.get("profile") or {}) if isinstance(context, dict) else {}

        sector = str(profile.get("sector") or "its sector").strip()
        pe = metrics.get("peRatio")
        smart_score = float(smart.get("score", 0.0) or 0.0)
        risk_score = float(risk.get("score", 0.0) or 0.0)

        strengths = [
            f"Established player in {sector} with consistent market presence.",
            "Listed on Indian exchanges with adequate trading liquidity.",
        ]
        if smart_score >= 3.5:
            strengths.append(f"Strong Smart Score of {smart_score:.1f}/5 indicates solid fundamentals.")

        weaknesses = [
            "Detailed competitive positioning data is limited without AI analysis.",
        ]
        if isinstance(pe, (int, float)) and pe > 30:
            weaknesses.append(f"Valuation appears stretched with P/E of {pe:.1f}.")
        elif isinstance(pe, (int, float)) and pe > 0:
            weaknesses.append(f"Current P/E of {pe:.1f} needs monitoring relative to sector peers.")

        opportunities = [
            "India's growing economy provides a positive macro backdrop.",
            "Potential for margin expansion with operational efficiency gains.",
        ]

        threats = [
            "Macro slowdown or interest rate changes could impact performance.",
            "Sector-specific regulatory changes may affect operations.",
        ]
        if risk_score >= 3.5:
            threats.append(f"Elevated risk score of {risk_score:.1f}/5 suggests near-term caution.")

        tone = "positive" if smart_score >= 3.5 else "neutral" if smart_score >= 2.5 else "cautious"
        bull_case = (
            f"{symbol.upper()} benefits from a {tone} fundamental picture. "
            f"If the company sustains earnings growth and the sector cycle turns favorable, "
            f"the stock could re-rate meaningfully from current levels."
        )
        bear_case = (
            f"If macro headwinds intensify or earnings disappoint, "
            f"{symbol.upper()} could see valuation compression. "
            f"Monitor quarterly results and management commentary closely."
        )
        return {
            "strengths": strengths,
            "weaknesses": weaknesses,
            "opportunities": opportunities,
            "threats": threats,
            "bullCase": bull_case,
            "bearCase": bear_case,
        }

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

    def _parse_news_analysis(self, raw: str) -> dict[str, str]:
        text = str(raw or "").strip()
        if not text:
            return {}
        match = None
        try:
            import re

            match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        except Exception:
            match = None
        candidate = match.group(0) if match else text
        try:
            parsed = json.loads(candidate)
        except Exception:
            return {}
        if not isinstance(parsed, dict):
            return {}
        overview = " ".join(str(parsed.get("overview") or "").split())
        market_impact = " ".join(str(parsed.get("marketImpact") or parsed.get("market_impact") or "").split())
        watchpoint = " ".join(str(parsed.get("watchpoint") or "").split())
        if not (overview and market_impact and watchpoint):
            return {}
        return {
            "overview": overview,
            "market_impact": market_impact,
            "watchpoint": watchpoint,
        }

    def _offline_news_analysis(self, symbol: str, article: dict[str, Any]) -> dict[str, str]:
        title = " ".join(str(article.get("title") or "").split())
        summary = " ".join(str(article.get("summary") or "").split())
        source = str(article.get("source") or "the article").strip()
        sentiment_value = float(article.get("sentimentScore", 0.5) or 0.5)

        if sentiment_value >= 0.6:
            tone = "The tone looks broadly positive for the stock, but it still needs confirmation in future updates."
        elif sentiment_value <= 0.45:
            tone = "The tone looks cautious, so the market may focus on risks until management or results add clarity."
        else:
            tone = "The tone looks mixed, so this news alone is not enough to change the full stock view."

        if summary:
            overview = summary if len(summary) <= 180 else f"{summary[:177].rstrip()}..."
        elif title:
            overview = f"{source} reports: {title}."
        else:
            overview = f"This update on {symbol.upper()} is available, but the article details are limited."

        watchpoint = (
            "Watch the next company filing, management comment, or quarterly result to see whether this headline changes earnings or risk."
        )

        return {
            "overview": overview,
            "market_impact": tone,
            "watchpoint": watchpoint,
        }
