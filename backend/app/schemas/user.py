from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional


class RegisterRequest(BaseModel):
    """User registration request."""
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=8, max_length=255)

    model_config = {"example": {
        "email": "user@example.com",
        "name": "John Doe",
        "password": "SecurePass123!"
    }}


class LoginRequest(BaseModel):
    """User login request."""
    email: EmailStr
    password: str = Field(..., min_length=1)

    model_config = {"example": {
        "email": "user@example.com",
        "password": "SecurePass123!"
    }}


class UserOut(BaseModel):
    """User response (no password)."""
    id: int
    email: str
    name: str
    tier: str  # 'free' or 'premium'
    is_admin: bool
    is_banned: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    """Token response for refresh endpoint."""
    access_token: str
    token_type: str = "bearer"


class PremiumRequestCreate(BaseModel):
    """Create premium upgrade request."""
    reason: str = Field(..., min_length=10, max_length=1000)

    model_config = {"example": {
        "reason": "I need advanced features for my portfolio analysis"
    }}


class PremiumRequestOut(BaseModel):
    """Premium request response."""
    id: int
    user_id: int
    reason: str
    status: str  # 'pending', 'approved', 'rejected'
    requested_at: datetime
    processed_at: Optional[datetime] = None
    processed_by: Optional[int] = None

    model_config = {"from_attributes": True}
