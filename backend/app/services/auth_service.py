"""Authentication service with password hashing and JWT token management."""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Tuple

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Cookie
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.models import User


# Password hashing context (using argon2 for better Python 3.13+ support)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Hash a plain text password."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain text password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: int, is_admin: bool, tier: str) -> str:
    """
    Create a JWT access token.

    Args:
        user_id: User's database ID
        is_admin: Whether user is admin
        tier: User's subscription tier ('free' or 'premium')

    Returns:
        JWT token string
    """
    settings = get_settings()
    exp = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "admin": is_admin,
        "tier": tier,
        "exp": exp
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return token


def create_refresh_token() -> Tuple[str, str]:
    """
    Create a refresh token.

    Returns:
        Tuple of (raw_token, sha256_hash)
        Store only the hash in the database.
    """
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, token_hash


async def get_current_user(
    access_token: str | None = Cookie(default=None, alias="access_token"),
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """
    Dependency to get the current authenticated user from JWT cookie.

    Args:
        access_token: JWT from httpOnly cookie
        db: Database session

    Returns:
        Current User object

    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not access_token:
        raise credentials_exc

    try:
        settings = get_settings()
        payload = jwt.decode(
            access_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        user_id = int(payload.get("sub"))
    except (JWTError, KeyError, ValueError, TypeError):
        raise credentials_exc

    # Fetch user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or user.is_banned:
        raise credentials_exc

    return user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Dependency to enforce admin-only access.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user if admin

    Raises:
        HTTPException: If user is not admin
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def create_verification_token(user_id: int) -> str:
    """Create a short-lived JWT for email verification."""
    settings = get_settings()
    exp = datetime.utcnow() + timedelta(hours=24)
    payload = {"sub": str(user_id), "type": "email_verification", "exp": exp}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_email_token(token: str) -> int:
    """
    Verify email verification token and return user_id.
    
    Returns:
        user_id if valid
    
    Raises:
        HTTPException: if invalid or expired
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "email_verification":
            raise ValueError("Invalid token type")
        return int(payload.get("sub"))
    except (JWTError, KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
