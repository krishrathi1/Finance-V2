import json
from typing import Any

import httpx


class GeminiService:
    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        self.timeout = httpx.Timeout(25.0, connect=5.0)
        self.fallback_models = [
            model,
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro-latest",
        ]

    async def chat(self, symbol: str, question: str, context: dict[str, Any]) -> str:
        prompt = self._build_chat_prompt(symbol=symbol, question=question, context=context)
        return await self._generate(prompt)

    async def generate_report(self, symbol: str, context: dict[str, Any]) -> str:
        prompt = self._build_report_prompt(symbol=symbol, context=context)
        return await self._generate(prompt)

    async def explain_smart_score(self, symbol: str, context: dict[str, Any]) -> str:
        prompt = self._build_smart_score_prompt(symbol=symbol, context=context)
        return await self._generate(prompt)

    async def explain_risk_score(self, symbol: str, context: dict[str, Any]) -> str:
        prompt = self._build_risk_score_prompt(symbol=symbol, context=context)
        return await self._generate(prompt)

    async def extract_profile_details(self, symbol: str, context: dict[str, Any]) -> str:
        prompt = self._build_profile_prompt(symbol=symbol, context=context)
        return await self._generate(prompt)

    async def _generate(self, prompt: str) -> str:
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        params = {"key": self.api_key}
        errors: list[str] = []

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for model_name in list(dict.fromkeys(self.fallback_models)):
                url = f"{self.base_url}/{model_name}:generateContent"
                response = await client.post(url, params=params, json=payload)
                if response.status_code == 404:
                    errors.append(f"{model_name}:404")
                    continue
                response.raise_for_status()
                data = response.json()
                self.model = model_name
                break
            else:
                raise httpx.HTTPStatusError(
                    f"Gemini models not available: {', '.join(errors) or 'unknown error'}",
                    request=response.request,
                    response=response,
                )

        candidates = data.get("candidates", [])
        if not candidates:
            return "No response generated."
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts)
        return text.strip() or "No response generated."

    def _build_chat_prompt(self, symbol: str, question: str, context: dict[str, Any]) -> str:
        compact_context = json.dumps(
            {
                "companyName": context.get("companyName"),
                "symbol": context.get("symbol"),
                "sector": context.get("sector"),
                "metrics": context.get("metrics"),
                "smartScore": context.get("smartScore"),
                "riskScore": context.get("riskScore"),
                "technicals": context.get("technicals"),
                "recentNews": context.get("news", [])[:5],
                "financials": {
                    "quarterly": context.get("financials", {}).get("quarterly", [])[:6],
                    "yearly": context.get("financials", {}).get("yearly", [])[:5],
                },
            }
        )
        return (
            "You are Financial Forensics AI, a senior Indian stock market analyst.\n"
            "Use concise, factual language, avoid investment guarantees, and never invent missing facts.\n"
            f"Stock symbol: {symbol}\n"
            f"Question: {question}\n"
            f"Context JSON: {compact_context}\n\n"
            "Return:\n"
            "1) Direct answer\n"
            "2) Why (financial + technical + sentiment)\n"
            "3) Key risks\n"
            "4) Suggested next checks"
        )

    def _build_report_prompt(self, symbol: str, context: dict[str, Any]) -> str:
        compact_context = json.dumps(
            {
                "companyName": context.get("companyName"),
                "symbol": context.get("symbol"),
                "sector": context.get("sector"),
                "profile": context.get("profile"),
                "metrics": context.get("metrics"),
                "riskScore": context.get("riskScore"),
                "smartScore": context.get("smartScore"),
                "news": context.get("news", [])[:8],
                "financials": context.get("financials"),
                "shareholding": context.get("shareholding"),
            }
        )
        return (
            "Generate a professional Indian equity research note in markdown.\n"
            f"Symbol: {symbol}\n"
            f"Data: {compact_context}\n\n"
            "Use sections:\n"
            "1. Company overview\n"
            "2. Industry and positioning\n"
            "3. Revenue growth trends\n"
            "4. Profit trends\n"
            "5. Risk factors\n"
            "6. Valuation summary\n"
            "7. AI investment outlook\n"
            "Keep it neutral and analytical."
        )

    def _build_smart_score_prompt(self, symbol: str, context: dict[str, Any]) -> str:
        smart = context.get("smartScore", {}) or {}
        risk = context.get("riskScore", {}) or {}
        metrics = context.get("metrics", {}) or {}
        technicals = context.get("technicals", {}) or {}
        returns_summary = context.get("returnsSummary", []) or []
        news = context.get("news", []) or []
        compact_context = json.dumps(
            {
                "symbol": context.get("symbol", symbol),
                "companyName": context.get("companyName"),
                "sector": context.get("sector"),
                "smartScore": {
                    "score": smart.get("score"),
                    "score10": smart.get("score10"),
                    "dimensions": smart.get("dimensions"),
                },
                "riskScore": {
                    "score": risk.get("score"),
                    "components": risk.get("components"),
                    "label": risk.get("label"),
                },
                "brokerageSummary": ((context.get("brokerageResearch") or {}).get("summary") if isinstance(context.get("brokerageResearch"), dict) else {}),
                "metrics": {
                    "peRatio": metrics.get("peRatio"),
                    "pbRatio": metrics.get("pbRatio"),
                    "roe": metrics.get("roe"),
                    "debtToEquity": metrics.get("debtToEquity"),
                    "currentRatio": metrics.get("currentRatio"),
                },
                "technicals": {
                    "trend": technicals.get("trend"),
                    "rsi14": technicals.get("rsi14"),
                    "macd": technicals.get("macd"),
                },
                "returnsSummary": returns_summary[:4],
                "recentNews": news[:4],
            }
        )
        return (
            "You are a helpful stock explainer for beginners.\n"
            f"Stock symbol: {symbol}\n"
            f"Context JSON: {compact_context}\n\n"
            "Task: Explain what this Smart Score means in very simple language.\n"
            "Output rules:\n"
            "1) Use simple words that a 12-year-old can understand.\n"
            "2) 3 short sentences only.\n"
            "3) Mention 2 good points and 1 caution.\n"
            "3a) Use only the facts visible in the context JSON.\n"
            "4) Replace finance jargon with simple words.\n"
            "5) Do not use words like setup, allocation, position sizing, conviction, or drawdown.\n"
            "6) Do not use markdown, bullets, or investment guarantees.\n"
            "7) Keep under 70 words."
        )

    def _build_risk_score_prompt(self, symbol: str, context: dict[str, Any]) -> str:
        risk = context.get("riskScore", {}) or {}
        smart = context.get("smartScore", {}) or {}
        metrics = context.get("metrics", {}) or {}
        technicals = context.get("technicals", {}) or {}
        news = context.get("news", []) or []
        compact_context = json.dumps(
            {
                "symbol": context.get("symbol", symbol),
                "companyName": context.get("companyName"),
                "sector": context.get("sector"),
                "riskScore": {
                    "score": risk.get("score"),
                    "components": risk.get("components"),
                    "label": risk.get("label"),
                },
                "smartScore": {
                    "score": smart.get("score"),
                    "dimensions": smart.get("dimensions"),
                },
                "brokerageSummary": ((context.get("brokerageResearch") or {}).get("summary") if isinstance(context.get("brokerageResearch"), dict) else {}),
                "metrics": {
                    "debtToEquity": metrics.get("debtToEquity"),
                    "currentRatio": metrics.get("currentRatio"),
                    "roa": metrics.get("roa"),
                },
                "technicals": {
                    "trend": technicals.get("trend"),
                    "rsi14": technicals.get("rsi14"),
                    "macd": technicals.get("macd"),
                },
                "recentNews": news[:4],
            }
        )
        return (
            "You are a helpful stock explainer for beginners.\n"
            f"Stock symbol: {symbol}\n"
            f"Context JSON: {compact_context}\n\n"
            "Task: Explain what this Risk Score means in very simple language.\n"
            "Output rules:\n"
            "1) Use simple words that a 12-year-old can understand.\n"
            "2) 3 short sentences only.\n"
            "3) Say if risk is low, medium, or high in plain words.\n"
            "3a) Use only the facts visible in the context JSON.\n"
            "4) Mention one main risk and one positive point.\n"
            "5) Give one simple safety tip (for example: invest slowly).\n"
            "6) Do not use markdown, bullets, or investment guarantees.\n"
            "7) Keep under 70 words."
        )

    def _build_profile_prompt(self, symbol: str, context: dict[str, Any]) -> str:
        compact_context = json.dumps(
            {
                "symbol": context.get("symbol", symbol),
                "companyName": context.get("companyName"),
                "sector": context.get("sector"),
                "profile": context.get("profile"),
                "description": (context.get("profile") or {}).get("description") if isinstance(context.get("profile"), dict) else "",
            }
        )
        return (
            "You are extracting company profile facts for an Indian listed stock.\n"
            f"Stock symbol: {symbol}\n"
            f"Context JSON: {compact_context}\n\n"
            "Task: Return only strict JSON with these keys:\n"
            '{"incorporationYear": number|null, "headquarters": string|null, "chairman": string|null, "previousName": string|null}\n'
            "Rules:\n"
            "1) Use the existing context first.\n"
            "2) If a field is uncertain, use null.\n"
            "3) Do not invent facts.\n"
            "4) Return JSON only, no markdown."
        )
