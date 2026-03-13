from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000)


class ChatResponse(BaseModel):
    answer: str
    source: str = "fallback"


class ReportResponse(BaseModel):
    symbol: str
    report_markdown: str
