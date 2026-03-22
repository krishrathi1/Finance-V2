from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000)


class ChatResponse(BaseModel):
    answer: str
    source: str = "fallback"


class CompareAnalysisRequest(BaseModel):
    symbol_a: str = Field(..., min_length=1, max_length=50)
    symbol_b: str = Field(..., min_length=1, max_length=50)


class NewsAnalysisRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=500)
    summary: str = Field("", max_length=4000)
    source: str = Field("", max_length=200)
    published_at: str = Field("", max_length=200)
    sentiment_score: float = Field(0.5, ge=0.0, le=1.0)


class NewsAnalysisResponse(BaseModel):
    overview: str
    market_impact: str
    watchpoint: str
    source: str = "fallback"


class ReportResponse(BaseModel):
    symbol: str
    report_markdown: str
