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

    async def parse_screener_query(self, query: str) -> dict[str, Any]:
        """Use Gemini to convert natural language into screener filter params."""
        prompt = (
            "You are a stock screener assistant for Indian markets (NSE/BSE). "
            "Convert the user's natural language query into a JSON object with ONLY these optional keys:\n"
            "  exchange (str, default 'NSE'), sector (str), market_cap_min (float, in USD), "
            "market_cap_max (float, in USD), pe_min (float), pe_max (float), "
            "price_min (float), price_max (float), dividend_min (float, percent), "
            "volume_min (float), limit (int, default 50).\n"
            "Rules: Market cap 500 Cr ≈ 60000000 USD. Only include keys the user mentions. "
            "Sector must be one of: Technology, Finance, Healthcare, Consumer, Energy, "
            "Industrials, Materials, Utilities, Real Estate, Telecom, Auto.\n"
            "Respond with ONLY raw JSON, no markdown, no explanation.\n"
            f"Query: \"{query}\""
        )
        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.chat(symbol="SCREENER", question=prompt, context={})
                import re as _re
                match = _re.search(r"\{[^{}]*\}", str(raw), flags=_re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, dict):
                        return parsed
            except Exception:
                pass
        # Rule-based fallback
        return self._rule_based_screener_parse(query)

    def _rule_based_screener_parse(self, query: str) -> dict[str, Any]:
        q = query.lower()
        params: dict[str, Any] = {}
        sector_map = {
            "it": "Technology", "tech": "Technology", "software": "Technology",
            "bank": "Finance", "banking": "Finance", "finance": "Finance", "nbfc": "Finance",
            "pharma": "Healthcare", "health": "Healthcare", "hospital": "Healthcare",
            "fmcg": "Consumer", "consumer": "Consumer",
            "energy": "Energy", "power": "Energy", "oil": "Energy",
            "auto": "Auto", "automobile": "Auto",
            "real estate": "Real Estate", "realty": "Real Estate",
            "telecom": "Telecom",
        }
        for kw, sector in sector_map.items():
            if kw in q:
                params["sector"] = sector
                break
        import re as _re
        pe_match = _re.search(r"pe\s*(under|below|less\s*than|<)\s*(\d+)", q)
        if pe_match:
            params["pe_max"] = float(pe_match.group(2))
        div_match = _re.search(r"dividend\s*(above|over|>|greater\s*than)\s*(\d+(?:\.\d+)?)\s*%?", q)
        if div_match:
            params["dividend_min"] = float(div_match.group(2))
        if "large cap" in q or "largecap" in q:
            params["market_cap_min"] = 2_400_000_000
        elif "mid cap" in q or "midcap" in q:
            params["market_cap_min"] = 600_000_000
            params["market_cap_max"] = 2_400_000_000
        elif "small cap" in q or "smallcap" in q:
            params["market_cap_min"] = 60_000_000
            params["market_cap_max"] = 600_000_000
        return params

    async def analyze_portfolio_risk(
        self, holdings: list[dict[str, Any]], stock_summaries: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """AI-powered portfolio risk and correlation analysis."""
        if not holdings:
            return {"error": "No holdings provided"}

        total_value = sum(h.get("currentValue") or h.get("investedValue", 0) for h in holdings)
        holdings_text = "\n".join(
            f"- {h['symbol']}: ₹{h.get('currentValue') or h.get('investedValue', 0):,.0f} "
            f"({h.get('weight', 0):.1f}%), sector={h.get('sector', 'Unknown')}, "
            f"beta={h.get('beta', 'N/A')}"
            for h in holdings
        )

        prompt = (
            "You are a portfolio risk analyst for Indian equity markets. "
            "Analyze this portfolio and respond with a JSON object with these keys:\n"
            "  overallRisk (str: Low/Medium/High), riskScore (float 0-10), "
            "diversificationScore (float 0-10), "
            "sectorConcentration (str: brief description), "
            "topRisks (list of 3 str), "
            "recommendations (list of 3 str), "
            "summary (str: 2-3 sentences).\n"
            f"Portfolio (total ₹{total_value:,.0f}):\n{holdings_text}\n"
            "Respond with ONLY raw JSON, no markdown."
        )

        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.chat(symbol="PORTFOLIO", question=prompt, context={})
                import re as _re
                match = _re.search(r"\{.*\}", str(raw), flags=_re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, dict) and parsed.get("summary"):
                        return parsed
            except Exception:
                pass

        return self._fallback_portfolio_risk(holdings)

    def _fallback_portfolio_risk(self, holdings: list[dict[str, Any]]) -> dict[str, Any]:
        sectors = [h.get("sector", "Unknown") for h in holdings]
        unique_sectors = len(set(sectors))
        n = len(holdings)
        largest_weight = max((h.get("weight", 0) for h in holdings), default=0)
        concentration = "concentrated" if largest_weight > 40 else "moderate" if largest_weight > 25 else "diversified"

        div_score = min(10, unique_sectors * 1.5 + (n * 0.5))
        risk_score = 10 - div_score if largest_weight > 40 else 5.0

        top_sector = max(set(sectors), key=sectors.count) if sectors else "Unknown"

        return {
            "overallRisk": "High" if risk_score > 7 else "Medium" if risk_score > 4 else "Low",
            "riskScore": round(risk_score, 1),
            "diversificationScore": round(div_score, 1),
            "sectorConcentration": f"Heavy in {top_sector}" if sectors.count(top_sector) > n // 2 else f"{unique_sectors} sectors",
            "topRisks": [
                f"Portfolio is {concentration} — top holding is {largest_weight:.0f}% of total",
                "Sector correlation may amplify drawdowns in a market downturn",
                "Monitor quarterly earnings for all holdings regularly",
            ],
            "recommendations": [
                f"Consider diversifying across {max(0, 5 - unique_sectors)} more sectors",
                "Add defensive sectors (FMCG/Pharma) if not already present",
                "Review any holding above 30% weight for trimming opportunity",
            ],
            "summary": (
                f"Your portfolio of {n} stocks spans {unique_sectors} sector(s) with a "
                f"{concentration} allocation profile. The largest holding is {largest_weight:.0f}% of the total. "
                "Consider rebalancing to reduce concentration risk and improve long-term resilience."
            ),
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

    async def generate_competitor_verdict(
        self, symbol: str, stock_metrics: dict[str, Any], peers: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """AI verdict on which stock wins among peers — the 'One-Click Competitor Matrix'."""
        def fmt_peer(p: dict) -> str:
            return (
                f"{p.get('name', p.get('symbol', '?'))}: "
                f"PE={p.get('pe', 'N/A')}, PB={p.get('pb', 'N/A')}, "
                f"ROE={p.get('roe', 'N/A')}%, MCap={p.get('marketCap', 'N/A')}"
            )

        peers_text = "\n".join(f"- {fmt_peer(p)}" for p in peers[:6]) if peers else "No peer data"
        own_pe = stock_metrics.get("pe") or stock_metrics.get("peRatio")
        own_roe = stock_metrics.get("roe") or stock_metrics.get("returnOnEquity")
        own_pb = stock_metrics.get("pb") or stock_metrics.get("priceToBook")

        prompt = (
            f"You are an expert Indian equity analyst. Compare {symbol.upper()} against its peers.\n"
            f"{symbol.upper()}: PE={own_pe}, PB={own_pb}, ROE={own_roe}%\n"
            f"Peers:\n{peers_text}\n\n"
            "Respond with ONLY a JSON object with keys:\n"
            "  winner (str: company name that looks best value right now),\n"
            "  winnerReason (str: 1-2 sentences why),\n"
            "  verdict (str: 2-3 sentence AI summary of the competitive landscape),\n"
            "  subjectRating (str: 'Overvalued'|'Fairly Valued'|'Undervalued'),\n"
            "  watchOut (str: 1 key risk for the subject stock vs peers).\n"
            "Be direct and opinionated. No markdown."
        )

        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.chat(symbol=symbol, question=prompt, context={})
                import re as _re
                match = _re.search(r"\{.*\}", str(raw), flags=_re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, dict) and parsed.get("verdict"):
                        return parsed
            except Exception:
                pass

        # Fallback
        best_pe_peer = min(peers, key=lambda p: float(p.get("pe") or 9999)) if peers else None
        winner = best_pe_peer.get("name", symbol) if best_pe_peer else symbol
        return {
            "winner": winner,
            "winnerReason": f"{winner} shows the most attractive valuation metrics among peers.",
            "verdict": (
                f"{symbol.upper()} competes in a sector with {len(peers)} peers. "
                "AI analysis is offline — compare PE, ROE, and PB ratios manually to identify the best value."
            ),
            "subjectRating": "Fairly Valued",
            "watchOut": "Monitor quarterly earnings and margin trends relative to peers.",
        }

    async def generate_earnings_tldr(
        self, symbol: str, quarterly_data: list[dict[str, Any]], company_name: str = ""
    ) -> dict[str, Any]:
        """TL;DR summary of recent earnings — what the CEO is really saying."""
        if not quarterly_data:
            return {"error": "No quarterly data available"}

        recent = quarterly_data[:4]  # last 4 quarters

        def fmt_q(q: dict) -> str:
            rev = q.get("revenue") or q.get("totalRevenue") or 0
            profit = q.get("profit") or q.get("netIncome") or q.get("netProfit") or 0
            period = q.get("period") or q.get("date") or "?"
            rev_g = q.get("totalRevenueGrowthPct") or q.get("revenueGrowth")
            ni_g = q.get("niGrowthPct") or q.get("netIncomeGrowth")
            g_text = ""
            if rev_g is not None:
                g_text += f" RevGrowth={round(float(rev_g)*100 if abs(float(rev_g)) < 5 else float(rev_g), 1)}%"
            if ni_g is not None:
                g_text += f" ProfitGrowth={round(float(ni_g)*100 if abs(float(ni_g)) < 5 else float(ni_g), 1)}%"
            return f"{period}: Revenue={rev:,.0f}, NetProfit={profit:,.0f}{g_text}"

        quarters_text = "\n".join(f"- {fmt_q(q)}" for q in recent)
        name = company_name or symbol

        prompt = (
            f"You are a senior equity research analyst. Summarize {name}'s recent earnings for a retail investor.\n"
            f"Last 4 quarters:\n{quarters_text}\n\n"
            "Respond with ONLY a JSON object with keys:\n"
            "  headline (str: punchy 10-word verdict on earnings quality),\n"
            "  trend (str: 'Accelerating'|'Stable'|'Decelerating'|'Recovering'|'Declining'),\n"
            "  toneColor (str: 'green'|'amber'|'red'),\n"
            "  bullets (list of exactly 4 strings: key takeaways a retail investor needs to know),\n"
            "  ceoSignal (str: what management's numbers are signalling — optimistic, cautious, or mixed),\n"
            "  watchNext (str: the ONE thing to watch in the next quarterly result).\n"
            "Be direct. No markdown. Numbers in Indian format (Cr, L)."
        )

        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.chat(symbol=symbol, question=prompt, context={})
                import re as _re
                match = _re.search(r"\{.*\}", str(raw), flags=_re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, dict) and parsed.get("bullets"):
                        return parsed
            except Exception:
                pass

        # Rule-based fallback
        revenues = [float(q.get("revenue") or q.get("totalRevenue") or 0) for q in recent]
        profits = [float(q.get("profit") or q.get("netIncome") or 0) for q in recent]
        rev_trend = "growing" if len(revenues) >= 2 and revenues[0] > revenues[-1] else "declining"
        profit_trend = "improving" if len(profits) >= 2 and profits[0] > profits[-1] else "under pressure"
        tone_color = "green" if rev_trend == "growing" and profit_trend == "improving" else "amber" if rev_trend == "growing" else "red"
        trend_label = "Accelerating" if rev_trend == "growing" and profit_trend == "improving" else "Stable" if rev_trend == "growing" else "Declining"

        return {
            "headline": f"{name} revenue {rev_trend}, profits {profit_trend}",
            "trend": trend_label,
            "toneColor": tone_color,
            "bullets": [
                f"Revenue trend is {rev_trend} over the last 4 reported quarters.",
                f"Net profit is {profit_trend} over the same period.",
                "Check operating margins for business quality signals.",
                "Compare with sector peers before drawing conclusions.",
            ],
            "ceoSignal": "Management data suggests a mixed picture — verify with the actual earnings call transcript.",
            "watchNext": "Revenue growth consistency and operating margin expansion in the next quarter.",
        }

    async def roast_portfolio(
        self, holdings: list[dict[str, Any]], total_value: float
    ) -> dict[str, Any]:
        """The 'Portfolio Doctor' — AI roast + actionable advice for uploaded holdings."""
        if not holdings:
            return {"error": "No holdings to analyse"}

        n = len(holdings)
        holdings_text = "\n".join(
            f"- {h['symbol']}: {h.get('quantity', '?')} shares @ avg ₹{h.get('avgPrice', '?')}, "
            f"current value ₹{h.get('currentValue', '?'):,.0f}, "
            f"P&L: {'+' if float(h.get('pnl', 0) or 0) >= 0 else ''}{h.get('pnl', '?')}"
            for h in holdings[:20]
        )

        prompt = (
            f"You are a witty but expert Indian stock market analyst. "
            f"The user has {n} stocks worth ₹{total_value:,.0f} total. "
            "Analyse their portfolio and give honest, slightly roast-y but constructive feedback.\n"
            f"Holdings:\n{holdings_text}\n\n"
            "Respond with ONLY a JSON object with these keys:\n"
            "  grade (str: 'S'|'A'|'B'|'C'|'D'|'F'),\n"
            "  gradeBadge (str: e.g. 'Balanced Beginner' or 'Concentration King' or 'Value Hunter'),\n"
            "  roast (str: 1-2 funny but true sentences about what's wrong — be honest but not cruel),\n"
            "  praiseOne (str: 1 thing they did right),\n"
            "  topRed (str: the single most dangerous holding and why),\n"
            "  topGreen (str: the single best holding and why),\n"
            "  fixes (list of 3 str: specific actionable improvements),\n"
            "  verdict (str: 2-sentence overall portfolio health summary).\n"
            "Be opinionated, specific, and direct. No markdown."
        )

        if self._gemini and settings.gemini_api_key:
            try:
                raw = await self._gemini.chat(symbol="PORTFOLIO", question=prompt, context={})
                import re as _re
                match = _re.search(r"\{.*\}", str(raw), flags=_re.DOTALL)
                if match:
                    parsed = json.loads(match.group(0))
                    if isinstance(parsed, dict) and parsed.get("roast"):
                        return parsed
            except Exception:
                pass

        # Fallback
        losers = [h for h in holdings if float(h.get("pnl", 0) or 0) < 0]
        winners = [h for h in holdings if float(h.get("pnl", 0) or 0) > 0]
        grade = "A" if len(losers) < n * 0.2 else "B" if len(losers) < n * 0.4 else "C"
        return {
            "grade": grade,
            "gradeBadge": "Emerging Investor",
            "roast": f"You have {len(losers)} losers out of {n} stocks. Either the market hates you, or you have a gift for buying tops.",
            "praiseOne": f"You have {len(winners)} winning positions — not bad.",
            "topRed": next((h["symbol"] for h in sorted(holdings, key=lambda x: float(x.get("pnl", 0) or 0))[:1]), "N/A") + " — largest drag on portfolio.",
            "topGreen": next((h["symbol"] for h in sorted(holdings, key=lambda x: float(x.get("pnl", 0) or 0), reverse=True)[:1]), "N/A") + " — your top performer.",
            "fixes": [
                "Review your losing positions — cut or average down with conviction, not hope.",
                "Ensure no single stock exceeds 20% of portfolio value.",
                "Add 1-2 defensive plays (FMCG/Pharma) to reduce beta.",
            ],
            "verdict": f"Your portfolio of {n} stocks shows room for improvement. Focus on quality over quantity and review position sizing.",
        }
