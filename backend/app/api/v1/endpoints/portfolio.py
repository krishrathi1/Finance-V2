from typing import Any
from fastapi import APIRouter, UploadFile, File, HTTPException
import pdfplumber
import docx
import io
from app.services.ai_adapter import AIAdapter

router = APIRouter()
ai_adapter = AIAdapter()

@router.post("/parse-document")
async def parse_document(file: UploadFile = File(...)):
    """
    Accepts a portfolio document (PDF, DOCX, TXT), extracts text,
    and uses AI to parse it into structured holdings.
    """
    filename = file.filename.lower()
    content = await file.read()
    text = ""

    try:
        if filename.endswith(".pdf"):
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                text = "\n".join([page.extract_text() or "" for page in pdf.pages])
        elif filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            text = "\n".join([para.text for para in doc.paragraphs])
        elif filename.endswith(".txt") or filename.endswith(".csv"):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                text = content.decode("latin-1")
        else:
            raise HTTPException(
                status_code=400, 
                detail="Unsupported file format. Please upload a PDF, DOCX, or TXT file."
            )

        if not text.strip():
            raise HTTPException(
                status_code=400, 
                detail="The document appears to be empty or contains no readable text."
            )

        # Truncate text if it's extremely long to avoid LLM limits
        # (Usually 10k chars is plenty for a portfolio list)
        holdings = await ai_adapter.parse_portfolio_document(text[:12000])
        
        return {
            "success": True,
            "filename": file.filename,
            "holdings": holdings
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")
