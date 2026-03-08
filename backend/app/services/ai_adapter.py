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

    async def chat(self, symbol: str, question: str, context: dict[str, Any]) -> str:
        if self._gemini and settings.gemini_api_key:
            return await self._gemini.chat(symbol=symbol, question=question, context=context)
        return (
            f"Gemini API key not configured. Offline insight for {symbol}: "
            "review debt trends, operating margin trajectory, and 3-year earnings consistency before allocation."
        )

    async def generate_report(self, symbol: str, context: dict[str, Any]) -> str:
        if self._gemini and settings.gemini_api_key:
            return await self._gemini.generate_report(symbol=symbol, context=context)
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
